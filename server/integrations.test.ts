import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import express from 'express';
import { IntegrationHub, integrationUrl, liveDataFeed, registerIntegrationRoutes } from './integrations';
import { ControlSeats } from './control-seats';
import { createFixture } from './test-support/fixture';
import { applyAction } from './state';
import { captureProgram } from '../shared/production';

async function harness(t: any, fetcher: typeof fetch = fetch) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'riftcast-integrations-')),state=createFixture(),hub=new IntegrationHub(dir,()=>state,fetcher);await hub.initialize();
  t.after(async()=>{hub.close();assert.ok(path.basename(dir).startsWith('riftcast-integrations-'));await rm(dir,{recursive:true,force:true});});return{state,hub,dir};
}
const config=()=>({webhooks:[{id:'one',name:'Receiver',url:'https://example.test/hook',enabled:true,events:['game.event','program.changed'],secret:'a-secure-test-secret'}]});

test('integration addresses preserve HTTPS and reject embedded credentials or active schemes',()=>{
  assert.equal(integrationUrl('https://example.com/hooks'),'https://example.com/hooks');assert.equal(integrationUrl('http://127.0.0.1:3999/'),'http://127.0.0.1:3999/');
  for(const url of ['file:///etc/passwd','javascript:alert(1)','http://example.com/a','https://user:pass@example.com/a','https://example.com/#a'])assert.throws(()=>integrationUrl(url));
});
test('feed follows programme identity, omits settings, accounts and local production files',()=>{
  const s=createFixture();s.settings.lockfilePath='private-lockfile';(s.settings as any).obsPassword='hidden';s.teams[0].players[0].account='private-account';s.production!.videos.push({id:'v',file:'C:/private/video.mkv'} as any);s.production!.program=captureProgram(s);s.match.title='staged title';
  const value=JSON.stringify(liveDataFeed(s));assert.doesNotMatch(value,/private-lockfile|hidden|private-account|private\/video|staged title/);assert.equal(liveDataFeed(s).match.title,s.production!.program.match.title);
});
test('key rotation revokes old access and config reads hide outgoing credentials',async t=>{
  const{hub,dir,state}=await harness(t);const a=await hub.rotateKey();assert.ok(hub.authorized(a));assert.equal(hub.authorized('bad'),false);const b=await hub.rotateKey();assert.equal(hub.authorized(a),false);assert.ok(hub.authorized(b));
  await hub.save(config());const status=JSON.stringify(hub.status());assert.doesNotMatch(status,/a-secure-test-secret/);const disk=await readFile(path.join(dir,'integrations.json'),'utf8');assert.ok(!disk.includes(b));
  const restored=new IntegrationHub(dir,()=>state);await restored.initialize();assert.ok(restored.authorized(b));assert.equal(restored.status().webhooks[0].url,config().webhooks[0].url);restored.close();
});
test('new event webhook has verifiable signature, retries stable delivery ID, and seeks rebase history',async t=>{
  const calls:{body:string;headers:Record<string,string>}[]=[];const fetcher=(async(_url,init)=>{calls.push({body:String(init!.body),headers:init!.headers as Record<string,string>});return new Response(null,{status:calls.length===1?503:204});}) as typeof fetch;
  const{hub,state}=await harness(t,fetcher);await hub.save(config());hub.observe(10000);await hub.flush(10000);assert.equal(calls.length,0);
  state.events.push({id:'new',time:state.gameTime,type:'ChampionKill',text:'new kill'});hub.observe(11000);await hub.flush(11000);assert.equal(calls.length,1);assert.equal(hub.status().pending,1);
  await hub.flush(14000);assert.equal(calls.length,2);const first=calls[0];assert.equal(first.headers['X-RiftCast-Signature'],'sha256='+createHmac('sha256','a-secure-test-secret').update(`${first.headers['X-RiftCast-Timestamp']}.${first.body}`).digest('hex'));assert.equal(first.headers['X-RiftCast-Delivery'],calls[1].headers['X-RiftCast-Delivery']);assert.equal(hub.status().deliveries[0].status,'sent');
  state.gameTime=20;state.events=[];hub.observe(15000);state.gameTime=100;state.events=[{id:'old',time:2,type:'ChampionKill',text:'past'}];hub.observe(16000);await hub.flush(16000);assert.equal(calls.length,2);
});
test('analysis settings stage without leaking into programme and publish with TAKE',()=>{
  const s=createFixture(),before=structuredClone(s.production!.program!.overlay);
  const prepared=applyAction(s,{type:'set-overlay',patch:{analysisMode:'participation',announcer:true,killFeed:true,inhibitorTimers:true,fullScoreboard:true}});
  assert.equal(prepared.overlay.analysisMode,'participation');assert.deepEqual(prepared.production!.program!.overlay,before);
  const aired=applyAction(prepared,{type:'take',scene:'live'});assert.equal(aired.production!.program!.overlay.analysisMode,'participation');assert.equal(aired.production!.program!.overlay.announcer,true);
  assert.throws(()=>applyAction(s,{type:'set-overlay',patch:{analysisMode:'untrusted'} as any}),/未知选项/);
});

test('failed credential persistence retains the working key and configuration',async t=>{
  const {hub,dir}=await harness(t);const key=await hub.rotateKey();await hub.save(config());
  await mkdir(path.join(dir,'integrations.json.tmp'));
  await assert.rejects(()=>hub.rotateKey());assert.equal(hub.authorized(key),true);
  await assert.rejects(()=>hub.save({webhooks:config().webhooks.map(h=>({...h,url:'https://changed.test/a'}))}));
  assert.equal(hub.status().webhooks[0].url,config().webhooks[0].url);
});
test('forward replay seeks do not publish crossed historical events',async t=>{
  let calls=0;const {hub,state}=await harness(t,(async()=>{calls++;return new Response(null,{status:204});}) as typeof fetch);await hub.save(config());
  state.gameTime=100;state.events=[];hub.observe(10000);state.gameTime=1000;state.events=[{id:'crossed',time:500,type:'ChampionKill',text:'old'}];hub.observe(11000);await hub.flush(11000);assert.equal(calls,0);
  state.gameTime=1001;state.events.push({id:'fresh',time:1001,type:'ChampionKill',text:'now'});hub.observe(12000);await hub.flush(12000);assert.equal(calls,1);
});

test('replaying an already observed event does not create a second delivery',async t=>{
  const payloads:any[]=[];const {hub,state}=await harness(t,(async(_url,init)=>{payloads.push(JSON.parse(String(init!.body)));return new Response(null,{status:204});}) as typeof fetch);await hub.save(config());
  state.gameTime=99;state.events=[];hub.observe(10000);
  const kill={id:'known-kill',time:100,type:'ChampionKill',text:'kill'};
  state.gameTime=100;state.events=[kill];hub.observe(11000);await hub.flush(11000);assert.equal(payloads.length,1);
  state.gameTime=90;state.events=[];hub.observe(12000);
  state.gameTime=99;hub.observe(21000);state.gameTime=100;state.events=[kill];hub.observe(22000);await hub.flush(22000);
  assert.equal(payloads.length,1,'same event must not be redelivered when the replay crosses it again');
  state.match.game++;state.gameTime=99;state.events=[];hub.observe(23000);state.gameTime=100;state.events=[kill];hub.observe(24000);await hub.flush(24000);
  assert.equal(payloads.length,2,'a new production may reuse source event IDs');
});

test('pending retry body stays immutable when source event data changes',async t=>{
  const payloads:string[]=[];const {hub,state}=await harness(t,(async(_url,init)=>{payloads.push(String(init!.body));return new Response(null,{status:payloads.length===1?503:204});}) as typeof fetch);await hub.save(config());
  state.gameTime=99;state.events=[];hub.observe(10000);state.gameTime=100;state.events=[{id:'mutable',time:100,type:'ChampionKill',text:'original'}];hub.observe(11000);await hub.flush(11000);
  state.events[0].text='edited after first attempt';await hub.flush(14000);
  assert.equal(payloads[1],payloads[0],'retries with one delivery ID must carry the original event body');
});

test('read-only data key cannot read integration settings or rotate the key over HTTP',async t=>{
  const {hub,state}=await harness(t),seats=new ControlSeats();
  const director=seats.issue({role:'director',name:'主导播'},true),data=seats.issue({role:'data',name:'资料'},true);
  const key=await hub.rotateKey();await hub.save(config());
  const app=express();app.use(express.json());registerIntegrationRoutes(app,hub,()=>state,req=>seats.authorize(req.headers['x-seat-token'],'output'));
  app.use((error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(400).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  assert.equal((await fetch(base+'/api/integrations/data')).status,401);
  const feed=await fetch(base+'/api/integrations/data',{headers:{Authorization:`Bearer ${key}`}});assert.equal(feed.status,200);assert.ok(!('settings' in await feed.json()));
  assert.equal((await fetch(base+'/api/integrations',{headers:{Authorization:`Bearer ${key}`}})).status,400);
  for(const token of [undefined,String(data.token)]){
    const response=await fetch(base+'/api/integrations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`,...(token?{'X-Seat-Token':token}:{})},body:JSON.stringify({action:'rotate-key'})});
    assert.equal(response.status,400);assert.equal(hub.authorized(key),true);
  }
  const status=await fetch(base+'/api/integrations',{headers:{'X-Seat-Token':String(director.token)}});assert.equal(status.status,200);assert.doesNotMatch(await status.text(),/a-secure-test-secret/);
});
