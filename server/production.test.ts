import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed, applyAction, normalizeSavedState, publicState, resetRuntimeState, csvRecording } from './state';
import { captureProgram, programState, ensureProduction, checkValid, productionKey } from '../shared/production';
import { currentGameResult } from '../shared/game-results';
import { getFearlessBans } from './draft-history';
import { normalizeDraft, Adapters, ChampionCatalog } from './adapters';
import { finalizeGame, absorbTerminalGameSample } from './game-results';
import { ControlSeats } from './control-seats';
import { tickPlayerFeeds } from '../shared/player-feeds';

test('same-scene TAKE stages manual configuration while current-match telemetry continues',()=>{
  let s=createSeed();s.previewScene='live';const before=structuredClone(programState(s));
  s=applyAction(s,{type:'set-match',patch:{title:'待播标题'}});
  s=applyAction(s,{type:'set-overlay',patch:{ticker:true,tickerText:'待播字幕'}});
  const teams=structuredClone(s.teams);teams[0].players[0].name='待播名';
  s=applyAction(s,{type:'set-teams',teams});s.players[0].cs+=7;s.gameTime+=5;
  assert.equal(programState(s).match.title,before.match.title);
  assert.equal(programState(s).overlay.tickerText,before.overlay.tickerText);
  assert.equal(programState(s).players[0].name,before.players[0].name);
  assert.equal(programState(s).players[0].cs,before.players[0].cs+7);
  assert.equal(programState(s).gameTime,before.gameTime+5);
  s=applyAction(s,{type:'take'});
  assert.equal(programState(s).match.title,'待播标题');assert.equal(programState(s).players[0].name,'待播名');
  assert.equal(s.production?.program?.version,s.production?.configVersion);
});

for(const scene of ['live','postgame','interview','draft','lineup','schedule'] as const)test(`${scene} retains the full previous-game context during next-game preparation`,()=>{
  let s=createSeed();s.previewScene=scene;s=applyAction(s,{type:'take'});
  s=applyAction(s,{type:'finalize-game',winner:'red'});const old=structuredClone(programState(s));
  s=applyAction(s,{type:'next-game'});const view=programState(s);
  assert.equal(view.match.game,old.match.game);assert.equal(view.gameTime,old.gameTime);
  assert.deepEqual(view.players,old.players);assert.deepEqual(view.stats,old.stats);assert.equal(s.match.game,3);
  s=applyAction(s,{type:'production',command:{op:'immediate',action:'analysis-off'}});
  assert.equal(programState(s).match.game,2);assert.equal(programState(s).gameTime,old.gameTime);
});

test('on-air terminal data remains frozen after source loss and next-game preparation',()=>{
  let s=createSeed();s.selectedPlayerId=s.players[0].id;
  s=applyAction(s,{type:'finalize-game',winner:'red'});s=applyAction(s,{type:'take',scene:'ranking'});
  const final=structuredClone(programState(s));
  s.players=[];s.gameTime=0;s.stats.blue.kills=999;s.draft.bluePicks=[];
  const disconnected=programState(s);
  assert.deepEqual(disconnected.players,final.players);assert.deepEqual(disconnected.stats,final.stats);assert.deepEqual(disconnected.draft,final.draft);assert.equal(disconnected.gameTime,final.gameTime);
  s=applyAction(s,{type:'next-game'});assert.equal(s.match.game,3);
  assert.equal(currentGameResult(programState(s))!.id,currentGameResult(final)!.id);
  assert.deepEqual(programState(s).players,final.players);assert.equal(programState(s).selectedPlayerId,final.selectedPlayerId);assert.equal(programState(s).gameTime,final.gameTime);
});

test('scores, feed mappings and sample gate follow team identities across a side swap',()=>{
  let s=applyAction(createSeed(),{type:'finalize-game',winner:'red'});s=applyAction(s,{type:'next-game'});
  s.overlay.playerFeeds!.blue.label='AZR';s.overlay.playerFeeds!.red.label='EMB';
  const gate=structuredClone(s.awaitingNextGame);
  s=applyAction(s,{type:'set-match',patch:{blueTeamId:'ember',redTeamId:'azure'}});
  assert.equal(s.match.blueScore,1);assert.equal(s.match.redScore,1);assert.deepEqual(s.awaitingNextGame,gate);
  assert.equal(s.overlay.playerFeeds!.blue.label,'EMB');assert.equal(s.players[0].name,'赤霄');
  assert.throws(()=>applyAction(createSeed(),{type:'set-match',patch:{blueTeamId:'ember',redTeamId:'azure'}}),/局间/);
});

test('corrections recalculate the effective ledger and exports without duplicating game wins',()=>{
  let s=applyAction(createSeed(),{type:'load-match',matchId:'m1'});Object.assign(s,{players:createSeed().players,phase:'live',gameTime:900});
  s=applyAction(s,{type:'set-match',patch:{blueScore:0,redScore:0}});
  s=applyAction(s,{type:'finalize-game',winner:'blue'});const id=currentGameResult(s)!.id;
  s=applyAction(s,{type:'correct-result',resultId:id,winner:'red',reason:'裁判改判'});
  s=applyAction(s,{type:'correct-result',resultId:id,winner:'red',reason:'重复核对'});
  assert.deepEqual([s.match.blueScore,s.match.redScore],[0,1]);assert.equal(s.schedule[0].redScore,1);
  assert.equal(s.gameResults!.length,1);assert.equal(s.recordings[0].result!.winner,'red');assert.equal(s.recordings[0].result!.version,3);
  assert.equal(s.production!.corrections[0].before,'blue');assert.equal(s.production!.corrections[0].reason,'裁判改判');
  assert.throws(()=>applyAction(s,{type:'set-match',patch:{blueScore:2}}),/纠正结果/);
  const restored=normalizeSavedState(JSON.parse(JSON.stringify(publicState(s))));resetRuntimeState(restored);
  assert.equal(currentGameResult(restored)!.winner,'red');assert.equal(restored.production!.corrections.length,2);
  assert.equal(restored.recordings[0].result!.version,3);
});

test('manual BP assignments are staged, and standard / per-team fearless exceptions respect rules',()=>{
  let s=createSeed();s.draft.locked=true;
  const ids=s.draft.bluePicks;
  s=applyAction(s,{type:'production',command:{op:'assign',assignments:[{playerId:s.players[0].id,championId:ids[3],role:'下路',team:'blue',locked:true}]}});
  assert.equal(programState(s).players[0].championId,'Aatrox');assert.equal(s.players[0].championId,'Jinx');
  s=applyAction(s,{type:'production',command:{op:'rules',rules:{mode:'standard',scope:'all',exceptionGames:[],remakeHistory:'discard'}}});
  assert.equal(getFearlessBans(s).size,0);
  s=applyAction(s,{type:'production',command:{op:'rules',rules:{mode:'fearless',scope:'team',exceptionGames:[],remakeHistory:'discard'}}});
  assert.equal(getFearlessBans(s,'azure').size,5);
  assert.throws(()=>applyAction(s,{type:'production',command:{op:'rules',rules:{mode:'custom',scope:'all',exceptionGames:[2],remakeHistory:'discard'}}}),/理由/);
});

test('preselected heroes stay outside locked choices and history',()=>{
  const parsed=normalizeDraft({myTeam:[{cellId:0,teamId:100,championId:222}],theirTeam:[{cellId:5,teamId:200,championId:103}],actions:[[{id:0,type:'pick',actorCellId:0,championId:222,completed:false,isInProgress:true}]]},{},[])!;
  assert.deepEqual(parsed.draft.bluePicks,[]);assert.deepEqual(parsed.draft.bluePreselect,['222']);assert.equal(parsed.draft.locked,false);
});

test('remake archives the invalid attempt and gates the old game without advancing the BO number',()=>{
  let s=createSeed();s=applyAction(s,{type:'finalize-game',winner:'red'});
  s=applyAction(s,{type:'production',command:{op:'remake',reason:'裁判宣布重开'}});
  assert.equal(s.match.game,2);assert.equal(s.production!.attempt,2);assert.equal(s.production!.invalidAttempts.length,1);
  assert.deepEqual([s.match.blueScore,s.match.redScore],[1,0]);assert.equal(s.gameResults!.length,0);
  assert.equal(s.players.length,0);assert.ok(s.awaitingNextGame);assert.equal(programState(s).match.game,2);
  assert.notEqual(productionKey(s),s.production!.program!.key);
});

test('check fingerprints expire by affected source while unrelated checks stay valid',()=>{
  let s=createSeed();for(const id of ['identity','audio','game','disk'] as const)s=applyAction(s,{type:'production',command:{op:'check',id}});
  s.production!.audioEpoch=1;assert.equal(checkValid(s,'audio'),false);assert.equal(checkValid(s,'identity'),true);assert.equal(checkValid(s,'disk'),true);
  s.production!.sourceEpoch=1;assert.equal(checkValid(s,'game'),false);
  assert.throws(()=>applyAction(s,{type:'production',command:{op:'confirm-picture'}}),/尚未/);
});

test('terminal arrival and completeness remain distinct, and a partial record requires an explicit reason',()=>{
  let s=createSeed();s.mode='live';s.events=[];s.players=s.players.map(p=>({...p,statsSource:'api',statsAvailable:true,statsSampledAt:new Date().toISOString(),statsGameTime:s.gameTime}));
  const r=finalizeGame(s,{source:'lcu',winner:'red'})!;assert.equal(r.terminalSampleAccepted,false);
  assert.throws(()=>applyAction(s,{type:'next-game'}),/终局样本/);
  s=applyAction(s,{type:'production',command:{op:'accept-final',reason:'裁判确认采用最后可用样本'}});
  assert.equal(s.recordings[0].result!.terminalComplete,false);assert.equal(s.production!.audit.at(-1)!.reason,'裁判确认采用最后可用样本');
  assert.equal(applyAction(s,{type:'next-game'}).match.game,3);
});

test('replay writes remain blocked while an independent clip is on air',async()=>{
  const s=createSeed();s.mode='live';s.production!.playingClipId='clip';let requests=0;
  const adapters=new Adapters(()=>s,work=>work(s),new ChampionCatalog('.'),async()=>{requests++;return {};});
  try{await assert.rejects(adapters.replay({paused:true,time:500}),/已保护/);assert.equal(requests,0);}finally{await adapters.close();}
});

test('seat ownership, role permissions and repeated request IDs remain authoritative',()=>{
  const seats=new ControlSeats(),director=seats.issue({role:'director',name:'导播'},true),data=seats.issue({role:'data'},true),sub=seats.issue({role:'subtitle'},true),replay=seats.issue({role:'replay'},true);
  assert.equal(seats.issue({},true,director.token).id,director.id);
  assert.throws(()=>seats.authorize(data.token,'take'),/主导播/);assert.throws(()=>seats.authorize(replay.token,'production',{op:'rules'}),/仅可/);
  assert.equal(seats.authorize(sub.token,'set-overlay').id,sub.id);
  const second=seats.issue({role:'director'},true);assert.throws(()=>seats.authorize(second.token,'take'));
  seats.claim(second.token,'明确接管');assert.throws(()=>seats.authorize(director.token,'take'));assert.equal(seats.authorize(second.token,'take').id,second.id);
  seats.remember(data.id,'request-1','payload',1);assert.equal(seats.duplicate(data.id,'request-1','payload'),true);assert.throws(()=>seats.duplicate(data.id,'request-1','other'));
});

test('program and preview feed selection have separate clocks and hold through pauses',()=>{
  let s=createSeed();s.previewScene='live';s=applyAction(s,{type:'set-player-feed-control',mode:'auto',activeIndex:1});s=applyAction(s,{type:'take'});
  const at=s.overlay.playerFeedControl!.nextSwitchAt!;
  s=applyAction(s,{type:'set-player-feed-control',mode:'manual',activeIndex:4});tickPlayerFeeds(s,at);
  assert.equal(s.overlay.playerFeedControl!.activeIndex,4);assert.equal(s.production!.program!.overlay.playerFeedControl!.activeIndex,2);
  s=applyAction(s,{type:'production',command:{op:'pause',kind:'official',reason:'裁判暂停'}});tickPlayerFeeds(s,at+10000);
  assert.equal(s.production!.program!.overlay.playerFeedControl!.activeIndex,2);
});
