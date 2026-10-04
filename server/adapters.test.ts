import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Adapters, ChampionCatalog, normalizeDraft, normalizeLive } from './adapters';
import { LocalApiError } from './replay';
import { applyAction, createSeed } from './state';

test('live polling retains the last successful sample time across failure and reconnect',async()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});
  let unavailable=true;let gameTime=120;
  const adapters=new Adapters(()=>state,work=>work(state),new ChampionCatalog('.'),async(port,endpoint)=>{
    assert.equal(port,2999);assert.equal(endpoint,'/liveclientdata/allgamedata');
    if(unavailable)throw new Error('测试客户端已断开');
    return {allPlayers:[{riotId:'Blue#CN',team:'ORDER',championName:'Ahri',totalGold:3000,scores:{kills:2}},{riotId:'Red#CN',team:'CHAOS',championName:'Vi',totalGold:2800,scores:{kills:1}}],events:{Events:[]},gameData:{gameTime}};
  });
  try{
    await assert.rejects(adapters.connect('live'));assert.equal(state.connections.live.status,'error');assert.equal(state.connections.live.updatedAt,undefined);assert.equal(state.players.length,0);
    unavailable=false;await adapters.poll();assert.equal(state.connections.live.status,'connected');assert.equal(state.gameTime,120);assert.equal(state.stats.blue.gold,3000);const sampleTime=state.connections.live.updatedAt;assert.ok(sampleTime);
    unavailable=true;await adapters.poll();assert.equal(state.connections.live.status,'error');assert.equal(state.connections.live.updatedAt,sampleTime);assert.equal(state.gameTime,120);assert.equal(state.players.length,2);
    unavailable=false;gameTime=20;state.selectedPlayerId='expired-player';await adapters.connect('live');assert.equal(state.connections.live.status,'connected');assert.equal(state.gameTime,20);assert.deepEqual(state.economy.map(p=>p.time),[20]);assert.equal(state.selectedPlayerId,null);
  }finally{await adapters.close();}
});

test('draft resolves red local team from gameflow and maps summary bans without relying on local perspective',()=>{
  const session={myTeam:[{cellId:0,team:0,teamId:200,championId:145,summonerId:100},{cellId:1,championId:254,summonerId:102}],theirTeam:[{cellId:5,championId:103,summonerId:101}],bans:{myTeamBans:[64,266,0],theirTeamBans:[222,412]},actions:[[{id:4,actorCellId:0,type:'pick',completed:true,championId:145}],[{id:3,actorCellId:5,type:'pick',completed:true,championId:103}],[{id:5,actorCellId:1,type:'ban',isInProgress:true,championId:0}]],timer:{timeLeftInPhase:20100}};
  const flow={gameData:{teamOne:[{summonerId:101}],teamTwo:[{summonerId:100},{summonerId:102}]}};
  const normalized=normalizeDraft(session,flow,[]);assert.ok(normalized);
  assert.deepEqual(normalized.draft.redBans,['64','266']);assert.deepEqual(normalized.draft.blueBans,['222','412']);assert.deepEqual(normalized.draft.bluePicks,['103']);assert.equal(normalized.draft.activeTeam,'red');assert.equal(normalized.draft.action,'禁用英雄');assert.equal(normalized.draft.timer,21);assert.deepEqual(normalized.players.map(p=>p.team),['red','red','blue']);
  assert.equal(normalizeDraft({myTeam:[{cellId:0,team:1}],theirTeam:[{cellId:5,team:1}]},{},[]),null);
});

test('objective and first-blood attribution handles full Riot IDs, minions and ambiguous player aliases',()=>{
  const data={allPlayers:[{riotId:'Same#BLUE',riotIdGameName:'Same',team:'ORDER',championName:'Ahri',totalGold:4500,scores:{kills:3}},{riotId:'Same#RED',riotIdGameName:'Same',team:'CHAOS',championName:'Vi',totalGold:4300,scores:{kills:2}}],events:{Events:[{EventID:1,EventName:'FirstBlood',Recipient:'Same#BLUE'},{EventID:2,EventName:'DragonKill',KillerName:'Same#RED'},{EventID:3,EventName:'DragonKill',KillerName:'Same'},{EventID:4,EventName:'BaronKill',KillerName:'Minion_T100L0S12N001'},{EventID:5,EventName:'TurretKilled',KillerName:'Minion_T200L0S12N001',TurretKilled:'Turret_T1_L_03_A'},{EventID:6,EventName:'GameEnd'}]},gameData:{gameTime:900}};
  data.events.Events.forEach(event=>Object.assign(event,{EventTime:100}));const normalized=normalizeLive(data,[]);assert.equal(normalized.stats.blue.kills,3);assert.equal(normalized.stats.red.kills,2);assert.equal(normalized.stats.blue.gold,4500);assert.equal(normalized.stats.red.gold,4300);assert.equal(normalized.stats.red.dragons,1);assert.equal(normalized.stats.blue.dragons,0);assert.equal(normalized.stats.blue.barons,1);assert.equal(normalized.stats.red.towers,1);assert.equal(normalized.events[0].team,'blue');assert.equal(normalized.events[2].team,undefined);assert.equal(normalized.ended,true);
});

test('Live rune artwork keeps valid API identifiers alongside rune names',()=>{
  const result=normalizeLive({allPlayers:[{team:'ORDER',riotId:'Runes#CN',runes:{keystone:{id:8112,displayName:'电刑'},primaryRuneTree:{id:8100,displayName:'主宰'},secondaryRuneTree:{id:8200,displayName:'巫术'}}},{team:'CHAOS',riotId:'Invalid#CN',runes:{keystone:{id:-1,displayName:'未知'},primaryRuneTree:{id:'8200'},secondaryRuneTree:{id:null}}}]},[]);
  assert.deepEqual(result.players[0].runeIds,[8112,8100,8200]);
  assert.deepEqual(result.players[0].runes,['电刑','主宰','巫术']);
  assert.equal(result.players[1].runeIds,undefined);
});

test('Live inventory preserves empty equipment slots and the separate trinket position when the API supplies slot identities',()=>{
  const normalized=normalizeLive({allPlayers:[{team:'ORDER',riotId:'Slots#TEST',items:[{itemID:3363,slot:6},{itemID:3157,slot:3},{itemID:0,slot:1},{itemID:1056,slot:0}]},{team:'CHAOS',riotId:'Unslotted#TEST',items:[{itemID:1001},{itemID:3364}]}]},[]);
  assert.deepEqual(normalized.players[0].itemSlots,[1056,0,0,3157,0,0,3363]);assert.deepEqual(normalized.players[0].items,[1056,3157,3363]);assert.equal(normalized.players[1].itemSlots,undefined);assert.deepEqual(normalized.players[1].items,[1001,3364]);
});

test('Live combat details belong only to their identified player and compatible income extensions stay explicit',()=>{
  const normalized=normalizeLive({activePlayer:{riotId:'Active#CN',currentGold:900,championStats:{currentHealth:560,maxHealth:900,resourceValue:120,resourceMax:400,resourceType:'MANA'}},allPlayers:[
    {team:'ORDER',riotId:'Active#CN',position:'TOP',isDead:false,respawnTimer:0,summonerSpells:{summonerSpellOne:{displayName:'闪现',id:4},summonerSpellTwo:{rawDisplayName:'SummonerTeleport'}},goldSources:{kills:0,minions:1000,monsters:-4,passive:'1213'}},
    {team:'ORDER',riotId:'Other#CN',position:'JUNGLE',isDead:true,respawnTimer:12},
    {team:'CHAOS',riotId:'Red#CN',championStats:{currentHealth:500,maxHealth:800},income:{monsters:800,other:300}}
  ]},[]);
  const active=normalized.players.find(player=>player.id==='live-Active#CN')!;
  assert.equal(active.gold,null,'currentGold must never replace lifetime gold');assert.equal(active.currentGold,900);assert.equal(active.goldSource,undefined);assert.equal(active.health,560);assert.equal(active.maxResource,400);assert.equal(active.resourceType,'MANA');assert.deepEqual(active.summonerSpells,[{name:'闪现',id:4},{name:'SummonerTeleport',rawName:'SummonerTeleport'}]);assert.deepEqual(active.income,{kills:0,minions:1000});
  const other=normalized.players.find(player=>player.id==='live-Other#CN')!;assert.equal(other.currentGold,undefined);assert.equal(other.health,undefined);assert.equal(other.isDead,true);assert.equal(other.respawnTimer,12);
  const red=normalized.players.find(player=>player.id==='live-Red#CN')!;assert.equal(red.health,500);assert.deepEqual(red.income,{monsters:800,other:300});
  const ambiguous=normalizeLive({activePlayer:{summonerName:'Same',championStats:{currentHealth:200}},allPlayers:[{team:'ORDER',summonerName:'Same',riotId:'Same#BLUE'},{team:'CHAOS',summonerName:'Same',riotId:'Same#RED'}]},[]);
  assert.ok(ambiguous.players.every(player=>player.health===undefined));
});

test('draft locking requires all ten completed unique picks and never accepts roster preselections',()=>{
  const roster=Array.from({length:10},(_,index)=>({cellId:index,teamId:index<5?100:200,championId:index+1}));
  const session={myTeam:roster.slice(0,5),theirTeam:roster.slice(5),actions:[]as any[]};
  assert.equal(normalizeDraft(session,{},[])!.draft.locked,false);
  session.actions=roster.map((player,index)=>[{id:index,actorCellId:player.cellId,type:'pick',championId:player.championId,completed:true}]);
  assert.equal(normalizeDraft(session,{},[])!.draft.locked,true);
  session.actions[9][0].completed=false;assert.equal(normalizeDraft(session,{},[])!.draft.locked,false);
  session.actions[9][0].completed=true;session.actions[9][0].championId=1;assert.equal(normalizeDraft(session,{},[])!.draft.locked,false);
});

test('replay events and objectives reflect the current position and cannot prematurely end the match',()=>{
  const data={allPlayers:[{riotId:'Blue#TEST',team:'ORDER',championName:'Ahri',scores:{kills:1}},{riotId:'Red#TEST',team:'CHAOS',championName:'Vi',scores:{kills:0}}],gameData:{gameTime:300},events:{Events:[
    {EventID:1,EventName:'DragonKill',EventTime:200,KillerName:'Blue#TEST'},
    {EventID:2,EventName:'TurretKilled',EventTime:600,TurretKilled:'Turret_T1_C_05_A'},
    {EventID:3,EventName:'BaronKill',EventTime:1200,KillerName:'Blue#TEST'},
    {EventID:4,EventName:'GameEnd',EventTime:1800},
    {EventID:5,EventName:'DragonKill',EventTime:-1,KillerName:'Red#TEST'},
    {EventID:6,EventName:'DragonKill',EventTime:'280',KillerName:'Red#TEST'}
  ]}};
  const before=normalizeLive(data,[]);assert.deepEqual(before.events.map(event=>event.id),['live-1']);assert.equal(before.stats.blue.dragons,1);assert.equal(before.stats.red.towers,0);assert.equal(before.stats.blue.barons,0);assert.equal(before.ended,false);
  data.gameData.gameTime=1810;const after=normalizeLive(data,[]);assert.equal(after.events.length,4);assert.equal(after.stats.red.towers,1);assert.equal(after.stats.blue.barons,1);assert.equal(after.ended,true);
  data.gameData.gameTime=100;const sought=normalizeLive(data,[]);assert.deepEqual(sought.events,[]);assert.equal(sought.stats.blue.dragons,0);assert.equal(sought.ended,false);
});

test('LCU accepts a valid idle phase when gameflow session is absent and waits for real draft side information',async()=>{
  const taskDirectory=await mkdtemp(path.join(os.tmpdir(),'riftcast-idle-lcu-'));const lockfile=path.join(taskDirectory,'lockfile');await writeFile(lockfile,'LeagueClient:0:12345:test-only:https');const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.settings.lockfilePath=lockfile;let phase='None';let sessionStatus=404;const calls:string[]=[];
  const adapters=new Adapters(()=>state,work=>work(state),new ChampionCatalog('.'),async(port,endpoint)=>{assert.equal(port,12345);calls.push(endpoint);if(endpoint==='/lol-gameflow/v1/session')throw new LocalApiError('测试 session 错误','http',port,endpoint,sessionStatus);if(endpoint==='/lol-gameflow/v1/gameflow-phase')return phase;throw new Error('不应读取未确认的选人阵容');});
  try{await adapters.connect('lcu');assert.equal(state.connections.lcu.status,'connected');assert.match(state.connections.lcu.detail,/等待 BP/);assert.deepEqual(calls,['/lol-gameflow/v1/session','/lol-gameflow/v1/gameflow-phase']);assert.deepEqual(state.players,[]);phase='ChampSelect';await adapters.poll();assert.equal(state.connections.lcu.status,'connected');assert.equal(state.phase,'draft');assert.deepEqual(state.players,[]);assert.match(state.connections.lcu.detail,/蓝红方/);sessionStatus=401;await adapters.poll();assert.equal(state.connections.lcu.status,'error');}finally{await adapters.close();assert.ok(path.resolve(taskDirectory).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(taskDirectory,{recursive:true,force:true});}
});
