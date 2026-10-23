import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {Blowfish} from 'egoroof-blowfish';
import {decodeObserverChunk,LiveDamageStream} from './live-damage-stream';

const fixture=JSON.parse(await readFile(new URL('./fixtures/cn-damage-16.20.json',import.meta.url),'utf8'));
const current=JSON.parse(await readFile(new URL('./fixtures/cn-damage-16.21.json',import.meta.url),'utf8'));
const key=Buffer.from('test-key-16bytes!');
function block(time:number,damage=false,input=fixture){
  const s=input.samples[0],payload=damage?Buffer.from(s.payload):Buffer.alloc(0),b=Buffer.alloc(15+payload.length);
  b.writeFloatLE(time,1);b.writeUInt32LE(payload.length,5);b.writeUInt16LE(damage?(input===current?978:359):1,9);b.writeUInt32LE(damage?s.param:0,11);payload.copy(b,15);return b;
}
function chunk(id:number,input=fixture){
  return Buffer.from(new Blowfish(key,Blowfish.MODE.ECB,Blowfish.PADDING.PKCS5).encode(gzipSync(Buffer.concat([
    block((id-1)*30),block((id-1)*30+15,true,input),block(id*30-.01)]))));
}
function sample(time=70,pid=10):any{return {ok:true,pid,processSession:'session',profile:'cn-16.20.824.8524',gameTime:time,
  observerSession:{host:'spectator.test:8080',gameId:'123',platform:'TEST',target:'test-player-123456789',key:'private-test-key'},
  players:Array.from({length:10},(_,i)=>({networkId:1073741998+i,champion:`Hero${i}`,team:i<5?'blue':'red'}))};}
function backend(input=fixture){
  const state={last:5,fail:0,expired:0,calls:[] as number[],wrongGame:false};
  const stream=new LiveDamageStream(async(url,headers)=>{
    if(url.pathname.includes('getLastChunkInfo'))return Buffer.from(JSON.stringify({chunkId:state.last,startGameChunkId:1}));
    if(url.pathname.includes('getGameMetaData'))return Buffer.from(JSON.stringify({gameKey:{gameId:state.wrongGame?'wrong':'123',platformId:'TEST'},decodedEncryptionKey:key.toString('base64')}));
    assert.equal(headers['X-Riot-Spectator-Key'],'private-test-key');
    const id=Number(url.pathname.split('/').at(-1));state.calls.push(id);
    if(id===state.expired)throw Error('HTTP 404');
    if(id===state.fail)throw Error('unavailable');return chunk(id,input);
  });return {state,stream};
}
test('encrypted spectator chunks decode real damage and reject corrupt bodies',()=>{
  const c=decodeObserverChunk(chunk(1),key);assert.equal(c.from,0);assert.equal(c.events.length,1);
  assert.equal(c.events[0].amount,fixture.samples[0].amount);
  const bad=chunk(1);bad[0]^=255;assert.throws(()=>decodeObserverChunk(bad,key));
  assert.throws(()=>decodeObserverChunk(Buffer.alloc(7),key));
});

test('16.21 encrypted stream selects its protocol and invalidates cached damage when the build changes',async()=>{
  const decoded=decodeObserverChunk(chunk(1,current),key,current.build);
  assert.equal(decoded.events[0].amount,current.samples[0].amount);
  assert.throws(()=>decodeObserverChunk(chunk(1,current),key,'16.21.unknown'),/版本/);
  const {stream}=backend(current),s=sample();s.profile=`cn-${current.build}`;
  stream.enrich(s,0);await stream.settled();assert.equal(stream.enrich(s,1),true);
  const source=s.players.find((p:any)=>p.networkId===current.samples[0].source);
  assert.equal(source.damageStats.toChampions,current.samples[0].amount*2);
  assert.equal(stream.enrich(sample(),2),false,'an older build must start a new capture');
  assert.equal(stream.timeline(),undefined);stream.reset();
});
test('retention race trims only expired leading history and preserves explicit capture origin',async()=>{
  const {state,stream}=backend();state.expired=1;stream.enrich(sample(),0);await stream.settled();
  const s=sample();assert.equal(stream.enrich(s,1),true);assert.equal(s.players[5].damageStatsSince,30);
  assert.equal(s.players[5].damageStats.toChampions,fixture.samples[0].amount);
  state.last=6;state.expired=6;stream.enrich(sample(165),4000);await stream.settled();
  assert.equal(stream.enrich(sample(165),4001),false,'a missing tail cannot fabricate current damage');
  stream.reset();
});
test('live snapshots follow playback time, survive pause and deduplicate downloaded chunks',async()=>{
  const {state,stream}=backend();assert.equal(stream.enrich(sample(),0),false);await stream.settled();
  const s=sample();assert.equal(stream.enrich(s,1),true);assert.equal(s.players[5].damageStats.toChampions,fixture.samples[0].amount*2);
  assert.equal(s.players[5].damageStatsSince,0);assert.equal(stream.enrich(sample(151),2),false);
  state.last=6;stream.enrich(sample(165),4000);await stream.settled();
  const advanced=sample(165);assert.equal(stream.enrich(advanced,4001),true);
  assert.equal(advanced.players[5].damageStats.toChampions,fixture.samples[0].amount*6);
  assert.deepEqual(state.calls.sort((a,b)=>a-b),[1,2,3,4,5,6]);
  const paused=sample(70);stream.enrich(paused,4002);assert.equal(paused.players[5].damageStats.toChampions,s.players[5].damageStats.toChampions);
  stream.reset();
});
test('expired history changes capture epoch; incomplete and mismatched streams cannot publish damage',async()=>{
  const {state,stream}=backend();stream.enrich(sample(),0);await stream.settled();const old=sample();stream.enrich(old,1);
  state.last=12;state.fail=11;stream.enrich(sample(340),4000);await stream.settled();
  assert.equal(stream.enrich(sample(340),4001),false);
  state.fail=0;stream.enrich(sample(340),8000);await stream.settled();const next=sample(340);assert.equal(stream.enrich(next,8001),true);
  assert.equal(next.players[5].damageStatsSince,210);assert.notEqual(next.players[5].damageStatsSession,old.players[5].damageStatsSession);
  assert.equal(stream.enrich(sample(200),8002),false);
  const wrong=sample(340);wrong.players[0].champion='Wrong';assert.equal(stream.enrich(wrong,8003),false);
  stream.reset();state.wrongGame=true;stream.enrich(sample(),12000);await stream.settled();assert.equal(stream.enrich(sample(),12001),false);stream.reset();
});
test('a late response from a previous process cannot corrupt the new stream',async()=>{
  let release!:(b:Buffer)=>void;
  let first=true;
  const reader=new LiveDamageStream(async(url,headers,signal)=>{
    if(first){first=false;return new Promise(resolve=>{release=resolve;});}
    if(url.pathname.includes('getLastChunkInfo'))return Buffer.from('{"chunkId":5,"startGameChunkId":1}');
    if(url.pathname.includes('getGameMetaData'))return Buffer.from(JSON.stringify({gameKey:{gameId:'123',platformId:'TEST'},decodedEncryptionKey:key.toString('base64')}));
    return chunk(Number(url.pathname.split('/').at(-1)));
  });
  reader.enrich(sample(),0);const old=reader.settled();reader.enrich(sample(70,11),1);await reader.settled();
  release(Buffer.from('{"chunkId":100,"startGameChunkId":1}'));await old;
  assert.equal(reader.enrich(sample(70,11),2),true);reader.reset();
});
