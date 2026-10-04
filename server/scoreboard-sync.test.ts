import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EconomyBridge, defaultEconomyConfig, defaultPlayerGoldRegion } from './economy';
import { applyAction, createSeed } from './state';
import type { Player } from '../shared/types';
import type { OcrReading } from './economy';

function scoreboardFixture(){
  const roster:Player[]=Array.from({length:10},(_,index)=>({id:`fixture-${index}`,name:`Player ${index}`,team:index<5?'blue':'red',championId:`Champion${index}`,championName:`Champion ${index}`,role:'待分路',level:5,kills:index,deaths:1,assists:2,cs:51+index,gold:null,items:[],statsSource:'api'}));
  const reading=(gold:boolean,increment=0):OcrReading=>({ok:true,
    playerPortraits:roster.map((player,index)=>({team:player.team,championId:player.championId,x:player.team==='blue'?.48:.50,y:.693+(index%5)*.05,width:.019,height:.035,score:.99,margin:.2})),
    playerWords:roster.flatMap((player,index)=>{const blue=player.team==='blue',y=.7+(index%5)*.05;return [
      ...(gold?[{text:`${100+index}(${2000+index})`,x:blue?.3:.68,y,width:.06,height:.02}]:[]),
      {text:`${player.kills}/${player.deaths}/${player.assists}`,x:blue?.4:.58,y,width:.04,height:.02},
      {text:String(player.cs+increment),x:blue?.46:.55,y,width:.02,height:.02}
    ];})});
  return {roster,reading};
}

test('equipment updates exact statistics independently while prior gold keeps its original timestamp and chart point',async()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.gameTime=100;const fixture=scoreboardFixture();state.players=structuredClone(fixture.roster);
  let now=100000,reading=fixture.reading(true);const bridge=new EconomyBridge(()=>state,work=>work(state),{now:()=>now,capture:async()=>reading});
  bridge.observePlayers(fixture.roster,100);bridge.configure({...defaultEconomyConfig,players:{enabled:true,region:defaultPlayerGoldRegion}});await bridge.probe();
  const goldAt=state.players[0].goldSampledAt;assert.equal(state.economyFeed?.players?.statsMatched,10);assert.equal(state.economy.length,1);
  now+=1000;state.gameTime=101;reading=fixture.reading(false,1);await bridge.probe();
  assert.equal(state.players[0].cs,52);assert.equal(state.players[0].gold,2000);assert.equal(state.players[0].goldSampledAt,goldAt);assert.equal(state.players[0].goldGameTime,100);
  assert.equal(state.players[0].statsGameTime,101);assert.equal(Date.parse(state.players[0].statsExpiresAt!)-Date.parse(state.players[0].statsSampledAt!),3000);
  assert.equal(state.economyFeed?.players?.statsMatched,10);assert.equal(state.economy.length,1);assert.equal(state.economy[0].time,100);
  reading={ok:false,playerError:'计分板被遮挡'};now+=3001;await bridge.poll();
  assert.equal(state.players[0].cs,51);assert.equal(state.players[0].statsSource,'api');assert.equal(state.players[0].gold,2000);assert.equal(state.economyFeed?.players?.statsMatched,0);
  now=110001;await bridge.poll();assert.equal(state.players[0].gold,null);assert.equal(state.stats.blue.gold,null);
});

test('an equipment-only first sample supplies all ten exact statistics and leaves missing economy unavailable',async()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.gameTime=100;const fixture=scoreboardFixture();state.players=fixture.roster;
  const bridge=new EconomyBridge(()=>state,work=>work(state),{capture:async()=>fixture.reading(false,2)});bridge.observePlayers(fixture.roster,100);bridge.configure({...defaultEconomyConfig,players:{enabled:true,region:defaultPlayerGoldRegion}});await bridge.probe();
  assert.equal(state.economyFeed?.players?.statsMatched,10);assert.equal(state.economyFeed?.players?.matched,0);assert.ok(state.players.every(player=>player.statsSource==='ocr'&&player.gold===null));assert.equal(state.players[9].cs,62);assert.equal(state.stats.blue.gold,null);assert.deepEqual(state.economy,[]);
});

test('a regressing OCR statistic cannot refresh an older accepted reading',async()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.gameTime=100;const fixture=scoreboardFixture();state.players=fixture.roster;let now=100000,reading=fixture.reading(false,5);
  const bridge=new EconomyBridge(()=>state,work=>work(state),{now:()=>now,capture:async()=>reading});bridge.observePlayers(fixture.roster,100);bridge.configure({...defaultEconomyConfig,players:{enabled:true,region:defaultPlayerGoldRegion}});await bridge.probe();const sampledAt=state.players[0].statsSampledAt;
  now+=1000;state.gameTime=101;reading=fixture.reading(false,4);await bridge.probe();assert.equal(state.players[0].cs,56);assert.equal(state.players[0].statsSampledAt,sampledAt);
  now+=2001;reading={ok:false};await bridge.poll();assert.equal(state.players[0].cs,51);assert.equal(state.players[0].statsSource,'api');
});

test('capture metadata starts the freshness window at frame acquisition after slow initialization',async()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.gameTime=100;const fixture=scoreboardFixture();state.players=fixture.roster;let now=100000;
  const bridge=new EconomyBridge(()=>state,work=>work(state),{now:()=>now,capture:async()=>{now+=5000;const capturedAt=now;state.gameTime=105;now+=400;return {...fixture.reading(false),capturedAt,capturedGameTime:105};}});
  bridge.observePlayers(fixture.roster,100);bridge.configure({...defaultEconomyConfig,players:{enabled:true,region:defaultPlayerGoldRegion}});await bridge.probe();assert.equal(state.economyFeed?.players?.statsMatched,10);assert.equal(state.economyFeed?.players?.durationMs,5400);assert.equal(state.players[0].statsGameTime,105);assert.equal(state.players[0].statsSampledAt,new Date(105000).toISOString());
});

test('500 ms player polling avoids overlap and ignores in-flight reads after shutdown',async()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.gameTime=100;const fixture=scoreboardFixture();state.players=fixture.roster;let now=100000,calls=0,finish:(reading:OcrReading)=>void=()=>{};
  const bridge=new EconomyBridge(()=>state,work=>work(state),{now:()=>now,capture:async()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});bridge.observePlayers(fixture.roster,100);bridge.configure({...defaultEconomyConfig,players:{enabled:true,region:defaultPlayerGoldRegion}});
  const first=bridge.poll();await bridge.poll();now+=499;await bridge.poll();assert.equal(calls,1);finish(fixture.reading(false));await first;
  now++;const second=bridge.poll();assert.equal(calls,2);bridge.close();finish(fixture.reading(false,1));await second;now+=1000;await bridge.poll();assert.equal(calls,2);assert.equal(state.players[0].cs,51);
});

test('scoreboard observations update exact CS and KDA, team kills and gold, then restore API statistics after expiry',async()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.gameTime=100;
  const roster:Player[]=Array.from({length:10},(_,index)=>({id:`live-${index}`,name:`Player ${index}`,team:index<5?'blue':'red',championId:`Champion${index}`,championName:`Champion ${index}`,role:'待分路',level:5,kills:index,deaths:1,assists:2,cs:51+index,gold:null,items:[],statsSource:'api'}));
  state.players=structuredClone(roster);let now=100000;let captureAvailable=true;
  const playerWords=roster.flatMap((player,index)=>{
    const blue=player.team==='blue',y=.7+(index%5)*.05;
    return [
      {text:`${100+index}(${2000+index})`,x:blue?.3:.68,y,width:.06,height:.02},
      {text:`${player.kills}/${player.deaths}/${player.assists}`,x:blue?.4:.58,y,width:.04,height:.02},
      {text:String(player.cs),x:blue?.46:.55,y,width:.02,height:.02}
    ];
  });
  const bridge=new EconomyBridge(()=>state,work=>work(state),{now:()=>now,capture:async()=>captureAvailable?({ok:true,playerWords}):({ok:false,playerError:'计分板未提供'})});
  bridge.observePlayers(roster,100);bridge.configure({...defaultEconomyConfig,players:{enabled:true,region:defaultPlayerGoldRegion}});
  await bridge.probe();assert.equal(state.economyFeed?.players?.matched,10);assert.equal(state.players[0].gold,2000);assert.equal(state.players[0].currentGold,100);assert.equal(state.players[0].statsSource,'ocr');assert.equal(state.stats.blue.kills,10);assert.equal(state.stats.red.kills,35);assert.equal(state.stats.blue.gold,10010);assert.equal(state.stats.red.gold,10035);assert.match(state.economyFeed!.detail,/同一画面十名/);
  const roundedApi=roster.map(player=>({...player,cs:Math.floor(player.cs/10)*10,kills:player.kills+1,statsSampledAt:new Date(now+1000).toISOString()}));
  bridge.observePlayers(roundedApi,101);state.players=bridge.resolvePlayers(roundedApi);
  assert.equal(state.players[0].cs,51);assert.equal(state.players[0].kills,0);assert.equal(state.players[0].gold,2000);
  captureAvailable=false;now+=10001;await bridge.poll();assert.equal(state.players[0].cs,50);assert.equal(state.players[0].kills,1);assert.equal(state.players[0].statsSource,'api');assert.equal(state.players[0].statsExpiresAt,undefined);assert.equal(state.players[0].gold,null);assert.equal(state.stats.blue.gold,null);
  const replacement=roundedApi.map(player=>({...player,id:`new-${player.id}`}));bridge.observePlayers(replacement,101);assert.ok(bridge.resolvePlayers(replacement).every(player=>player.gold===null&&player.statsSource==='api'));
});

test('production player sampling cannot refresh a retained OBS texture after the game API disconnects',async()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});
  state.settings.economyOcr={...defaultEconomyConfig,players:{enabled:true,region:defaultPlayerGoldRegion}};
  const now=Date.now();let captured=0;
  const bridge=new EconomyBridge(()=>state,work=>work(state),{now:()=>now,frame:async()=>{captured++;throw new Error('retained frame must not be read');}});
  for(const connection of [
    {status:'error' as const,detail:'game closed',updatedAt:new Date(now).toISOString()},
    {status:'connected' as const,detail:'old sample',updatedAt:new Date(now-60000).toISOString()}
  ]){
    state.connections.live=connection;await bridge.probe();assert.equal(captured,0);assert.equal(state.economyFeed?.players?.matched,0);assert.match(state.economyFeed!.players!.detail,/未连接或已过期/);
  }
});
