import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createSeed, csvRecording, normalizeSavedState, publicState, resetRuntimeState, snapshotRecording, tickDemo } from './state';
import { normalizeDraft, normalizeLive, parseLockfile } from './adapters';
import { inspectImage, validHost, validOrigin, validToken } from './security';

test('preview does not go on air until take, and password is never broadcast',()=>{
  const initial=createSeed();const preview=applyAction(initial,{type:'preview-scene',scene:'postgame'});assert.equal(preview.programScene,'live');assert.equal(preview.previewScene,'postgame');
  const program=applyAction(preview,{type:'take'});assert.equal(program.programScene,'postgame');assert.equal(initial.previewScene,'draft');
  const settings=applyAction(program,{type:'set-settings',patch:{obsPassword:'secret-password'}});assert.equal(settings.settings.obsPassword,undefined);assert.equal(publicState(settings).settings.obsPassword,undefined);
});
test('switching to real source clears all synthetic match data',()=>{
  const s=applyAction(createSeed(),{type:'set-mode',mode:'live'});assert.equal(s.mode,'live');assert.equal(s.players.length,0);assert.equal(s.events.length,0);assert.equal(s.economy.length,0);assert.equal(s.stats.blue.gold,null);
  tickDemo(s);assert.equal(s.gameTime,0);assert.throws(()=>applyAction(s,{type:'demo-reset'}));
});
test('demo respects pause and save recording is a detached snapshot',()=>{
  let s=applyAction(createSeed(),{type:'demo-pause',paused:true});const oldTime=s.gameTime;tickDemo(s);assert.equal(s.gameTime,oldTime);
  s=applyAction(s,{type:'save-recording'});const kills=s.recordings[0].players[0].kills;s.players[0].kills+=10;assert.equal(s.recordings[0].players[0].kills,kills);
  const next=applyAction(s,{type:'set-overlay',patch:{countdownEnd:Date.now()+60000}});assert.ok(next.overlay.countdownEnd!>Date.now());
});
test('untrusted mutations are rejected without modifying current state',()=>{
  const state=createSeed();for(const action of [{type:'take',scene:'../../secret'},{type:'set-overlay',patch:{accent:'url(js)'}},{type:'set-settings',patch:{obsUrl:'file:///tmp'}},{type:'set-match',patch:{blueTeamId:'missing'}},{type:'set-overlay',patch:{scale:NaN}},{type:'select-player',playerId:'missing'}])assert.throws(()=>applyAction(state,action));
  assert.equal(state.revision,0);assert.equal(state.programScene,'live');
});
test('Live API preserves unavailable cumulative gold and reads correct team / tower owner',()=>{
  const data={activePlayer:{currentGold:500},allPlayers:[{riotId:'A#CN',riotIdGameName:'A',championName:'Ahri',rawChampionName:'game_character_displayname_Ahri',team:'ORDER',scores:{kills:2,deaths:1,assists:3,creepScore:100},level:11,position:'MIDDLE',items:[{itemID:1001,slot:0}]},{riotId:'B#CN',championName:'Vi',team:'CHAOS',scores:{kills:1},position:'JUNGLE'}],events:{Events:[{EventID:1,EventName:'TurretKilled',EventTime:12,KillerName:'A#CN',TurretKilled:'Turret_T2_C_05_A'},{EventID:2,EventName:'DragonKill',EventTime:18,KillerName:'B#CN',DragonType:'Fire'}]},gameData:{gameTime:25}};
  const out=normalizeLive(data,[]);assert.equal(out.players[0].gold,null);assert.equal(out.stats.blue.gold,null);assert.equal(out.stats.red.gold,null);assert.equal(out.stats.blue.towers,1);assert.equal(out.stats.red.dragons,1);assert.equal(out.players[0].team,'blue');
});
test('LCU draft uses explicit teams and action sequence, including red local team',()=>{
  const session={myTeam:[{cellId:0,team:2,championId:145,summonerId:100}],theirTeam:[{cellId:5,team:1,championId:103,summonerId:101}],actions:[[{id:6,actorCellId:0,type:'pick',completed:true,championId:145}],[{id:1,actorCellId:5,type:'ban',completed:true,championId:64}],[{id:5,actorCellId:5,type:'pick',completed:true,championId:103}]],timer:{adjustedTimeLeftInPhase:14500}};
  const out=normalizeDraft(session,{},[]);assert.ok(out);assert.deepEqual(out.draft.bluePicks,['103']);assert.deepEqual(out.draft.redPicks,['145']);assert.deepEqual(out.draft.blueBans,['64']);assert.equal(out.draft.timer,15);
  assert.equal(normalizeDraft({myTeam:[{cellId:0,championId:145}]},{},[]),null);
});
test('lockfile validation and origin checks restrict authentication to local service',()=>{
  assert.deepEqual(parseLockfile('LeagueClient:123:54321:password:https'),{port:54321,password:'password',protocol:'https'});assert.throws(()=>parseLockfile('LeagueClient:123:88888:p:https'));assert.throws(()=>parseLockfile('LeagueClient:123:12345:p:http'));
  assert.equal(validOrigin('http://127.0.0.1:5173',3888,false),true);assert.equal(validOrigin('https://evil.example',3888,false),false);assert.equal(validHost('evil.example:3888',3888,false),false);assert.equal(validToken('good-token','good-token'),true);assert.equal(validToken('wrong','good-token'),false);
});
test('image upload checks dimensions and signature; CSV neutralizes spreadsheet formulas',()=>{
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(1920,16);png.writeUInt32BE(1080,20);assert.equal(inspectImage(png).width,1920);png.writeUInt32BE(100000,16);assert.throws(()=>inspectImage(png));assert.throws(()=>inspectImage(Buffer.from('<script>evil</script>')));
  const s=applyAction(createSeed(),{type:'save-recording'});s.recordings[0].players[0].name='=HYPERLINK("evil")';assert.ok(csvRecording(s.recordings[0]).includes("'=HYPERLINK"));
});

test('restoring real mode keeps persistent production assets and recordings while clearing old match samples',()=>{
  const s=applyAction(createSeed(),{type:'save-recording'});s.mode='live';s.settings.obsPassword='must-not-persist';s.connections.live={status:'connected',detail:'旧连接',updatedAt:'2026-10-03T10:00:00Z'};s.assets.push({id:'asset-1',name:'logo',url:'/uploads/test.png',type:'image/png',createdAt:'2026-10-03T10:00:00Z'});
  const savedRecording=structuredClone(s.recordings[0]),savedTeams=structuredClone(s.teams);resetRuntimeState(s);
  assert.equal(s.phase,'pregame');assert.equal(s.gameTime,0);assert.deepEqual(s.players,[]);assert.deepEqual(s.events,[]);assert.deepEqual(s.draft.bluePicks,[]);assert.equal(s.stats.blue.gold,null);assert.equal(s.connections.live.status,'disconnected');assert.equal(s.connections.live.updatedAt,undefined);assert.equal(s.settings.obsPassword,undefined);assert.deepEqual(s.teams,savedTeams);assert.deepEqual(s.recordings[0],savedRecording);assert.equal(s.assets.length,1);
});

test('loading the next fixture resets match stats and uses its own roster and portraits',()=>{
  const current=applyAction(createSeed(),{type:'save-recording'});current.selectedPlayerId=current.players[0].id;current.teams.find(t=>t.id==='jade')!.players[0].portrait='/uploads/player.png';
  const next=applyAction(current,{type:'load-match',matchId:'m2'});
  assert.equal(next.match.blueTeamId,'jade');assert.equal(next.match.redTeamId,'storm');assert.equal(next.match.game,1);assert.equal(next.match.subtitle,'');assert.equal(next.phase,'pregame');assert.equal(next.gameTime,0);assert.deepEqual(next.events,[]);assert.deepEqual(next.economy,[]);assert.deepEqual(next.draft.blueBans,[]);assert.equal(next.stats.red.kills,0);assert.equal(next.selectedPlayerId,null);assert.equal(next.players[0].name,'竹影');assert.equal(next.players[0].portrait,'/uploads/player.png');assert.ok(next.players.every(p=>p.gold===null&&p.championId===''));assert.equal(next.recordings.length,1);assert.equal(current.gameTime,1124);
  const game=applyAction(current,{type:'set-match',patch:{game:3}});assert.equal(game.gameTime,0);assert.equal(game.players[0].name,'山岚');
});

test('team and schedule edits preserve references and reject duplicate fixture identities',()=>{
  const current=createSeed();assert.throws(()=>applyAction(current,{type:'set-teams',teams:current.teams.filter(t=>t.id!=='jade')}),/赛程或当前比赛/);assert.throws(()=>applyAction(current,{type:'set-teams',teams:current.teams.filter(t=>t.id!=='azure')}),/赛程或当前比赛/);assert.throws(()=>applyAction(current,{type:'set-schedule',schedule:[current.schedule[0],current.schedule[0]]}),/赛程 ID 重复/);
  const noSchedule=applyAction(current,{type:'set-schedule',schedule:[]});const deleted=applyAction(noSchedule,{type:'set-teams',teams:noSchedule.teams.filter(t=>t.id!=='jade')});assert.equal(deleted.teams.length,3);assert.equal(current.teams.length,4);
});

test('sponsor image accepts uploaded assets and can be removed',()=>{
  const next=applyAction(createSeed(),{type:'set-overlay',patch:{sponsorLogo:'/uploads/sponsor.png'}});assert.equal(next.overlay.sponsorLogo,'/uploads/sponsor.png');assert.throws(()=>applyAction(next,{type:'set-overlay',patch:{sponsorLogo:'javascript:alert(1)'}}));assert.equal(applyAction(next,{type:'set-overlay',patch:{sponsorLogo:''}}).overlay.sponsorLogo,undefined);
});

test('saved legacy looks restore as ARENA while preserving production configuration',()=>{
  for(const preset of ['worlds2025','lpl2025',undefined]) {
    const saved=applyAction(createSeed(),{type:'save-recording'});
    Object.assign(saved.overlay,{preset,players:false,scale:1.25,sponsor:'校园杯',accent:'#abcdef'});
    saved.assets.push({id:'asset-1',name:'logo',url:'/uploads/logo.png',type:'image/png',createdAt:'2026-10-04T10:00:00Z'});
    const original=structuredClone(saved);
    const restored=normalizeSavedState(saved);
    assert.equal(restored.overlay.preset,'arena');
    assert.equal(restored.overlay.players,false);
    assert.equal(restored.overlay.scale,1.25);
    assert.equal(restored.overlay.sponsor,'校园杯');
    assert.equal(restored.overlay.accent,'#abcdef');
    assert.deepEqual(restored.assets,saved.assets);
    assert.deepEqual(restored.recordings,saved.recordings);
    assert.deepEqual(restored.teams,saved.teams);
    assert.deepEqual(saved,original);
    resetRuntimeState(restored);
    assert.equal(restored.overlay.preset,'arena');
  }
});

test('legacy overlay API names resolve to ARENA and unknown looks are rejected',()=>{
  const current=createSeed();
  for(const preset of ['arena','worlds2025','lpl2025']) {
    const next=applyAction(current,{type:'set-overlay',patch:{preset,ticker:true}});
    assert.equal(next.overlay.preset,'arena');
    assert.equal(next.overlay.ticker,true);
  }
  for(const preset of ['unknown',42,null])assert.throws(()=>applyAction(current,{type:'set-overlay',patch:{preset}}),/未知选项/);
  assert.equal(current.revision,0);
  assert.equal(current.overlay.ticker,false);
  assert.equal(current.overlay.preset,'arena');
});

test('legacy real states with absent history fields never inherit demonstration samples',()=>{
  const original=applyAction(createSeed(),{type:'set-mode',mode:'live'});
  const old=structuredClone(original);delete old.draftHistory;delete old.incomeSnapshots;
  const restored=normalizeSavedState(old);
  assert.deepEqual(restored.draftHistory,[]);assert.deepEqual(restored.incomeSnapshots,[]);
  assert.deepEqual(restored.events,[]);assert.deepEqual(restored.economy,[]);
  assert.equal(old.draftHistory,undefined);assert.equal(old.incomeSnapshots,undefined);
  const historical=createSeed();historical.mode='live';
  const retained=normalizeSavedState(historical);
  assert.deepEqual(retained.draftHistory,historical.draftHistory);assert.deepEqual(retained.incomeSnapshots,historical.incomeSnapshots);
});

test('real recordings require observed statistics and preserve their actual time and source',()=>{
  const now=Date.parse('2026-10-04T12:00:00.000Z');
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});
  assert.throws(()=>snapshotRecording(state,{now}),/尚未取得真实/);
  state.players=[{...createSeed().players[0],id:'live-observed',gold:2268,currentGold:68,goldSource:'ocr',goldGameTime:499.5,goldSampledAt:new Date(now-200).toISOString(),goldExpiresAt:new Date(now+10000).toISOString(),statsSource:'ocr',statsGameTime:499.5,statsSampledAt:new Date(now-200).toISOString(),statsExpiresAt:new Date(now+10000).toISOString()}];
  state.gameTime=500;state.phase='live';
  state.events=[{id:'observed',time:400,type:'ChampionKill',text:'已发生'}, {id:'future',time:1200,type:'ChampionKill',text:'未到达'}];
  state.economy=[{time:400,blue:10000,red:11000,source:'ocr'}, {time:1200,blue:30000,red:31000,source:'ocr'}];
  const recorded=snapshotRecording(state,{now});
  assert.equal(recorded.observedAt,new Date(now-200).toISOString());assert.equal(recorded.sourceGameTime,500);
  assert.deepEqual(recorded.events.map(event=>event.id),['observed']);assert.equal(recorded.economy.length,1);
  assert.equal(recorded.players[0].gold,2268);assert.equal(recorded.players[0].statsSource,'ocr');
  const csv=csvRecording(recorded);assert.match(csv,/实际采样时间/);assert.match(csv,/KDA \/ 补刀来源/);assert.match(csv,/观战 HUD 识别/);
  assert.match(csv,/个人经济对应游戏秒数/);assert.match(csv,/"499.5","499.5"/);
  assert.throws(()=>snapshotRecording(state,{now:now+10001}),/计分板统计采样已过期/);
  state.events.push({id:'demo-1',time:100,type:'ChampionKill',text:'虚构事件'});
  assert.throws(()=>snapshotRecording(state,{now}),/演示事件/);
});

test('a successful replay seek blocks records until matching current Live data arrives',()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'}),now=Date.now();state.gameTime=500;
  state.players=[{...createSeed().players[0],id:'live-current',statsSource:'api',statsSampledAt:new Date(now).toISOString()}];
  state.gameClock={source:'replay',gameTime:100,sampledAt:new Date(now).toISOString(),speed:1,paused:false,sessionId:'fixture',discontinuity:1,matchKey:'fixture',validForMs:4500,awaitingLiveSample:true};
  assert.throws(()=>snapshotRecording(state,{now}),/回放位置已变化/);delete state.gameClock.awaitingLiveSample;assert.equal(snapshotRecording(state,{now}).players.length,1);
});

test('recording discards expired OCR gold while preserving fresh API statistics and original state',()=>{
  const now=Date.parse('2026-10-04T12:00:00.000Z');
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});
  state.players=[{...createSeed().players[0],id:'live-api',statsSource:'api',statsSampledAt:new Date(now-100).toISOString(),gold:2268,currentGold:68,goldSource:'ocr',goldGameTime:480,goldSampledAt:new Date(now-11000).toISOString(),goldExpiresAt:new Date(now-1000).toISOString()}];
  state.gameTime=500;state.stats.blue.gold=2268;
  const recorded=snapshotRecording(state,{now});
  assert.equal(recorded.players[0].gold,null);assert.equal(recorded.players[0].currentGold,undefined);assert.equal(recorded.stats.blue.gold,null);
  assert.equal(recorded.players[0].goldGameTime,undefined);
  assert.equal(recorded.players[0].kills,state.players[0].kills);assert.equal(state.players[0].gold,2268);
  state.players[0].statsSampledAt=new Date(now-20000).toISOString();
  assert.throws(()=>snapshotRecording(state,{now}),/有效游戏采样/);
});

test('legacy live recording compatibility still requires a fresh connected client',()=>{
  const now=Date.parse('2026-10-04T12:00:00.000Z');
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});
  state.players=[{...createSeed().players[0],id:'live-legacy'}];state.gameTime=500;
  state.connections.live={status:'connected',detail:'客户端采样',updatedAt:new Date(now-1000).toISOString()};
  assert.equal(snapshotRecording(state,{now}).observedAt,state.connections.live.updatedAt);
  state.connections.live.status='disconnected';
  assert.throws(()=>snapshotRecording(state,{now}),/有效游戏采样/);
  state.connections.live.status='connected';state.connections.live.updatedAt=new Date(now-20000).toISOString();
  assert.throws(()=>snapshotRecording(state,{now}),/有效游戏采样/);
  state.players[0].id='roster-preview';state.connections.live.updatedAt=new Date(now).toISOString();
  assert.throws(()=>snapshotRecording(state,{now}),/有效游戏采样/);
});

test('fresh explicitly sourced team economy can be saved without a player roster',()=>{
  const now=Date.parse('2026-10-04T12:00:00.000Z');
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.gameTime=500;
  state.stats.blue.gold=12000;state.stats.red.gold=11000;
  state.economyFeed={source:'manual',status:'fresh',detail:'人工校准',blue:12000,red:11000,sampledAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+9000).toISOString()};
  state.economy=[{time:500,blue:12000,red:11000,source:'manual'}];
  const recording=snapshotRecording(state,{now});
  assert.equal(recording.observedAt,state.economyFeed.sampledAt);assert.equal(recording.sourceGameTime,500);
  assert.equal(recording.players.length,0);assert.equal(recording.stats.blue.gold,12000);assert.equal(recording.economyFeed?.source,'manual');assert.equal(recording.economy.length,1);
  assert.throws(()=>snapshotRecording(state,{now:now+10000}),/尚未取得真实/);
  state.economyFeed.source='none';assert.throws(()=>snapshotRecording(state,{now}),/尚未取得真实/);
});

test('incomplete and invalid API scores cannot be saved as real zero statistics',()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.gameTime=500;
  state.connections.live={status:'connected',detail:'鲜活客户端连接',updatedAt:new Date().toISOString()};
  for(const scores of [{kills:0,deaths:0,assists:0},{kills:0,deaths:0,assists:0,creepScore:-1},{kills:NaN,deaths:0,assists:0,creepScore:0},{kills:0,deaths:.5,assists:0,creepScore:0}]){
    state.players=normalizeLive({allPlayers:[{riotId:'Observed#TEST',team:'ORDER',scores}],gameData:{gameTime:500}},[]).players;
    assert.equal(state.players[0].statsAvailable,false);
    assert.throws(()=>snapshotRecording(state),/完整的 KDA 和补刀/);
    assert.throws(()=>applyAction(state,{type:'save-recording'}),/完整的 KDA 和补刀/);
  }
  state.players=normalizeLive({allPlayers:[{riotId:'Observed#TEST',team:'ORDER',scores:{kills:0,deaths:0,assists:0,creepScore:0}}],gameData:{gameTime:500}},[]).players;
  assert.equal(state.players[0].statsAvailable,true);assert.equal(snapshotRecording(state).players[0].kills,0);
});
