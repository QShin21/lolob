// Read-only acceptance probe. Never controls the game, replay or program output.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {tsImport} from 'tsx/esm/api';
const {ObserverTelemetry}=await tsImport('../server/observer-telemetry.ts',import.meta.url);
const {localJson,normalizeLive}=await tsImport('../server/adapters.ts',import.meta.url);
const {bundledChampions}=await tsImport('../shared/champion-art.ts',import.meta.url);
const observer=new ObserverTelemetry(localJson),samples=[];
const playback=await localJson(2999,'/replay/playback');
try {
 for(let i=0;i<8&&samples.length<3;i++){
  if(i)await new Promise(resolve=>setTimeout(resolve,1000));
  const data=await localJson(2999,'/liveclientdata/allgamedata');await observer.enrich(data);
  if(observer.status.detail.startsWith('等待同一画面'))continue;
  assert.equal(observer.status.status,'connected',observer.status.detail);
  const n=normalizeLive(data,bundledChampions());assert.equal(n.players.length,10);
  assert(n.players.every(p=>p.telemetry?.source==='memory'&&p.health>=0&&p.maxHealth>0));
  samples.push({gameTime:n.gameTime,status:observer.status,players:n.players.map(p=>({champion:p.championId,side:p.team,level:p.level,health:p.health,maxHealth:p.maxHealth,resource:p.resource,maxResource:p.maxResource,resourceType:p.resourceType,experience:p.experience,maxExperience:p.maxExperience,gold:p.gold,spells:p.summonerSpells?.map(s=>({name:s.name,cooldown:s.cooldown})),ultimate:p.ultimate,itemCooldowns:p.itemCooldowns,buffs:p.buffs,isDead:p.isDead,respawnAt:p.respawnAt,damage:p.telemetryDamage}))});
 }
 assert.equal(samples.length,3,'Three consistent samples are required');
 await mkdir('verification-output/release-1.1.0',{recursive:true});
 await writeFile('verification-output/release-1.1.0/live-observer.json',JSON.stringify({verifiedAt:new Date().toISOString(),scope:'read-only current replay samples; no broadcast output acceptance',playback,samples},null,2));
 console.log(JSON.stringify({status:'passed',samples:samples.length,players:10,gameTime:samples.at(-1).gameTime,profile:observer.status.profile,activeCooldowns:samples.at(-1).players.flatMap(p=>p.spells??[]).filter(s=>s.cooldown?.state==='cooldown').length}));
}finally{await observer.close();}
