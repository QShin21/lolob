import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { mountVdoNinjaRoutes, VdoNinjaService } from './vdo-ninja';
import { ControlSeats } from './control-seats';
import { vdoUrls } from '../shared/vdo-ninja';
import { createFixture } from './test-support/fixture';

test('VDO URLs use official push/view parameters, bounded labels, and silent viewer output', () => {
  const value=vdoUrls('0123456789abcdefgh','中文 & ? # 选手');const send=new URL(value.inviteUrl),view=new URL(value.viewUrl);
  assert.equal(send.origin,'https://vdo.ninja');assert.equal(send.searchParams.get('label'),'中文 & ? # 选手');
  assert.equal(send.searchParams.get('push'),view.searchParams.get('view'));assert(view.searchParams.has('noaudio'));assert(view.searchParams.has('cleanoutput'));assert(!view.searchParams.has('push'));
  assert.throws(()=>vdoUrls('bad/id','name'));
});
test('links persist and generation is idempotent while rotation only changes one member', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'rift-vdo-')),file=path.join(dir,'vdo.json'),state=createFixture();
  try {
    const service=new VdoNinjaService(file);await service.load();
    const first=await service.update(state,{op:'generate'});assert.equal(first.invitations.length,10);assert.equal(first.enabled,false);assert(first.feeds.every(f=>!f.viewUrl));
    assert.deepEqual((await service.update(state,{op:'generate'})).invitations,first.invitations);
    await service.update(state,{op:'enabled',enabled:true});const reloaded=new VdoNinjaService(file);await reloaded.load();
    assert.equal(reloaded.snapshot(state).enabled,true);assert.equal(reloaded.snapshot(state).feeds.filter(f=>f.viewUrl).length,10);
    const old=first.invitations[0],rotated=await reloaded.update(state,{op:'rotate',teamId:old.teamId,playerId:old.playerId});
    assert.notEqual(rotated.invitations[0].streamId,old.streamId);assert.deepEqual(rotated.invitations.slice(1),first.invitations.slice(1));
    assert.equal(JSON.parse(await readFile(file,'utf8')).bindings.length,10);
    assert.equal((await reloaded.update(state,{op:'clear'})).invitations.length,0);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('registered identity survives display rename and team side swap; ambiguous live slots remain blank', async () => {
  const state=createFixture(),service=new VdoNinjaService();await service.update(state,{op:'generate'});await service.update(state,{op:'enabled',enabled:true});
  state.players.forEach(p=>{p.registeredPlayerId=state.teams.find(t=>t.id===state.match[`${p.team}TeamId`])!.players.find(m=>m.role===p.role)!.id;});
  const original=service.snapshot(state).feeds.find(f=>f.side==='blue'&&f.slot===0)!;
  state.teams[0].players[0].name='新选手显示名';state.players[0].name='游戏匿名名';
  assert.equal(service.snapshot(state).feeds.find(f=>f.side==='blue'&&f.slot===0)!.viewUrl,original.viewUrl);
  [state.match.blueTeamId,state.match.redTeamId]=[state.match.redTeamId,state.match.blueTeamId];state.players.forEach(p=>{p.team=p.team==='blue'?'red':'blue';});
  assert.equal(service.snapshot(state).feeds.find(f=>f.side==='red'&&f.slot===0)!.viewUrl,original.viewUrl);
  state.players[1].role='上单';assert.equal(service.snapshot(state).feeds.find(f=>f.side==='red'&&f.slot===0)!.viewUrl,undefined);
  state.phase='draft';assert.equal(service.snapshot(state).feeds.find(f=>f.side==='red'&&f.slot===0)!.viewUrl,original.viewUrl);
  state.teams[0].players[1].role='上单';assert.equal(service.snapshot(state).feeds.find(f=>f.side==='red'&&f.slot===0)!.viewUrl,undefined);
});
test('unknown members and invalid operations never inherit another player stream', async () => {
  const state=createFixture(),service=new VdoNinjaService();await service.update(state,{op:'generate'});await service.update(state,{op:'enabled',enabled:true});
  state.players[0].name='Unmatched';assert.equal(service.snapshot(state).feeds[0].viewUrl,undefined);
  state.teams[0].players[0].id=undefined;assert(service.snapshot(state).warnings.length>0);
  await assert.rejects(service.update(state,{op:'rotate',teamId:'wrong',playerId:'wrong'}));
  await assert.rejects(service.update(state,{op:'enabled',enabled:'yes'}));
});

test('camera output links are available only to loopback consumers and never expose invitations remotely',async()=>{
 const state=createFixture(),service=new VdoNinjaService(),routes=new Map<string,Function>();await service.update(state,{op:'generate'});await service.update(state,{op:'enabled',enabled:true});
 await mountVdoNinjaRoutes({get:(p:string,h:Function)=>routes.set(p,h),post:()=>{}} as never,{getState:()=>state,authorize:()=>{},service});
 for(const remoteAddress of ['192.168.1.30','::ffff:192.168.1.30',undefined,'127.0.0.1','::1','::ffff:127.0.0.1']){
   let status=200,body:any;const response={setHeader:()=>{},status:(v:number)=>{status=v;return response;},json:(v:unknown)=>{body=v;}};
   routes.get('/api/vdo-ninja/feeds')!({socket:{remoteAddress}},response);
   if(remoteAddress?.includes('127.0.0.1')||remoteAddress==='::1'){assert.equal(status,200);assert.equal(body.feeds.filter((f:any)=>f.viewUrl).length,10);}else{assert.equal(status,403);assert.equal(body.feeds,undefined);assert(!JSON.stringify(body).includes('vdo.ninja'));}
 }
});

test('queued camera updates recheck the current director after another seat takes ownership',async()=>{
 const state=createFixture(),seats=new ControlSeats(),owner=seats.issue({role:'director'},true),replacement=seats.issue({role:'director'},true),service=new VdoNinjaService();
 let handler!:Function,release!:()=>void,started!:()=>void;const hold=new Promise<void>(r=>release=r),entered=new Promise<void>(r=>started=r),update=service.update.bind(service);let calls=0;
 service.update=async(s,input)=>{calls++;if(calls===1){started();await hold;}return update(s,input);};
 await mountVdoNinjaRoutes({get:()=>{},post:(_p:string,h:Function)=>handler=h} as never,{getState:()=>state,authorize:req=>{seats.authorize(req.headers['x-seat-token'],'output');},service});
 const request=(body:unknown)=>new Promise<unknown>((resolve,reject)=>{const res={json:resolve,status:()=>res};handler({body,headers:{'x-seat-token':owner.token}},res,reject);});
 const first=request({op:'generate'});await entered;const second=request({op:'enabled',enabled:true});seats.claim(replacement.token,'接管回归');release();await first;await assert.rejects(second,/当前主导播/);assert.equal(calls,1);assert.equal(service.snapshot(state).enabled,false);
});
