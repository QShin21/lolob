import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { WebSocket } from 'ws';
import { lanAddresses } from './security';

test('HTTP / WebSocket service, upload and LAN control credentials work together', {timeout:25000}, async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'riftcast-test-'));const port=52000+Math.floor(Math.random()*10000);const base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),windowsHide:true,env:{...process.env,PORT:String(port),ENABLE_LAN:'1',RIFTCAST_DATA_DIR:dir,RIFTCAST_AUTO_CONNECT:'0'},stdio:'ignore'});
  let ws:WebSocket|undefined;try{
    let ready=false;for(let i=0;i<60;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok){ready=true;break;}}catch{/* wait for the service to listen */}await new Promise(r=>setTimeout(r,150));}assert.ok(ready,'service must become available');
    assert.equal((await fetch(`${base}/api/health`).then(r=>r.json())).service,'riftcast-director');
    const state=await fetch(`${base}/api/state`).then(r=>r.json());assert.equal(state.mode,'demo');assert.equal(state.players.length,10);
    const cameras=await fetch(`${base}/api/obs/cameras`);assert.equal(cameras.status,503,'Camera enumeration reports disconnected OBS instead of inventing devices');
    assert.match((await cameras.json()).error,/OBS/);
    const feeds=await fetch(`${base}/api/obs/player-feeds`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json());assert.equal(feeds.applied,false,'Saved camera settings stay pending while OBS is disconnected');
    const wrongOrigin=await fetch(`${base}/api/action`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://evil.example'},body:JSON.stringify({type:'take'})});assert.equal(wrongOrigin.status,403);
    const taken=await fetch(`${base}/api/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'take',scene:'draft'})}).then(r=>r.json());assert.equal(taken.programScene,'draft');
    ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);const received=await new Promise<any>((resolve,reject)=>{ws!.once('message',data=>resolve(JSON.parse(data.toString())));ws!.once('error',reject);});assert.equal(received.programScene,'draft');assert.equal(received.settings.obsPassword,undefined);
    const form=new FormData();const pixels=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/K1sAAAAASUVORK5CYII=','base64');form.append('file',new Blob([pixels],{type:'image/png'}),'../../x.png');const upload=await fetch(`${base}/api/assets`,{method:'POST',body:form});assert.equal(upload.status,201);const asset=await upload.json();assert.match(asset.url,/^\/uploads\/[a-z0-9-]+\.png$/);assert.equal((await fetch(base+asset.url)).status,200);
    const network=await fetch(`${base}/api/network`).then(r=>r.json());assert.equal(network.enabled,true);assert.equal(typeof network.controlToken,'string');
    const addresses=lanAddresses();if(addresses.length){const remote=`http://${addresses[0]}:${port}`;const info=await fetch(`${remote}/api/network`).then(r=>r.json());assert.equal(info.controlToken,undefined);const denied=await fetch(`${remote}/api/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'take',scene:'live'})});assert.equal(denied.status,401);const allowed=await fetch(`${remote}/api/action`,{method:'POST',headers:{'Content-Type':'application/json','x-control-token':network.controlToken},body:JSON.stringify({type:'take',scene:'live'})});assert.equal(allowed.status,200);}
    assert.equal((await fetch(`${base}/api/export?format=csv`)).status,200);
    const post=(route:string,body:unknown)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await post('/api/economy/sample',{blue:'23.4k',red:'22.8k'})).status,400,'demo must reject real manual readings');
    await post('/api/action',{type:'set-mode',mode:'live'});
    const economic=await post('/api/economy/sample',{blue:'23.4k',red:'22.8k'}).then(r=>r.json());assert.equal(economic.source,'manual');assert.equal(economic.blue,23400);
    const real=await fetch(`${base}/api/state`).then(r=>r.json());assert.equal(real.stats.blue.gold,23400);assert.equal(real.stats.red.gold,22800);assert.equal(real.economy[0].source,'manual');assert.equal(real.players.length,0,'manual team gold must not fabricate individual stats');
    assert.equal((await post('/api/economy/sample',{blue:'23.4k 2',red:'22.8k'})).status,400);
    const exported=await fetch(`${base}/api/export?format=json`).then(r=>r.json());assert.equal(exported.economyFeed.source,'manual');assert.equal(exported.economy[0].blue,23400);
    assert.match(await fetch(`${base}/api/export?format=csv`).then(r=>r.text()),/人工校准/);
    assert.equal((await post('/api/economy/config',{enabled:false,blue:{x:.33,y:0,width:.08,height:.06},red:{x:.59,y:0,width:.08,height:.06}})).status,200);
    assert.equal((await post('/api/economy/config',{enabled:false,blue:{x:.95,y:0,width:.08,height:.06},red:{x:.59,y:0,width:.08,height:.06}})).status,400,'out-of-window ROI must fail');
    if(addresses.length){assert.equal((await fetch(`http://${addresses[0]}:${port}/api/economy/sample`,{method:'POST',headers:{'Content-Type':'application/json','x-control-token':network.controlToken},body:JSON.stringify({blue:23000,red:22000})})).status,403,'paired remote still cannot configure capture or read manual source');}
  }finally{ws?.terminate();child.kill();await new Promise<void>(resolve=>{if(child.exitCode!==null)resolve();else {child.once('exit',()=>resolve());setTimeout(resolve,3000);}});const absolute=path.resolve(dir);assert.ok(absolute.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(absolute).startsWith('riftcast-test-'));await rm(absolute,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
});

test('desktop IPC shutdown flushes the latest recording even while an older snapshot is being written',{timeout:25000},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'riftcast-test-'));const port=52000+Math.floor(Math.random()*10000);const base=`http://127.0.0.1:${port}`;
  const preload=path.join(dir,'slow-write.cjs');
  await writeFile(preload,`const fs=require('node:fs/promises');const original=fs.writeFile;fs.writeFile=async function(file,...args){if(typeof file==='string'&&file.endsWith('state.json.tmp')){process.send?.({type:'test-write-started'});await new Promise(resolve=>setTimeout(resolve,500));}return original.call(this,file,...args);};require('node:module').syncBuiltinESMExports();`);
  const child=spawn(process.execPath,['--require',preload,'--import','tsx','server/index.ts'],{cwd:process.cwd(),windowsHide:true,env:{...process.env,PORT:String(port),RIFTCAST_DATA_DIR:dir,ENABLE_LAN:'0'},stdio:['ignore','pipe','pipe','ipc']});
  let diagnostics='';child.stdout?.on('data',value=>{diagnostics+=value.toString();});child.stderr?.on('data',value=>{diagnostics+=value.toString();});
  try{
    let ready=false;for(let i=0;i<60;i++){try{if((await fetch(`${base}/api/health`)).ok){ready=true;break;}}catch{/* wait for startup */}await new Promise(resolve=>setTimeout(resolve,150));}assert.ok(ready,diagnostics);
    child.send({type:'unrelated-message'});assert.equal((await fetch(`${base}/api/health`)).status,200);
    const firstWrite=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('The delayed persistence hook did not run')),3000);child.on('message',message=>{if(message&&typeof message==='object'&&(message as {type?:unknown}).type==='test-write-started'){clearTimeout(timer);resolve();}});});
    const paused=await fetch(`${base}/api/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'demo-pause',paused:true})});assert.equal(paused.status,200);await firstWrite;
    const latest=await fetch(`${base}/api/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'save-recording',title:'退出前即时保存的记录'})}).then(response=>response.json());const recordingId=latest.recordings[0].id;
    const exited=new Promise<number|null>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Desktop service did not shut down: ${diagnostics}`)),5000);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});
    child.send({type:'riftcast-shutdown'});child.send({type:'riftcast-shutdown'});assert.equal(await exited,0);
    const saved=JSON.parse(await readFile(path.join(dir,'state.json'),'utf8'));assert.equal(saved.recordings[0].id,recordingId);assert.equal(saved.recordings[0].title,'退出前即时保存的记录');assert.equal(saved.revision,latest.revision);assert.equal(saved.paused,true);
  }finally{
    if(child.exitCode===null){child.kill();await new Promise<void>(resolve=>{child.once('exit',()=>resolve());setTimeout(resolve,3000);});}
    const absolute=path.resolve(dir);assert.ok(absolute.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(absolute).startsWith('riftcast-test-'));await rm(absolute,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
});
