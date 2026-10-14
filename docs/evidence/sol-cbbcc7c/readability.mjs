// Follow-up observation prompted by manually inspected 640px programme screenshots.
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tsImport} from 'tsx/esm/api';
import {chromium} from './playwright-system.mjs';
const folder=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(folder,'../../..');
const{createSeed}=await tsImport(path.join(root,'server/state.ts'),import.meta.url);const seed=createSeed();seed.paused=true;seed.overlay.nativeHud='off';
const dir=await mkdtemp(path.join(tmpdir(),'lolob-sol-fonts-'));await writeFile(path.join(dir,'state.json'),JSON.stringify(seed));
const net=createServer();await new Promise(r=>net.listen(0,'127.0.0.1',r));const port=net.address().port;await new Promise(r=>net.close(r));const base=`http://127.0.0.1:${port}`;
const service=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:root,env:{...process.env,PORT:String(port),ENABLE_LAN:'0',RIFTCAST_DATA_DIR:dir,RIFTCAST_AUTO_CONNECT:'0',RIFTCAST_OBS_AUTOSTART:'0',RIFTCAST_OFFLINE:'1',RIFTCAST_OBS_MODE:'external'},stdio:['ignore','pipe','pipe','ipc']});service.stdout.resume();service.stderr.resume();
const delay=ms=>new Promise(r=>setTimeout(r,ms));let browser;const samples=[];
try{
 for(let i=0;i<75;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await delay(80);}
 const seat=await fetch(base+'/api/control/seat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Sol typography observer',role:'director'})}).then(r=>r.json());
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());await page.goto(base+'/overlay');
 for(const[width,height]of[[1920,1080],[1280,720],[640,360]]){await page.setViewportSize({width,height});for(const[scene,selectors]of[['live',['.lb-player-name','.lb-cs','.lb-kda']],['draft',['.cast-draft-player','.arena-pick-state','.cast-history-game > span']]]){
 const state=await fetch(base+'/api/state').then(r=>r.json());const reply=await fetch(base+'/api/action',{method:'POST',headers:{'content-type':'application/json','x-seat-token':seat.token},body:JSON.stringify({type:'take',scene,expectedConfigVersion:state.production.configVersion,requestId:crypto.randomUUID()})});if(!reply.ok)throw Error(await reply.text());await page.locator('.cast-scene-'+scene).waitFor();
 for(const selector of selectors){samples.push({width,height,scene,selector,...await page.locator(selector).first().evaluate(e=>({fontPx:parseFloat(getComputedStyle(e).fontSize),text:e.textContent}))});}
 }}
 await writeFile(path.join(folder,'readability.json'),JSON.stringify({source:'cbbcc7cb308bb1af20f4f7b4e12c2b417c6aea5f',status:'visual-concern',boundary:'Measured actual isolated production renderer; no real game composite. Typography observation, not a failed state assertion.',samples},null,2));console.log(JSON.stringify(samples));
}finally{await browser?.close();service.send({type:'riftcast-shutdown'});await delay(200);if(service.exitCode===null)service.kill('SIGTERM');}
