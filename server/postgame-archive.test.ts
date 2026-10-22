import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';
import { PassThrough } from 'node:stream';
import { Open } from 'unzipper';
import { createHash } from 'node:crypto';
import { createFixture } from './test-support/fixture';
import { finalizeGame } from './game-results';
import { fallbackChampions } from './state';
import { enrichPostgame } from './postgame-data';
import { PostgameArchiveStore, PostgameCollector, validArchivePayload } from './postgame-archive';
import { tournamentReport, tournamentCsv } from '../shared/tournament-report';
import { buildTournament } from '../shared/tournaments';
import { exportTournament } from './tournament-export';

const setup = () => {
  const s = createFixture();s.players.forEach(p => {p.statsSource='api';p.statsGameTime=s.gameTime;});s.events=[];
  const r=finalizeGame(s,{source:'lcu',sourceGameId:'12345'})!;
  const catalog=fallbackChampions();
  const payload={gameId:12345,gameLength:2000,winningTeamId:200,teams:[100,200].map((teamId,i)=>({teamId,players:r.snapshot.players.filter(p=>p.team===(i?'red':'blue')).map(p=>({championId:catalog.find(c=>c.id===p.championId)!.key,stats:{CHAMPIONS_KILLED:0,NUM_DEATHS:1,ASSISTS:2,MINIONS_KILLED:150,NEUTRAL_MINIONS_KILLED:10,GOLD_EARNED:12000,TOTAL_DAMAGE_DEALT_TO_CHAMPIONS:0,TOTAL_DAMAGE_TAKEN:100,VISION_SCORE:20,ITEM0:1001,ITEM1:0,ITEM2:0,ITEM3:0,ITEM4:0,ITEM5:0,ITEM6:3340,EXTRA_PRESERVED_FIELD:99}}))}))};
  return {s,r,payload,catalog};
};
test('raw responses retain all fields, hashes, source identity and survive reopening',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'riftcast-archive-test-'));
  try{
    const {s,r,payload,catalog}=setup(),store=new PostgameArchiveStore(dir),collector=new PostgameCollector(store,()=>s,f=>f(s),()=>catalog);
    await Promise.all([collector.capture(r.id,'eog',payload),collector.capture(r.id,'eog',payload)]);
    assert.equal(r.archive!.sources.eog!.attempts,1);
    assert.equal(r.winner,'red');assert.equal(r.snapshot.players[0].kills,0);assert.equal(r.snapshot.players[0].cs,160);assert.equal(r.snapshot.players[0].damageDealt,0);assert.equal(r.terminalSampleComplete,true);
    const raw=await new PostgameArchiveStore(dir).read(r.id,'eog');assert.deepEqual(raw.payload,payload);
    const bytes=await readFile(path.join(dir,r.id,'eog.json'));assert.equal(createHash('sha256').update(bytes).digest('hex'),r.archive!.sources.eog!.sha256);
    assert.equal(await store.read(r.id,'timeline'),undefined);
    await assert.rejects(()=>store.save('../escape','eog','12345',payload),/ID/);
    await collector.close();
  }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));await rm(dir,{recursive:true,force:true});}
});
test('partial official payload does not mark older observed values as a complete final sample',()=>{
  const {s,r,payload,catalog}=setup();
  for(const t of payload.teams)for(const p of t.players)delete (p.stats as any).NEUTRAL_MINIONS_KILLED;
  enrichPostgame(s,payload,catalog);assert.equal(r.terminalSampleComplete,false);
  const wrong={...payload,gameId:99999};const previous=JSON.stringify(r);enrichPostgame(s,wrong,catalog);assert.equal(JSON.stringify(r),previous);
});
test('terminal Live response is retained under result identity before a client game ID arrives',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'riftcast-archive-test-'));
  try{
    const {s,r,catalog}=setup();delete r.sourceGameId;
    const store=new PostgameArchiveStore(dir),collector=new PostgameCollector(store,()=>s,f=>f(s),()=>catalog);
    await collector.capture(r.id,'live',{gameData:{gameTime:1800},allPlayers:[{summonerName:'observed-player'}],events:{Events:[]}});
    assert.equal(r.archive!.sources.live!.status,'saved');assert.equal((await store.read(r.id,'live')).resultId,r.id);
  }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));await rm(dir,{recursive:true,force:true});}
});
test('late collection targets its archived game; failed sources retry and recover saved files',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'riftcast-archive-test-'));
  try{
    const {s,r,payload,catalog}=setup(),store=new PostgameArchiveStore(dir),collector=new PostgameCollector(store,()=>s,f=>f(s),()=>catalog);
    s.match.seriesId='different-series';s.match.blueScore=0;s.match.redScore=0;delete s.finishedGameId;
    await collector.capture(r.id,'eog',{...payload,gameId:777});assert.equal(r.archive!.sources.eog!.status,'pending');assert.equal(r.winner,null);
    await collector.capture(r.id,'eog',payload);assert.equal(r.winner,'red');assert.equal(s.match.redScore,0);
    await store.save(r.id,'details','12345',{gameId:12345,participants:[{stats:{any:1}}],teams:[]});
    let requests=0;await collector.tick(async()=>{requests++;throw new Error('offline');});
    assert.equal(requests,0);assert.equal(r.archive!.sources.details!.status,'saved');
    await collector.tick(async()=>{requests++;throw new Error('offline');});assert.equal(r.archive!.sources.timeline!.status,'pending');assert.match(r.archive!.sources.timeline!.detail!,/offline/);
    assert.equal(validArchivePayload('timeline','12345',{frames:[]}),false);
    assert.equal(validArchivePayload('timeline','12345',{gameId:99,frames:[{}]}),false);
  }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));await rm(dir,{recursive:true,force:true});}
});
test('event export includes scoped results, raw payloads, assets and verifiable missing-source manifest',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'riftcast-archive-test-'));
  try{
    const {s,r,payload}=setup(),store=new PostgameArchiveStore(dir);
    const {tournament:t,matches}=buildTournament('event-test',{name:'=CSV 安全',format:'single-elimination',teamIds:s.teams.slice(0,2).map(t=>t.id),bestOf:'BO1',finalBestOf:'BO1',startAt:new Date().toISOString(),intervalMinutes:60,legs:1,groupCount:2,advancePerGroup:1,swissRounds:1,grandFinalReset:true},s.teams);
    s.schedule=matches;s.tournaments=[t];r.matchId=matches[0].id;r.tournamentId=t.id;
    await store.save(r.id,'eog','12345',payload);
    const report=tournamentReport(s,t);assert.equal(report.results.length,1);assert.equal(report.players.length,10);
    assert.match(tournamentCsv(s,t),/'=CSV 安全/);
    const response=new PassThrough()as any,responseBytes:Buffer[]=[];response.type=()=>response;response.setHeader=()=>response;response.on('data',(b:Buffer)=>responseBytes.push(b));
    await exportTournament(s,t,store,dir,response);
    const zip=await Open.buffer(Buffer.concat(responseBytes));
    const manifest=JSON.parse((await buffer(zip.files.find(f=>f.path==='manifest.json')!.stream())).toString());
    assert.ok(manifest.missing.some((f:any)=>f.path.endsWith('/timeline.json')));
    assert.ok(zip.files.some(f=>f.path===`games/${r.id}/eog.json`));
    for(const item of manifest.files){const bytes=await buffer(zip.files.find(f=>f.path===item.path)!.stream());assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);}
  }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));await rm(dir,{recursive:true,force:true});}
});
