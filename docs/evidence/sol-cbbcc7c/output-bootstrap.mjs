// Fresh output with no HTTP/WS snapshot: production sources, isolated loopback, no devices.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {chromium} from './playwright-system.mjs';
const folder=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(folder,'../../..');
const dir=await mkdtemp(path.join(tmpdir(),'lolob-sol-output-empty-'));
const net=createServer();await new Promise(r=>net.listen(0,'127.0.0.1',r));const port=net.address().port;await new Promise(r=>net.close(r));const base=`http://127.0.0.1:${port}`;
const service=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:root,env:{...process.env,PORT:String(port),ENABLE_LAN:'0',RIFTCAST_DATA_DIR:dir,RIFTCAST_AUTO_CONNECT:'0',RIFTCAST_OBS_AUTOSTART:'0',RIFTCAST_OFFLINE:'1',RIFTCAST_OBS_MODE:'external'},stdio:['ignore','pipe','pipe','ipc']});service.stdout.resume();service.stderr.resume();
const delay=ms=>new Promise(r=>setTimeout(r,ms));let browser;const requests=[];let result={status:'not-completed'};
try{
 for(let i=0;i<75;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await delay(80);}
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1920,height:1080}});
 await context.routeWebSocket('**/ws',ws=>ws.close());await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==base)return route.abort();if(r.method()!=='GET')return route.abort();if(u.pathname==='/api/state')return route.fulfill({status:503,json:{error:'SOL no first snapshot'}});return route.continue();});
 const page=await context.newPage();page.on('request',r=>requests.push({path:new URL(r.url()).pathname,method:r.method()}));await page.goto(base+'/overlay');await page.waitForTimeout(600);
 assert.equal(await page.locator('#root').innerText(),'');assert.equal(await page.locator('.loading-screen,.brand,.output-offline').count(),0);assert.ok(!requests.some(r=>r.method==='POST'||r.path==='/api/control/seat'));
 const image=await page.screenshot({omitBackground:true});const {data,info}=await sharp(image).raw().toBuffer({resolveWithObject:true});assert.equal(info.channels,4);assert.ok(data.every((v,i)=>i%4!==3||v===0));await writeFile(path.join(folder,'output-no-first-snapshot.png'),image);result={status:'passed',source:'cbbcc7cb308bb1af20f4f7b4e12c2b417c6aea5f',boundary:'Real isolated renderer; deliberately unavailable HTTP snapshot and closed WS; no actual source/OBS',checks:['No workstation UI before first output state','Every output pixel transparent','No seat issuance or business POST'],requests};console.log('PASS output bootstrap: 3 assertions');
}finally{await browser?.close();service.send({type:'riftcast-shutdown'});await delay(200);if(service.exitCode===null)service.kill('SIGTERM');await writeFile(path.join(folder,'output-bootstrap.json'),JSON.stringify(result,null,2));}
