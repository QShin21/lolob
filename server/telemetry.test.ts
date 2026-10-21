import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cooldownView,telemetryFresh,activeBuffs} from '../shared/player-telemetry';
import {normalizeTelemetry,normalizeCooldown,normalizeDamage} from './telemetry-normalize';
import {mergeObserverTelemetry,invalidateChangedItemSlots} from './observer-telemetry';
import {normalizeLive} from './adapters';
import {bottomEquipment} from './bottom-scoreboard';
import {createFixture} from './test-support/fixture';
import {finalizeGame,absorbTerminalGameSample} from './game-results';
import {enrichPostgame} from './postgame-data';
import {csvRecording} from '../shared/recording-export';
import {liveChampionId} from '../shared/champion-identity';

const now=Date.now(),stamp={source:'memory' as const,gameTime:120,sampledAt:new Date(now).toISOString(),validForMs:3000};
test('cooldown deadlines use game time, last ten seconds and unavailable semantics',()=>{
 const cd={state:'cooldown' as const,readyAt:150,totalCooldown:60};
 assert.equal(cooldownView(cd,120).fraction,.5);
 assert.equal(cooldownView(cd,139.99).seconds,null);
 assert.equal(cooldownView(cd,140).seconds,10);
 assert.equal(cooldownView(cd,149.99).seconds,1);
 assert.equal(cooldownView(cd,150).state,'ready');
 assert.equal(cooldownView(cd,150,false).state,'unknown');
 assert.equal(cooldownView(undefined,150).state,'unknown');
 assert.equal(cooldownView({state:'cooldown'},150).state,'unknown');
 assert.equal(cooldownView({state:'unlearned'},150).state,'unlearned');
 assert.equal(telemetryFresh(stamp,120,now+3001),false);
 assert.equal(telemetryFresh(stamp,100,now),false);
 assert.equal(telemetryFresh(stamp,120,now),true);
});
test('death, buffs, invalid values, item identity and damage normalization',()=>{
 const p=normalizeTelemetry({isDead:true,respawnTimer:5,experienceData:{current:350,previousLevel:280,nextLevel:660},health:NaN,damageStats:{toChampions:42,taken:-1},items:[{itemID:3157,slot:3,readyAt:140,maxCooldown:120},{itemID:1,slot:7,readyAt:140}]},120,stamp);
 assert.equal(p.respawnAt,125);assert.equal(p.experience,70);assert.equal(p.maxExperience,380);
 assert.equal(p.health,undefined);assert.deepEqual(p.telemetryDamage,{toChampions:42});
 assert.deepEqual(p.itemCooldowns?.map(i=>[i.slot,i.itemId]),[[3,3157]]);
 assert.equal(normalizeCooldown({level:0,readyAt:140},120)?.state,'unlearned');
 assert.equal(normalizeDamage({toChampions:Infinity}),undefined);
 const buffs={baron:true,elder:true,baronExpiresAt:130,elderExpiresAt:140};
 assert.deepEqual(activeBuffs(buffs,135,true,false),{baron:false,elder:true});
 assert.deepEqual(activeBuffs(buffs,120,true,true),{baron:false,elder:false});
 assert.deepEqual(activeBuffs(buffs,120,false,false),{baron:false,elder:false});
});
function fixture(){
 const allPlayers=Array.from({length:10},(_,i)=>({rawChampionName:`game_character_displayname_Hero${i}`,team:i<5?'ORDER':'CHAOS',level:3,summonerName:`player${i}`,position:['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'][i%5],scores:{kills:0,deaths:0,assists:0,creepScore:15},items:[{itemID:3157,slot:3},{itemID:1001,slot:0}],summonerSpells:{summonerSpellOne:{displayName:'Flash'},summonerSpellTwo:{displayName:'Teleport'}}}));
 const sample={ok:true,gameTime:120,sampledAt:stamp.sampledAt,players:allPlayers.map((p,i)=>({champion:`Hero${i}`,team:i<5?'blue':'red',level:3,health:600,maxHealth:800,resource:200,maxResource:300,experienceTotal:700,currentGold:100,totalGold:900,buffs:{baron:true},spells:Array.from({length:13},(_,slot)=>({level:slot===3?0:1,readyAt:slot===4?145:slot===9?126:0,totalCooldown:slot===4?300:120,state:slot===3?'unlearned':'cooldown'}))})).reverse()};
 return {data:{allPlayers,gameData:{gameTime:120},activePlayer:{error:'no active player'},events:{Events:[]}},sample};
}
test('complete rune pages join reordered ten-player roster and reject mismatching keystone or trees',()=>{
 const ids=[8437,8446,8473,8451,8345,8347],alternate=[8010,9111,9105,8014,8347,8321];
 const {data,sample}=fixture();
 for(const [i,p] of data.allPlayers.entries())Object.assign(p,{runes:{keystone:{id:i%2?8010:8437},primaryRuneTree:{id:i%2?8000:8400},secondaryRuneTree:{id:8300}}});
 for(const p of sample.players){const odd=Number(p.champion.slice(4))%2;Object.assign(p,{fullRunes:{generalRunes:(odd?alternate:ids).map(id=>({id})),statRunes:[5008,5008,5001].map(id=>({id})),primaryRuneTree:{id:odd?8000:8400},secondaryRuneTree:{id:8300}}});}
 assert(mergeObserverTelemetry(data,sample,now));
 const players=normalizeLive(data,[]).players;
 for(const p of players){assert.deepEqual(p.fullRuneIds,Number(p.championId.slice(4))%2?alternate:ids);assert.deepEqual(p.statRuneIds,[5008,5008,5001]);}
 for(const mutation of [(p:any)=>p.fullRunes.generalRunes[0].id=8112,(p:any)=>p.fullRunes.primaryRuneTree.id=8100,(p:any)=>p.fullRunes.secondaryRuneTree.id=8200,(p:any)=>p.fullRunes.generalRunes.pop()]){
  const invalid=structuredClone(sample);mutation(invalid.players[0]);const fresh=structuredClone(data);for(const p of fresh.allPlayers)delete (p as any).fullRunes;
  assert(mergeObserverTelemetry(fresh,invalid,now));assert.equal(normalizeLive(fresh,[]).players.find(p=>p.championId==='Hero9')?.fullRuneIds,undefined);
 }
});
test('native exact CS, vision and six objective counters replace rounded API and incomplete event history',()=>{
 const {data,sample}=fixture();
 Object.assign(data.gameData,{mapNumber:11});
 for(const p of data.allPlayers)p.scores.creepScore=10;
 for(const p of sample.players)Object.assign(p,{scores:{kills:0,deaths:0,assists:0,creepScore:19},visionScore:17.4});
 const counts={blue:{towers:4,dragons:1,barons:0,voidgrubs:0,heralds:1,elders:0},red:{towers:3,dragons:3,barons:1,voidgrubs:3,heralds:0,elders:0}};
 Object.assign(sample,{objectiveCounts:counts});
 assert(mergeObserverTelemetry(data,sample));
 const normalized=normalizeLive(data,[]);
 assert(normalized.players.every(p=>p.cs===19&&p.statsSource==='memory'&&p.visionSource==='memory'&&p.visionScore===17.4));
 assert.equal(normalized.stats.blue.heralds,1);assert.equal(normalized.stats.red.voidgrubs,3);
 assert.equal(normalized.stats.blue.objectivesSource,'memory');assert.equal(normalized.stats.red.towers,3);
 (data as any)._observerCounts.sampledAt=new Date(Date.now()-4000).toISOString();
 assert.equal(normalizeLive(data,[]).stats.blue.objectivesAvailable,false);
 const invalid=fixture();Object.assign(invalid.sample.players[0],{scores:{kills:99,deaths:0,assists:0,creepScore:19}});
 assert(mergeObserverTelemetry(invalid.data,invalid.sample));
 assert(!normalizeLive(invalid.data,[]).players.some(p=>p.statsSource==='memory'));
});
test('join reordered objects by champion and side; preserve equipment slot through price sorting',()=>{
 const {data,sample}=fixture();assert.equal(mergeObserverTelemetry(data,sample,now),true);
 const normalized=normalizeLive(data,[]),p=normalized.players[0];
 assert.equal(p.health,600);assert.equal(p.telemetry?.source,'memory');assert.equal(p.goldSource,'memory');
 assert.equal(p.summonerSpells?.[0].cooldown?.readyAt,145);assert.equal(p.ultimate?.state,'unlearned');
 assert.equal(p.itemCooldowns?.find(i=>i.slot===3)?.cooldown.readyAt,126);
 assert.equal(bottomEquipment(p,{3157:{gold:3250},1001:{gold:300}})[0].slot,3);
 assert.equal(p.experience,40);assert.equal(p.maxExperience,480);
});
test('reject partial, duplicate, different-level and stale samples before mutating API data',()=>{
 for(const mutate of [(s:any)=>s.players.pop(),(s:any)=>s.players[0]=s.players[1],(s:any)=>s.players[0].level=5,(s:any)=>s.gameTime=124,(s:any)=>s.sampledAt=new Date(now-4000).toISOString()]){
  const {data,sample}=fixture(),original=structuredClone(data);mutate(sample);assert.equal(mergeObserverTelemetry(data,sample,now),false);assert.deepEqual(data,original);
 }
});
test('inventory mutations between API and memory samples invalidate only affected slot timers',()=>{
 const {data,sample}=fixture(),after=structuredClone(data);
 after.allPlayers[0].items[0].itemID=3031;
 invalidateChangedItemSlots(data,after,sample);assert.equal(mergeObserverTelemetry(after,sample,now),true);
 const p=normalizeLive(after,[]).players[0];
 assert.equal(p.itemCooldowns?.find(i=>i.slot===3),undefined);
 assert.equal(p.itemCooldowns?.find(i=>i.slot===0)?.itemId,1001);
});
test('mixed CN localization keys retain all ten vitals, R, summoner and equipment cooldowns',()=>{
 const {data,sample}=fixture(),after=structuredClone(data);
 // Observed live: Aatrox uses Character_Aatrox_Name alongside the older format.
 data.allPlayers[5].rawChampionName='Character_Aatrox_Name';
 after.allPlayers[5].rawChampionName='game_character_displayname_Aatrox';
 sample.players.find(p=>p.champion==='Hero5')!.champion='Aatrox';
 invalidateChangedItemSlots(data,after,sample);
 after.allPlayers[5].rawChampionName='Character_Aatrox_Name';
 assert.equal(mergeObserverTelemetry(after,sample,now),true);
 const players=normalizeLive(after,[]).players;
 assert.equal(players[5].championId,'Aatrox');
 for(const p of players){
  assert.equal(p.health,600);assert.equal(p.resource,200);assert.equal(p.experience,40);
  assert.equal(p.ultimate?.state,'unlearned');
  assert.equal(p.summonerSpells?.[0].cooldown?.readyAt,145);
  assert.equal(p.itemCooldowns?.find(i=>i.slot===3)?.cooldown.readyAt,126);
 }
 for(const raw of ['Aatrox','Character_Aatrox_Name','game_character_displayname_Aatrox'])assert.equal(liveChampionId(raw),'Aatrox');
 for(const raw of [null,{},'Unknown_Aatrox_Name','Character__Name','Character_Aatrox_Name_extra'])assert.equal(liveChampionId(raw),'');
});
test('damage is archived with provenance, exported, and survives later terminal samples',()=>{
 const s=createFixture();s.activeSourceGameId='42';
 const result=finalizeGame(s,{source:'live',sourceGameId:'42'})!;
 const champion={id:s.players[0].championId,key:123,name:'fixture',title:'',image:'',splash:'',tags:[]};
 const response={gameId:42,teams:[{teamId:100,players:[{championId:123,stats:{TOTAL_DAMAGE_DEALT_TO_CHAMPIONS:12000,TOTAL_DAMAGE_TAKEN:18000,PHYSICAL_DAMAGE_DEALT_TO_CHAMPIONS:9000,MAGIC_DAMAGE_DEALT_TO_CHAMPIONS:2500,TRUE_DAMAGE_DEALT_TO_CHAMPIONS:500}}]}]};
 enrichPostgame(s,{...response,gameId:43},[champion]);assert.equal(result.snapshot.players.some(p=>p.telemetryDamage),false);
 Object.assign(result.snapshot.players[0],{telemetryDamage:{toChampions:350,magicToChampions:350},telemetryDamageSource:'packets',telemetryDamageSession:'partial:1',telemetryDamageSince:900});
 assert(csvRecording(result.snapshot).includes('逐次伤害（游戏 900 秒起采集）'));
 enrichPostgame(s,response,[champion]);
 assert.deepEqual(result.snapshot.players[0].telemetryDamage,{toChampions:12000,taken:18000,physicalToChampions:9000,magicToChampions:2500,trueToChampions:500});
 assert.equal(result.snapshot.players[0].telemetryDamageSource,'postgame');
 assert.equal(result.snapshot.players[0].telemetryDamageSession,undefined);
 assert.equal(result.snapshot.players[0].telemetryDamageSince,undefined);
 const csv=csvRecording(result.snapshot);assert(csv.includes('官方赛后统计'));assert(csv.includes('"12000","18000","9000","2500","500"'));
 const terminal=structuredClone(s.players);Object.assign(terminal[0],{telemetryDamage:{toChampions:450},telemetryDamageSource:'packets',telemetryDamageSession:'partial:1',telemetryDamageSince:900});
 assert.equal(absorbTerminalGameSample(s,{players:terminal,stats:s.stats,events:s.events,gameTime:s.gameTime,sourceGameId:'42',ended:true}),true);
 assert.equal(result.snapshot.players[0].telemetryDamage?.toChampions,12000);
 assert.equal(result.snapshot.players[0].telemetryDamageSince,undefined);
 assert.equal(s.recordings.find(r=>r.id===result.snapshot.id)?.players[0].telemetryDamage?.toChampions,12000);
});
