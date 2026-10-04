import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { applyAction, createSeed, normalizeSavedState, publicState, resetRuntimeState } from './state';
import { Adapters, ChampionCatalog, normalizeLive } from './adapters';
import { absorbTerminalGameSample, acceptNextGameSample, finalizeGame, lcuWinner } from './game-results';
import { currentGameResult, frozenGameState, reportGameResult, rosterFingerprint } from '../shared/game-results';

const liveData=(time=900,winner?:unknown,ended=false,gameId=123)=>({gameData:{gameTime:time,gameId},allPlayers:[{riotId:'fixture-blue',team:'ORDER',rawChampionName:'game_character_displayname_Ahri',level:10,totalGold:4000,scores:{kills:2,deaths:1,assists:3,creepScore:90}},{riotId:'fixture-red',team:'CHAOS',rawChampionName:'game_character_displayname_Vi',level:10,totalGold:3900,scores:{kills:1,deaths:2,assists:2,creepScore:70}}],events:{Events:ended?[{EventID:5,EventName:'GameEnd',EventTime:time,WinningTeam:winner}]:[]}});
function observedState(){let state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state=applyAction(state,{type:'load-match',matchId:'m1'});state=applyAction(state,{type:'set-match',patch:{blueScore:0,redScore:0}});const sample=normalizeLive(liveData(),[]);Object.assign(state,{players:sample.players,stats:sample.stats,events:sample.events,gameTime:sample.gameTime,phase:'live',activeSourceGameId:'123'});return state;}

test('confirmed end archives observed players and scores once across repeated signals and restart',()=>{
  let state=observedState();const result=finalizeGame(state,{source:'live',winner:'blue',sourceGameId:'123'})!;
  assert.equal(result.winner,'blue');assert.equal(state.match.blueScore,1);assert.equal(state.schedule[0].blueScore,1);assert.equal(state.gameResults?.length,1);assert.equal(state.recordings.length,1);
  finalizeGame(state,{source:'lcu',winner:'blue',sourceGameId:'123'});assert.equal(state.match.blueScore,1);
  state.players[0].kills=99;assert.equal(result.snapshot.players[0].kills,2);
  state=normalizeSavedState(JSON.parse(JSON.stringify(publicState(state))));resetRuntimeState(state);
  assert.equal(state.phase,'postgame');assert.equal(state.players[0].kills,2);assert.equal(currentGameResult(state)?.id,result.id);assert.equal(state.gameTime,900);
  finalizeGame(state,{source:'live',winner:'blue',sourceGameId:'123'});assert.equal(state.match.blueScore,1);assert.equal(state.gameResults?.length,1);assert.equal(state.recordings.length,1);
});

test('unknown winner is archived without a guessed score and explicit confirmation is idempotent',()=>{
  let state=observedState();const result=finalizeGame(state,{source:'live'})!;
  assert.equal(result.winner,null);assert.equal(state.match.blueScore,0);assert.equal(state.match.redScore,0);
  assert.throws(()=>applyAction(state,{type:'next-game'}),/先确认本局胜方/);
  state=applyAction(state,{type:'finalize-game',winner:'red'});assert.equal(currentGameResult(state)?.winner,'red');assert.equal(state.match.redScore,1);assert.equal(state.schedule[0].redScore,1);
  state=applyAction(state,{type:'finalize-game',winner:'red'});assert.equal(state.match.redScore,1);
  assert.throws(()=>applyAction(state,{type:'finalize-game',winner:'blue'}),/不能重复改写/);
  assert.equal(frozenGameState(state).match.redScore,1);
});

test('LCU-first archive accepts one matching definitive Live end payload without resaving score',()=>{
  const state=observedState();const result=finalizeGame(state,{source:'lcu',winner:'blue',sourceGameId:'123'})!;
  const terminal=normalizeLive(liveData(920,'ORDER',true),[]);terminal.players[0].kills=3;
  assert.equal(absorbTerminalGameSample(state,{...terminal,sourceGameId:'different-game'}),false);
  const other=structuredClone(terminal);other.players[0].championId='Jinx';assert.equal(absorbTerminalGameSample(state,{...other,sourceGameId:'123'}),false);
  assert.equal(absorbTerminalGameSample(state,{...terminal,sourceGameId:'123'}),true);assert.equal(result.snapshot.duration,920);assert.equal(result.snapshot.players[0].kills,3);assert.equal(state.recordings[0].players[0].kills,3);assert.equal(state.recordings[0].id,result.id);assert.equal(state.match.blueScore,1);
  terminal.players[0].kills=99;assert.equal(absorbTerminalGameSample(state,{...terminal,sourceGameId:'123'}),false);assert.equal(result.snapshot.players[0].kills,3);
  const restarted=normalizeSavedState(JSON.parse(JSON.stringify(publicState(state))));resetRuntimeState(restarted);assert.equal(absorbTerminalGameSample(restarted,{...terminal,sourceGameId:'123'}),false);assert.equal(currentGameResult(restarted)?.snapshot.players[0].kills,3);
});

test('partial terminal scores preserve the last valid KDA/CS and provenance while other final fields update',()=>{
  const state=observedState();Object.assign(state.players[0],{kills:7,deaths:2,assists:9,cs:180,statsSource:'ocr',statsSampledAt:'2026-10-04T15:00:00.000Z',statsGameTime:900,statsExpiresAt:'2026-10-04T15:00:04.000Z'});state.stats.blue.kills=7;
  const result=finalizeGame(state,{source:'lcu',winner:'blue',sourceGameId:'123'})!;
  const data=liveData(930,'ORDER',true);delete (data.allPlayers[0]as any).scores;data.allPlayers[0].level=11;data.allPlayers[0].totalGold=4300;data.allPlayers[1].scores.kills=4;
  const terminal=normalizeLive(data,[]);assert.equal(terminal.players[0].statsAvailable,false);assert.equal(terminal.players[0].kills,0);
  assert.equal(absorbTerminalGameSample(state,{...terminal,sourceGameId:'123'}),true);
  const blue=result.snapshot.players[0],red=result.snapshot.players[1];
  assert.deepEqual([blue.kills,blue.deaths,blue.assists,blue.cs],[7,2,9,180]);assert.equal(blue.statsAvailable,true);assert.equal(blue.statsSource,'ocr');assert.equal(blue.statsSampledAt,'2026-10-04T15:00:00.000Z');assert.equal(blue.statsGameTime,900);assert.equal(blue.statsExpiresAt,'2026-10-04T15:00:04.000Z');assert.equal(result.snapshot.observedAt,blue.statsSampledAt);
  assert.equal(blue.level,11);assert.equal(blue.gold,4300);assert.equal(red.kills,4);assert.equal(red.statsSampledAt,terminal.players[1].statsSampledAt);assert.equal(result.snapshot.stats.blue.kills,7);assert.equal(result.snapshot.stats.red.kills,4);assert.equal(result.snapshot.duration,930);assert.equal(result.snapshot.events.at(-1)?.type,'GameEnd');assert.equal(state.recordings[0].players[0].kills,7);assert.equal(state.recordings[0].id,result.id);assert.equal(state.match.blueScore,1);
  terminal.players[0].kills=99;assert.equal(absorbTerminalGameSample(state,{...terminal,sourceGameId:'123'}),false);assert.equal(result.snapshot.players[0].kills,7);assert.equal(state.gameResults?.length,1);assert.equal(state.recordings.length,1);
});

test('initial end signals with a conflicting known game ID cannot archive a different game',()=>{
  const state=observedState();assert.equal(finalizeGame(state,{source:'lcu',winner:'red',sourceGameId:'124'}),undefined);assert.equal(state.gameResults?.length??0,0);assert.equal(state.recordings.length,0);assert.equal(state.match.redScore,0);assert.equal(state.phase,'live');assert.equal(state.finishedGameId,undefined);
  assert.ok(finalizeGame(state,{source:'live',winner:'blue'}));assert.equal(currentGameResult(state)?.sourceGameId,'123');
  const unidentified=observedState();delete unidentified.activeSourceGameId;assert.ok(finalizeGame(unidentified,{source:'lcu',winner:'red',sourceGameId:'124'}));assert.equal(currentGameResult(unidentified)?.sourceGameId,'124');
});

test('LCU end of another known game is ignored until the observed game confirms its own end',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'riftcast-conflicting-end-'));const lockfile=path.join(directory,'lockfile');await writeFile(lockfile,'LeagueClient:0:12345:fixture-only:https');const state=observedState();state.settings.lockfilePath=lockfile;
  const adapters=new Adapters(()=>state,work=>work(state),new ChampionCatalog('.'),async(port,endpoint)=>port===2999?liveData(930,'ORDER',true,123):endpoint==='/lol-gameflow/v1/session'?{phase:'EndOfGame',gameData:{gameId:124}}:endpoint==='/lol-end-of-game/v1/eog-stats-block'?{gameId:124,teams:[{teamId:200,isWinningTeam:true}]}:{});
  try{await adapters.connect('lcu');assert.equal(currentGameResult(state),undefined);assert.equal(state.recordings.length,0);assert.equal(state.match.redScore,0);assert.equal(state.phase,'live');await adapters.connect('live');assert.equal(currentGameResult(state)?.winner,'blue');assert.equal(currentGameResult(state)?.sourceGameId,'123');assert.equal(state.recordings.length,1);assert.equal(state.match.blueScore,1);assert.equal(state.match.redScore,0);await adapters.poll();assert.equal(state.match.blueScore,1);assert.equal(state.match.redScore,0);}finally{await adapters.close();assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(directory,{recursive:true,force:true});}
});

test('next game preserves series, teams and BO score while detaching frozen data',()=>{
  const prior=observedState();prior.selectedPlayerId=prior.players[0].id;finalizeGame(prior,{source:'live',winner:'blue',sourceGameId:'123'});
  const state=applyAction(prior,{type:'next-game'});
  assert.equal(state.match.game,2);assert.equal(state.match.blueScore,1);assert.equal(state.match.seriesId,prior.match.seriesId);assert.equal(state.match.blueTeamId,prior.match.blueTeamId);assert.equal(state.phase,'pregame');assert.equal(state.previewScene,'draft');assert.equal(state.programScene,prior.programScene);
  assert.equal(currentGameResult(state),undefined);assert.equal(state.gameTime,0);assert.equal(state.stats.blue.gold,null);assert.equal(state.events.length,0);assert.equal(state.economy.length,0);assert.equal(state.selectedPlayerId,null);assert.ok(state.players.every(p=>!p.championId&&p.gold===null));assert.equal(state.gameResults?.[0].snapshot.players[0].kills,2);
  const report=frozenGameState(state,reportGameResult(state));assert.equal(report.match.game,1);assert.equal(report.players[0].kills,2);assert.equal(report.selectedPlayerId,prior.selectedPlayerId);assert.equal(currentGameResult(report)?.id,prior.finishedGameId);
  assert.equal(acceptNextGameSample(state,{...normalizeLive(liveData(901,'ORDER',true),[]),sourceGameId:'123'}),false);
  assert.equal(state.phase,'pregame');assert.equal(state.gameResults?.length,1);
  assert.equal(acceptNextGameSample(state,{...normalizeLive(liveData(30,undefined,false,124),[]),sourceGameId:'124'}),true);assert.equal(state.awaitingNextGame,undefined);
  const gameTwo=normalizeLive(liveData(30,undefined,false,124),[]);Object.assign(state,{players:gameTwo.players,stats:gameTwo.stats,gameTime:gameTwo.gameTime});state.players[0].kills=8;assert.equal(currentGameResult(state),undefined);assert.equal(frozenGameState(state,reportGameResult(state)).players[0].kills,2);assert.equal(state.players[0].kills,8);
});

test('without source IDs, time reset accepts the next game and late previous-game samples stay gated',()=>{
  const state=observedState();state.awaitingNextGame={rosterFingerprint:rosterFingerprint(state.players),gameTime:900};
  assert.equal(acceptNextGameSample(state,{players:state.players,gameTime:900,ended:false}),false);
  assert.equal(acceptNextGameSample(state,{players:state.players,gameTime:901,ended:true}),false);
  assert.equal(acceptNextGameSample(state,{players:state.players,gameTime:15,ended:false}),true);
});

test('series completion updates schedule and blocks advance; reloading schedule resumes archive',()=>{
  let state=observedState();state.match.blueScore=1;finalizeGame(state,{source:'live',winner:'blue'});
  assert.equal(currentGameResult(state)?.seriesComplete,true);assert.equal(state.schedule[0].status,'finished');assert.equal(state.schedule[0].blueScore,2);assert.throws(()=>applyAction(state,{type:'next-game'}),/本系列赛已结束/);
  state=applyAction(state,{type:'load-match',matchId:'m1'});assert.equal(state.phase,'postgame');assert.equal(state.match.blueScore,2);assert.equal(state.gameResults?.length,1);
});

test('winner parsing accepts only explicit end fields, never kills or gold or future replay events',()=>{
  assert.equal(normalizeLive(liveData(500,'ORDER',true),[]).winner,'blue');assert.equal(normalizeLive(liveData(500,'Chaos',true),[]).winner,'red');assert.equal(normalizeLive(liveData(500,undefined,true),[]).winner,undefined);
  const future=liveData(500,'ORDER',true);future.events.Events[0].EventTime=900;assert.equal(normalizeLive(future,[]).ended,false);assert.equal(normalizeLive(future,[]).winner,undefined);
  assert.equal(lcuWinner({teams:[{teamId:100,isWinningTeam:false,kills:99},{teamId:200,isWinningTeam:true}]}),'red');assert.equal(lcuWinner({teams:[{teamId:100,kills:99,gold:99999}]}),undefined);
});

test('actual adapter polling freezes GameEnd once and a disconnect cannot finalize a running match',async()=>{
  let state=observedState(),ended=false,unavailable=false;
  const adapters=new Adapters(()=>state,work=>work(state),new ChampionCatalog('.'),async()=>{if(unavailable)throw new Error('fixture disconnect');return liveData(900,'ORDER',ended);});
  try{await adapters.connect('live');unavailable=true;await adapters.poll();assert.equal(state.gameResults?.length??0,0);assert.equal(state.match.blueScore,0);unavailable=false;ended=true;await adapters.poll();assert.equal(state.gameResults?.length,1);assert.equal(state.match.blueScore,1);const frozenKills=state.players[0].kills;await adapters.poll();assert.equal(state.match.blueScore,1);assert.equal(state.players[0].kills,frozenKills);state=applyAction(state,{type:'next-game'});await adapters.poll();assert.equal(state.phase,'pregame');assert.equal(state.match.game,2);assert.equal(state.gameResults?.length,1);assert.ok(state.players.every(p=>!p.championId));}finally{await adapters.close();}
});

test('LCU confirmed end archives last successful sample and later winner metadata updates score once',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'riftcast-endgame-'));const lockfile=path.join(directory,'lockfile');await writeFile(lockfile,'LeagueClient:0:12345:fixture-only:https');const state=observedState();state.settings.lockfilePath=lockfile;let phase='EndOfGame',winner=false;
  const adapters=new Adapters(()=>state,work=>work(state),new ChampionCatalog('.'),async(_port,endpoint)=>endpoint==='/lol-gameflow/v1/session'?{phase,gameData:{gameId:123}}:endpoint==='/lol-end-of-game/v1/eog-stats-block'?{gameId:123,teams:winner?[{teamId:200,isWinningTeam:true}]:[]}:{});
  try{await adapters.connect('lcu');assert.equal(currentGameResult(state)?.winner,null);assert.equal(state.phase,'postgame');assert.equal(state.recordings.length,1);winner=true;await adapters.poll();assert.equal(currentGameResult(state)?.winner,'red');assert.equal(state.match.redScore,1);phase='Lobby';await adapters.poll();assert.equal(state.phase,'postgame');assert.equal(state.players[0].kills,2);assert.equal(state.gameResults?.length,1);}finally{await adapters.close();assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(directory,{recursive:true,force:true});}
});

test('LCU PreEnd waits, End saves provisionally, and matching final Live sample upgrades one archive',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'riftcast-terminal-'));const lockfile=path.join(directory,'lockfile');await writeFile(lockfile,'LeagueClient:0:12345:fixture-only:https');const state=observedState();state.settings.lockfilePath=lockfile;let phase='PreEndOfGame',time=900,ended=false;
  const adapters=new Adapters(()=>state,work=>work(state),new ChampionCatalog('.'),async(port,endpoint)=>{if(port===2999){const data=liveData(time,'ORDER',ended);if(ended)data.allPlayers[0].scores.kills=3;return data;}if(endpoint==='/lol-gameflow/v1/session')return {phase,gameData:{gameId:123}};if(endpoint==='/lol-end-of-game/v1/eog-stats-block')return {gameId:123,teams:[{teamId:100,isWinningTeam:true}]};return {};});
  try{await adapters.connect('lcu');assert.equal(currentGameResult(state),undefined);assert.equal(state.phase,'live');phase='EndOfGame';await adapters.poll();assert.equal(currentGameResult(state)?.terminalSampleAccepted,false);const id=currentGameResult(state)!.id;assert.equal(state.match.blueScore,1);time=925;ended=true;await adapters.connect('live');assert.equal(currentGameResult(state)?.id,id);assert.equal(currentGameResult(state)?.terminalSampleAccepted,true);assert.equal(frozenGameState(state).gameTime,925);assert.equal(frozenGameState(state).players[0].kills,3);assert.equal(state.match.blueScore,1);assert.equal(state.gameResults?.length,1);time=930;await adapters.poll();assert.equal(frozenGameState(state).gameTime,925);assert.equal(state.recordings.length,1);}finally{await adapters.close();assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(directory,{recursive:true,force:true});}
});
