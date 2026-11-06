import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createServer} from 'node:net';
import {WebSocket} from 'ws';
import {TeamCollaboration} from './collaboration';
import {TeamCipher,teamKey,teamProof,checkProof} from './collaboration-crypto';

async function port(){const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const value=(server.address() as {port:number}).port;await new Promise<void>(r=>server.close(()=>r()));return value;}
async function until(fn:()=>unknown,label='condition'){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw new Error(label);}
const packet=(value:unknown)=>Buffer.concat([Buffer.from([0]),Buffer.from(JSON.stringify(value))]);
async function local(team:TeamCollaboration){const server=http.createServer();server.on('upgrade',(req,socket,head)=>team.upgrade(req,socket,head));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=(server.address() as {port:number}).port;const sockets:WebSocket[]=[];return {connect:async(id?:string)=>{const ws=new WebSocket(`ws://127.0.0.1:${address}/ws/collaboration?token=${team.snapshot().localToken}${id?`&id=${id}`:''}`);sockets.push(ws);await new Promise<void>((resolve,reject)=>{ws.once('open',()=>resolve());ws.once('error',reject)});return ws;},close:async()=>{sockets.forEach(ws=>ws.terminate());await new Promise<void>(r=>server.close(()=>r()));}};}

test('team records authenticate, conceal contents and reject tampering/replay/wrong keys',()=>{
 const key=teamKey('a'.repeat(32)),a=new TeamCipher(key),b=new TeamCipher(key);
 assert.equal(checkProof(key,'nonce',teamProof(key,'nonce')),true);assert.equal(checkProof(key,'other',teamProof(key,'nonce')),false);
 const sealed=a.seal(Buffer.from('private-program'));assert.equal(sealed.includes(Buffer.from('private-program')),false);assert.equal(b.open(sealed).toString(),'private-program');assert.throws(()=>b.open(sealed));
 const tampered=a.seal(Buffer.from('next'));tampered[15]^=1;assert.throws(()=>b.open(tampered));
 const wrong=new TeamCipher(teamKey('b'.repeat(32)));assert.throws(()=>wrong.open(new TeamCipher(key).seal(Buffer.from('secret'))));
 assert.equal(new TeamCipher(key).open(b.seal(Buffer.from('reply'))).toString(),'reply');
});
test('host relays continuous bidirectional media; requests require approval and receipts, disconnection restores host',{timeout:18000},async()=>{
 const applied:string[]=[];const host=new TeamCollaboration(()=>[{id:'live',name:'局内计分板'}],async r=>{applied.push(r.source??r.scene!)}),client=new TeamCollaboration(()=>[],async()=>{throw new Error('client cannot apply')});
 const hostLocal=await local(host),clientLocal=await local(client);
 try{
  const endpoint=await port();await host.host({port:endpoint,name:'main'});await client.join({address:`127.0.0.1:${endpoint}`,code:host.snapshot().code,name:'OB2'});await until(()=>client.snapshot().connected,'client pairs');assert.equal(client.snapshot().code,undefined);assert.equal(client.snapshot().sources.length,2);
  const control=await hostLocal.connect();control.send(packet({type:'share',mime:'video/webm;codecs=vp8',kind:'game'}));control.send(Buffer.from([1,1,2,3]));await until(()=>!!client.snapshot().sources[0].lastFrame,'host media heartbeat');
  const viewer=await clientLocal.connect('host');let received=false;viewer.on('message',data=>{const bytes=Buffer.from(data as Buffer);if(bytes[0]===1&&bytes.subarray(6).equals(Buffer.from([4,5,6])))received=true});control.send(Buffer.from([1,4,5,6]));await until(()=>received,'remote receives host preview');
  client.request({scene:'live'});await until(()=>host.snapshot().requests.length===1);assert.equal(applied.length,0);const id=host.snapshot().requests[0].id;await host.decide(id,true);await until(()=>client.snapshot().requests[0]?.status==='applied');assert.deepEqual(applied,['live']);await assert.rejects(host.decide(id,true),/已处理/);
  const clientControl=await clientLocal.connect();clientControl.send(packet({type:'share',mime:'video/webm;codecs=vp8',kind:'program'}));clientControl.send(Buffer.from([1,7,8,9]));const self=client.snapshot().self;await until(()=>!!host.snapshot().sources.find(s=>s.id===self)?.lastFrame);
  const hostView=await hostLocal.connect(self);let reverse=false;hostView.on('message',data=>{const bytes=Buffer.from(data as Buffer);if(bytes[0]===1&&bytes.subarray(2+bytes[1]).equals(Buffer.from([10,11,12])))reverse=true});clientControl.send(Buffer.from([1,10,11,12]));await until(()=>reverse,'host receives collaborator media');
  client.request({source:self});await until(()=>host.snapshot().requests.length===2);await host.decide(host.snapshot().requests[0].id,true);assert.equal(host.snapshot().activeSource,self);
  await client.stop();await until(()=>host.snapshot().activeSource==='host','fall back to host');assert.equal(applied.at(-1),'host');assert.equal(host.snapshot().sources.length,1);
 }finally{await client.close();await host.close();await clientLocal.close();await hostLocal.close();}
});
test('wrong pairing code fails and no-game requests wait for host preview; IPv6 joins and stopping rotates codes',{timeout:15000},async()=>{
 const host=new TeamCollaboration(()=>[{id:'live',name:'live'}],async()=>{}),wrong=new TeamCollaboration(()=>[],async()=>{}),client=new TeamCollaboration(()=>[],async()=>{});
 try{const endpoint=await port();await host.host({port:endpoint});const code=host.snapshot().code;await wrong.join({address:`127.0.0.1:${endpoint}`,code:'b'.repeat(32)});await until(()=>/配对失败/.test(wrong.snapshot().error??''));assert.equal(host.snapshot().sources.length,1);
 await client.join({address:`[::1]:${endpoint}`,code});await until(()=>client.snapshot().connected);client.request({scene:'live'});await until(()=>/预览已中断/.test(client.snapshot().error??''));assert.equal(host.snapshot().requests.length,0);assert.equal(client.snapshot().connected,true);
 await client.stop();await host.stop();await host.host({port:endpoint});assert.notEqual(host.snapshot().code,code);assert.equal(host.snapshot().sources.length,1);
 }finally{await client.close();await wrong.close();await host.close();}
});
test('OBS errors are returned as failed receipts; rejected requests never execute and host restore needs no capture',{timeout:6000},async()=>{
 const host=new TeamCollaboration(()=>[{id:'live',name:'live'}],async()=>{throw new Error('OBS disconnected')});try{await host.host({port:await port()});host.request({scene:'live'});await host.decide(host.snapshot().requests[0].id,false);assert.equal(host.snapshot().requests[0].status,'rejected');host.request({source:'host'});await host.decide(host.snapshot().requests[0].id,true);assert.equal(host.snapshot().requests[0].status,'failed');assert.equal(host.snapshot().requests[0].detail,'OBS disconnected');}finally{await host.close();}
});
