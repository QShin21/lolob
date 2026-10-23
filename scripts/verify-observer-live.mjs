// Read-only acceptance probe. Never controls the game, replay or program output.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {tsImport} from 'tsx/esm/api';
const {ObserverTelemetry}=await tsImport('../server/observer-telemetry.ts',import.meta.url);
const {localJson,normalizeLive}=await tsImport('../server/adapters.ts',import.meta.url);
const {bundledChampions}=await tsImport('../shared/champion-art.ts',import.meta.url);
const {neutralObjectives}=await tsImport('../server/neutral-objectives.ts',import.meta.url);
const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const requireDamage=process.argv.includes('--require-damage');
const observer=new ObserverTelemetry(localJson),samples=[];
const playback=await localJson(2999,'/replay/playback');
try {
 for(let i=0;i<25&&samples.length<3;i++){
  if(i)await new Promise(resolve=>setTimeout(resolve,1000));
  const data=await localJson(2999,'/liveclientdata/allgamedata');await observer.enrich(data);
  if(observer.status.detail.startsWith('等待同一画面'))continue;
  assert.equal(observer.status.status,'connected',observer.status.detail);
  const n=normalizeLive(data,bundledChampions());assert.equal(n.players.length,10);
  assert(n.players.every(p=>p.telemetry?.source==='memory'&&p.health>=0&&p.maxHealth>0));
  assert(n.players.every(p=>p.fullRuneIds?.length===6&&p.statRuneIds?.length===3),'All ten complete rune pages are required');
  assert(n.players.every(p=>p.goldSource==='memory'&&p.statsSource==='memory'&&p.visionSource==='memory'),'Gold, exact CS and vision must come from the matched native sample');
  if(requireDamage&&!n.players.every(p=>p.telemetryDamageSource==='packets'&&Number.isFinite(p.telemetryDamage?.toChampions)))continue;
  const objectives=neutralObjectives(data);
  assert(data._observerObjectives&&data._observerCounts,'Native objective timers and counters are required');
  samples.push({gameTime:n.gameTime,status:observer.status,stats:n.stats,objectives,players:n.players.map(p=>({champion:p.championId,side:p.team,level:p.level,health:p.health,maxHealth:p.maxHealth,resource:p.resource,maxResource:p.maxResource,resourceType:p.resourceType,experience:p.experience,maxExperience:p.maxExperience,gold:p.gold,currentGold:p.currentGold,cs:p.cs,visionScore:p.visionScore,fullRuneIds:p.fullRuneIds,statRuneIds:p.statRuneIds,spells:p.summonerSpells?.map(s=>({name:s.name,cooldown:s.cooldown})),ultimate:p.ultimate,itemCooldowns:p.itemCooldowns,buffs:p.buffs,isDead:p.isDead,respawnAt:p.respawnAt,damage:p.telemetryDamage,damageSource:p.telemetryDamageSource,damageSince:p.telemetryDamageSince}))});
 }
 assert.equal(samples.length,3,'Three consistent samples are required');
 const output=`verification-output/release-${version}`;
 await mkdir(output,{recursive:true});
 await writeFile(`${output}/live-observer.json`,JSON.stringify({verifiedAt:new Date().toISOString(),version,scope:'read-only current spectator/replay samples; no broadcast output acceptance',requireDamage,playback,samples},null,2));
 console.log(JSON.stringify({status:'passed',samples:samples.length,players:10,gameTime:samples.at(-1).gameTime,profile:observer.status.profile,damagePlayers:samples.at(-1).players.filter(p=>p.damageSource==='packets').length,activeCooldowns:samples.at(-1).players.flatMap(p=>p.spells??[]).filter(s=>s.cooldown?.state==='cooldown').length,output:`${output}/live-observer.json`}));
}finally{await observer.close();}
