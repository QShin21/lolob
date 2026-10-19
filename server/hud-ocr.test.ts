import { createFixture as createSeed, emptyFixture } from './test-support/fixture';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import nativeFixture from './fixtures/hud-093.json';
import playerFixture from './fixtures/scoreboard-081.json';
import { EconomyBridge, parseGold, defaultEconomyConfig, readSpectatorGold, validateEconomyConfig, type OcrReading } from './economy';
import { closeSpectatorOcrWorker } from './spectator-ocr-worker';
import { ObjectiveCounterTracker, parseObjectiveCount, retainTeamGold, writableOcrMatch } from './hud-ocr';
import { defaultObjectiveRegions, currentOcrMatch, hudObjectives, postgameOcrView } from '../shared/hud-ocr';
import { applyAction, normalizeSavedState, publicState, resetRuntimeState } from './state';
import { finalizeGame, absorbTerminalGameSample } from './game-results';
import { currentGameResult, frozenGameState, reportGameResult } from '../shared/game-results';
import { programState } from '../shared/production';
import type { BroadcastState } from '../shared/types';

const champions=['Trundle','Elise','Lucian','Yunara','Nautilus','Yasuo','Nidalee','Sivir','Ziggs','Jhin'];
function liveState(): BroadcastState {
  const seed=createSeed();let state=applyAction(seed,{type:'set-mode',mode:'live'});
  state=applyAction(state,{type:'load-match',matchId:'m1'});state=applyAction(state,{type:'set-match',patch:{blueScore:0,redScore:0}});
  state.gameTime=855;state.activeSourceGameId='test-093';state.phase='live';
  state.players=champions.map((championId,i)=>({...seed.players[i],id:championId,championId,team:i<5?'blue':'red',gold:null,statsSource:'api',statsAvailable:true}));
  return state;
}
function fixtureBridge(){
  let state=liveState(),now=100000;
  let reading:OcrReading={...playerFixture,ok:true,blueText:'60.5k',redText:'68.2k',objectiveTexts:nativeFixture.expected};
  const bridge=new EconomyBridge(()=>state,work=>work(state),{now:()=>now,capture:async()=>reading});
  bridge.configure({...defaultEconomyConfig,enabled:true});bridge.observePlayers(state.players,state.gameTime);
  return {bridge,get state(){return state;},setState(value:BroadcastState){state=value;},advance(ms=500){now+=ms;state.gameTime+=ms/1000;},reading(value:OcrReading){reading=value;}};
}
test('HUD count parser keeps genuine zero and rejects missing or ambiguous text',()=>{
  for(const [text,value]of [['0',0],['3',3],['11',11],[' ７ ',7],['99',99]]as const)assert.equal(parseObjectiveCount(text),value);
  for(const text of ['',null,undefined,0,'O','I','1 1','3k','1.0','-1','00','100','2/3','3%'])assert.equal(parseObjectiveCount(text),undefined,String(text));
});
test('four digit regions mirror native icon order; validation preserves independent settings',()=>{
  assert.deepEqual(hudObjectives,['towers','dragons','barons','voidgrubs']);
  assert.ok(defaultObjectiveRegions.blue.dragons.x<defaultObjectiveRegions.blue.barons.x);
  assert.ok(defaultObjectiveRegions.red.towers.x<defaultObjectiveRegions.red.voidgrubs.x);
  const config={...defaultEconomyConfig,objectives:{enabled:true,regions:structuredClone(defaultObjectiveRegions)}};
  assert.deepEqual(validateEconomyConfig(config),config);
  config.objectives.regions.red.dragons={...config.objectives.regions.blue.dragons};
  assert.throws(()=>validateEconomyConfig(config),/不能重叠/);
  config.objectives.regions.red.dragons={x:.75,y:.3,width:.02,height:.02};
  assert.throws(()=>validateEconomyConfig(config),/顶部/);
});
test('objective cells confirm on consecutive captures, age independently, reject decreases and gaps',()=>{
  const s=liveState(),data=writableOcrMatch(s)!,tracker=new ObjectiveCounterTracker();
  assert.deepEqual(tracker.accept(nativeFixture.expected,data,100000,855),{blue:{},red:{}});
  assert.deepEqual(tracker.accept(nativeFixture.expected,data,100000,855),{blue:{},red:{}});
  const accepted=tracker.accept(nativeFixture.expected,data,100500,855.5);
  assert.equal(accepted.blue.voidgrubs?.value,0);Object.assign(data.objectives.blue,accepted.blue);Object.assign(data.objectives.red,accepted.red);
  const partial=tracker.accept({blue:{towers:'4'},red:{towers:'7'}},data,101000,856);
  assert.equal(partial.blue.towers,undefined);assert.equal(partial.red.towers?.value,7);
  tracker.accept({blue:{towers:'6'}},data,101500,856.5);tracker.accept({},data,102000,857);
  assert.equal(tracker.accept({blue:{towers:'6'}},data,102500,857.5).blue.towers,undefined);
  assert.equal(tracker.accept({blue:{towers:'6'}},data,103000,858).blue.towers?.value,6);
  tracker.clear();assert.equal(tracker.accept({red:{barons:'2'}},data,105000,860).red.barons,undefined);
  assert.equal(tracker.accept({red:{barons:'2'}},data,116000,871).red.barons,undefined);
});
test('player gold, eight HUD counts and curve survive live expiry, confirmation, terminal API and disk reload',async()=>{
  const f=fixtureBridge();await f.bridge.probe();f.advance();await f.bridge.probe();
  const archive=f.state.ocrMatch!;assert.equal(Object.keys(archive.players).length,10);
  assert.equal(archive.players.Trundle.value,4343);assert.equal(archive.objectives.blue.voidgrubs?.value,0);
  for(const side of ['blue','red']as const)for(const key of hudObjectives)assert.equal(archive.objectives[side][key]?.value,Number(nativeFixture.expected[side][key]));
  const samples=JSON.parse(JSON.stringify(archive));f.advance(11000);
  f.reading({ok:false,error:'HUD hidden'});await f.bridge.probe();assert.equal(f.state.players[0].gold,null);
  assert.deepEqual(f.state.ocrMatch,samples);
  const result=finalizeGame(f.state,{source:'manual',winner:'red',terminal:false})!;
  assert.equal(result.snapshot.ocrMatch?.players.Trundle.value,4343);
  const view=postgameOcrView(frozenGameState(f.state));assert.equal(view.players[0].gold,4343);assert.equal(view.economy[0].source,'ocr');
  const finalPlayers=f.state.players.map(p=>({...p,gold:null}));
  absorbTerminalGameSample(f.state,{players:finalPlayers,stats:f.state.stats,events:[],gameTime:f.state.gameTime+1,ended:true,sourceGameId:'test-093'});
  assert.equal(postgameOcrView(frozenGameState(f.state)).players[0].gold,4343);
  const restored=normalizeSavedState(JSON.parse(JSON.stringify(publicState(f.state))));resetRuntimeState(restored);
  assert.deepEqual(currentGameResult(restored)?.snapshot.ocrMatch,result.snapshot.ocrMatch);
  assert.equal(restored.recordings.find(r=>r.id===result.id)?.ocrMatch?.objectives.red.towers?.value,7);
  const revision=JSON.stringify(result.snapshot);await f.bridge.probe();assert.equal(JSON.stringify(result.snapshot),revision);f.bridge.close();
});
test('unfinished OCR archive survives restart only for its source, roster and game',async()=>{
  const f=fixtureBridge();await f.bridge.probe();f.advance();await f.bridge.probe();f.bridge.close();
  const restored=normalizeSavedState(JSON.parse(JSON.stringify(publicState(f.state))));resetRuntimeState(restored);
  assert.equal(currentOcrMatch(restored)?.players.Trundle.value,4343);
  const bridge=new EconomyBridge(()=>restored,work=>work(restored),{now:()=>112000,capture:async()=>({ok:false})});
  bridge.observePlayers(f.state.players,866);assert.equal(restored.ocrMatch?.players.Trundle.value,4343);
  restored.activeSourceGameId='different-game';bridge.status();assert.equal(restored.ocrMatch,undefined);bridge.close();
});
test('next game and new attempt drop active OCR without contaminating held Program or historical report',async()=>{
  const f=fixtureBridge();await f.bridge.probe();f.advance();await f.bridge.probe();
  finalizeGame(f.state,{source:'manual',winner:'blue',terminal:true});
  let s=applyAction(f.state,{type:'take',scene:'postgame'});s=applyAction(s,{type:'next-game'});
  assert.equal(s.ocrMatch,undefined);s.activeSourceGameId='game-two';
  assert.equal(postgameOcrView(programState(s)).players[0].gold,4343);
  assert.equal(postgameOcrView(frozenGameState(s,reportGameResult(s))).players[0].gold,4343);
  f.setState(s);f.bridge.status();assert.equal(s.ocrMatch,undefined);
  delete s.awaitingNextGame;s.phase='live';s.players=liveState().players;s.gameTime=30;
  writableOcrMatch(s);s.production!.attempt++;f.bridge.status();assert.equal(s.ocrMatch,undefined);f.bridge.close();
});
test('in-flight samples are discarded after result confirmation or a replay seek',async()=>{
  let finish!:(value:OcrReading)=>void;const s=liveState();
  const bridge=new EconomyBridge(()=>s,work=>work(s),{now:()=>100000,capture:()=>new Promise(resolve=>{finish=resolve;})});
  bridge.configure({...defaultEconomyConfig,enabled:true});const pending=bridge.probe();
  const result=finalizeGame(s,{source:'manual',winner:'blue'})!;finish({ok:true,blueText:'60k',redText:'61k',objectiveTexts:nativeFixture.expected});await pending;
  assert.equal(s.ocrMatch,undefined);assert.equal(result.snapshot.ocrMatch,undefined);bridge.close();
  const f=fixtureBridge();await f.bridge.probe();f.advance();await f.bridge.probe();f.state.gameTime=10;f.bridge.resolve(10,f.state.stats);assert.equal(f.state.ocrMatch,undefined);f.bridge.close();
});
test('the first in-flight OCR capture cannot cross a source-game identity change',async()=>{
  let finish!:(value:OcrReading)=>void;const s=liveState();
  const bridge=new EconomyBridge(()=>s,work=>work(s),{now:()=>100000,capture:()=>new Promise(resolve=>{finish=resolve;})});
  bridge.configure({...defaultEconomyConfig,enabled:true});const pending=bridge.probe();s.activeSourceGameId='new-source';
  finish({ok:true,blueText:'60k',redText:'61k',objectiveTexts:nativeFixture.expected});await pending;assert.equal(s.ocrMatch,undefined);bridge.close();
});
test('postgame never substitutes API damage, API gold, CS, items or default objective zeros for OCR',()=>{
  const s=liveState();s.players[0].damageDealt=90000;s.players[0].gold=12345;s.players[0].goldSource='api';
  const view=postgameOcrView(s);assert.equal(view.players[0].gold,null);assert.equal(view.stats.blue.gold,null);assert.deepEqual(view.economy,[]);assert.equal(currentOcrMatch(view),undefined);
});
test('five-second curve bins retain long matches with genuine gaps and original sample times',()=>{
  const data=writableOcrMatch(liveState())!;for(let i=0;i<7200;i++)retainTeamGold(data,2500+i*20,2500+i*21,100000+i*1000,i);
  assert.equal(data.economy.length,1440);assert.equal(data.economy[0].time,4);assert.equal(data.economy.at(-1)?.time,7199);
  retainTeamGold(data,150000,160000,7400000,7300);assert.equal(data.economy.at(-1)?.time,7300);assert.equal(data.economy.at(-2)?.time,7199);
});
test('Windows production worker reads native HUD glyph pixels, including blue zero', {skip:process.platform!=='win32'},async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'riftcast-hud-093-'));
  try{
    const file=path.join(directory,'hud.png');
    await sharp({create:{width:nativeFixture.width,height:nativeFixture.height,channels:3,background:'#000000'}})
      .composite(nativeFixture.patches.map(p=>{const pixels=Buffer.alloc(p.width*p.rows.length*3);p.rows.forEach((row,y)=>{const bits=BigInt('0x'+row);for(let x=0;x<p.width;x++)if(bits&(1n<<BigInt(x)))for(let c=0;c<3;c++)pixels[(y*p.width+x)*3+c]=p.color[c];});return {input:pixels,raw:{width:p.width,height:p.rows.length,channels:3 as const},left:p.left,top:p.top};})).png().toFile(file);
    const config={enabled:true,blue:{x:691/1655,y:14/927,width:48/1655,height:24/927},red:{x:954/1655,y:14/927,width:49/1655,height:24/927},players:{enabled:false,region:{x:0,y:.4,width:1,height:.6}},objectives:{enabled:true,regions:defaultObjectiveRegions}};
    const result=await readSpectatorGold(config,[],file);
    assert.equal(result.ok,true,JSON.stringify(result));assert.equal(parseGold(result.blueText),60500);assert.equal(parseGold(result.redText),68200);
    assert.deepEqual(result.objectiveTexts,nativeFixture.expected,JSON.stringify(result));assert.equal(result.objectiveError,undefined);
  }finally{await closeSpectatorOcrWorker();await rm(directory,{recursive:true,force:true});}
});
