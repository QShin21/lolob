import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { damageBlocks, decodeDamageBlock, parseReplayDamage, ReplayDamageIndex, type DamageHero } from './replay-damage';
import { ReplayDamageTelemetry } from './replay-damage-telemetry';
import { decodeCnDamageParameters } from './protocol/cn-16.20-damage';

const fixture=JSON.parse(await readFile(new URL('./fixtures/cn-damage-16.20.json',import.meta.url),'utf8'));
const heroes:DamageHero[]=Array.from({length:10},(_,i)=>({networkId:1073741998+i,champion:`Hero${i}`,team:i<5?'blue':'red',officialTotal:0}));
const events=fixture.samples.map((s:any)=>({time:s.time,source:s.source,target:s.target,amount:s.amount,type:s.type}));
function block(id:number,param:number,time:number,payload:number[]=[]){
  const b=Buffer.alloc(15+payload.length);b[0]=0;b.writeFloatLE(time,1);b.writeUInt32LE(payload.length,5);
  b.writeUInt16LE(id,9);b.writeUInt32LE(param,11);Buffer.from(payload).copy(b,15);return b;
}
function chunk(id:number,type:number,blocks:Buffer[]){
  const body=Buffer.concat(blocks),head=Buffer.alloc(17);head.writeUInt32LE(id);head.writeUInt32LE(id+1,4);
  head[8]=type;head.writeUInt32LE(body.length,9);return Buffer.concat([head,body]);
}
function replay(extraGameChunk?:Buffer){
  const version=Buffer.from(fixture.build),header=Buffer.alloc(15);header.write('RIOT');header.writeUInt16LE(2,4);header[14]=version.length;
  const keyframe=chunk(1,2,heroes.flatMap(h=>[block(1093,h.networkId,0),block(853,h.networkId,0)]));
  const game=chunk(1,1,fixture.samples.map((s:any)=>block(359,s.param,s.time,s.payload)));
  const stats=heroes.map(h=>({SKIN:h.champion,TEAM:h.team==='blue'?100:200,
    TOTAL_DAMAGE_TAKEN:Math.floor(events.filter((e:any)=>e.target===h.networkId).reduce((sum:number,e:any)=>sum+e.amount,0)),
    TOTAL_DAMAGE_DEALT_TO_CHAMPIONS:Math.floor(events.filter((e:any)=>e.source===h.networkId).reduce((sum:number,e:any)=>sum+e.amount,0))}));
  const footer=Buffer.from(JSON.stringify({gameLength:200000,statsJson:JSON.stringify(stats)})),size=Buffer.alloc(4);size.writeUInt32LE(footer.length);
  return Buffer.concat([header,version,keyframe,game,...extraGameChunk?[extraGameChunk]:[],Buffer.alloc(256),footer,size]);
}
test('captured CN packets decode physical, magic and true damage with exact source and target',()=>{
  for(const sample of fixture.samples){
    assert.deepEqual(decodeDamageBlock({id:359,param:sample.param,time:sample.time,payload:Uint8Array.from(sample.payload)}),
      {time:sample.time,source:sample.source,target:sample.target,amount:sample.amount,type:sample.type});
    assert.throws(()=>decodeCnDamageParameters(Uint8Array.from(sample.payload.slice(0,-1))));
    assert.throws(()=>decodeCnDamageParameters(Uint8Array.from([...sample.payload,0])));
  }
});
test('ROFL2 relative timestamp, inherited packet id and relative param retain exact packet boundaries',()=>{
  const absolute=block(359,1073741998,60,[1,2]);
  const relative=Buffer.from([0xf0,100,2,3,4,5]);
  const blocks=[...damageBlocks(Buffer.concat([absolute,relative]))];
  assert.equal(blocks[1].time,60.1);assert.equal(blocks[1].id,359);assert.equal(blocks[1].param,1073742001);
  assert.deepEqual([...blocks[1].payload],[4,5]);assert.throws(()=>[...damageBlocks(absolute.subarray(0,-1))]);
});
test('complete replay checks roster and official totals; snapshots do not contribute damage',async()=>{
  const index=await parseReplayDamage(replay());
  assert.equal(index.at(1073742003,60)?.toChampions,0);
  assert.equal(index.at(1073742003,62)?.toChampions,fixture.samples[0].amount);
  assert.equal(index.at(1073742001,200)?.magicToChampions,fixture.samples[1].amount);
  assert.equal(index.at(1073742002,200)?.trueToChampions,14);
  assert.equal(index.at(1073742003,60)?.toChampions,0,'seeking backwards must not retain future output');
  assert.equal(index.at(1073742003,203),undefined);
  const wrongVersion=replay();wrongVersion[15]='0'.charCodeAt(0);await assert.rejects(parseReplayDamage(wrongVersion),/版本/);
  await assert.rejects(parseReplayDamage(replay(chunk(1,1,[]))),/重复/);
  await assert.rejects(parseReplayDamage(replay(),()=>true),/更换/);
  const bad=replay();bad.writeUInt32LE(0xffffffff,bad.length-4);await assert.rejects(parseReplayDamage(bad),/范围/);
});
test('enemy hero filtering excludes pets, minions, self damage and friendly fire',()=>{
  const index=new ReplayDamageIndex(heroes,200,[...events,
    {time:100,source:1073741998,target:1073741999,amount:500,type:0},
    {time:100,source:1073741998,target:1073741998,amount:500,type:0},
    {time:100,source:1073741998,target:123,amount:500,type:0},
    {time:100,source:123,target:1073742003,amount:500,type:0}]);
  assert.equal(index.at(1073741998,200)?.toChampions,0);
});
function sample(pid=10){return {ok:true,pid,processSession:'session',profile:'cn-16.20.824.8524',replayPath:'C:/replay.rofl',
  gameTime:100,players:heroes.map(h=>({...h}))} as any;}
test('background telemetry binds every hero and process, exports current-time totals, and rejects a mismatched roster',async()=>{
  const index=await parseReplayDamage(replay()),reader=new ReplayDamageTelemetry(async()=>index),s=sample();
  assert.equal(reader.enrich(s),false);await reader.settled();assert.equal(reader.enrich(s),true);
  assert.equal(s.players[5].damageStats.toChampions,fixture.samples[0].amount);
  assert.equal(s.players[5].damageStatsSource,'packets');
  const bad=sample();bad.players[0].champion='Wrong';assert.equal(reader.enrich(bad),false);
  assert.equal(bad.players[5].damageStats,undefined);
  const sought=sample();sought.gameTime=10;assert.equal(reader.enrich(sought),true);assert.equal(sought.players[5].damageStats.toChampions,0);
  assert.equal(reader.enrich(sample(11)),false);
});
test('a slow result from a closed process cannot become the next match damage',async()=>{
  const index=await parseReplayDamage(replay());let release!:(value:ReplayDamageIndex)=>void;
  const reader=new ReplayDamageTelemetry(()=>new Promise(resolve=>{release=resolve;}));
  reader.enrich(sample());const old=reader.settled();reader.reset();release(index);await old;
  assert.equal(reader.enrich(sample(12)),false);
  assert.equal(reader.detail,'正在解析回放逐次伤害');reader.reset();
});

test('received damage includes minions, towers and self damage, follows seeks and matches the target',()=>{
 const index=new ReplayDamageIndex(heroes,200,[
 {time:10,source:heroes[5].networkId,target:heroes[0].networkId,amount:120,type:0},
 {time:20,source:123,target:heroes[0].networkId,amount:50,type:1},
 {time:30,source:heroes[0].networkId,target:heroes[0].networkId,amount:10,type:2}]);
 assert.equal(index.at(heroes[0].networkId,30)?.taken,180);
 assert.equal(index.at(heroes[0].networkId,15)?.taken,120);
 assert.equal(index.at(heroes[0].networkId,5)?.taken,0);
 assert.equal(index.at(heroes[5].networkId,30)?.toChampions,120);
 assert.equal(index.at(heroes[5].networkId,30)?.taken,0);
});
