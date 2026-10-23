import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { isolatedNativeEnvironment, nativeRequestGuard } from './verify-native-safety.mjs';
const { chromium }=await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE?pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href:'playwright');
const { createFixture }=await tsImport('../server/test-support/fixture.ts',import.meta.url);
const version=JSON.parse(await readFile('package.json','utf8')).version;
const dir=path.resolve('verification-output',`release-${version}`,'live-only');await mkdir(dir,{recursive:true});
const sandbox=await mkdtemp(path.join(os.tmpdir(),'riftcast-live-only-')),data=path.join(sandbox,'data');await mkdir(data);
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const base=`http://127.0.0.1:${port}`,checks=[],errors=[],blocked=[];let service,browser,page,log='';
const state=async()=>await(await fetch(base+'/api/state')).json();
async function stop(){if(!service||service.exitCode!==null)return;const done=once(service,'exit');service.send({type:'riftcast-shutdown'});let timer;await Promise.race([done,new Promise(r=>{timer=setTimeout(r,7000);})]);clearTimeout(timer);if(service.exitCode===null){service.kill();await done;}service=undefined;}
async function start(){
  service=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...await isolatedNativeEnvironment(sandbox),PORT:String(port),RIFTCAST_DATA_DIR:data,RIFTCAST_OBS_AUTOSTART:'0'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
  service.stdout.on('data',b=>log+=b);service.stderr.on('data',b=>log+=b);
  for(let i=0;i<150;i++){try{assert.equal((await(await fetch(base+'/api/health')).json()).version,version);return;}catch{if(service.exitCode!==null)throw new Error(log);await new Promise(r=>setTimeout(r,100));}}throw new Error(log||'Startup timed out');
}
async function settings(){
  await page.goto(base+'/index.html#settings');await page.getByRole('tab',{name:'数据连接',exact:true}).click();
  await page.getByRole('button',{name:'保存客户端设置',exact:true}).waitFor();
}
try{
  await start();const initial=await state();assert.equal(initial.mode,'live');assert.equal(initial.settings.pollInterval,500);
  assert.deepEqual(initial.players,[]);assert.deepEqual(initial.events,[]);assert.deepEqual(initial.economy,[]);assert.deepEqual(initial.schedule,[]);
  await new Promise(r=>setTimeout(r,1300));assert.equal((await state()).gameTime,0);
  checks.push('fresh service starts live-only with no match samples, schedule or advancing synthetic clock');
  browser=await chromium.launch({headless:true,channel:process.env.RIFTCAST_BROWSER_CHANNEL||'msedge'});
  const context=await browser.newContext({viewport:{width:1600,height:1000}});await nativeRequestGuard(blocked).attach(context);
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await settings();const interval=page.getByRole('spinbutton',{name:'客户端 API 轮询间隔（毫秒）'});
  assert.equal(await interval.inputValue(),'500');assert.equal(await interval.getAttribute('min'),'100');assert.equal(await interval.getAttribute('max'),'1000');
  assert.equal(await page.locator('.director-demo-controls,.cast-demo').count(),0);
  await page.screenshot({path:path.join(dir,'client-settings.png')});
  for(const value of [100,1000]){
    await interval.fill(String(value));await page.getByRole('button',{name:'保存客户端设置',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.settings-savebar')?.textContent.includes('客户端配置已同步'));
    assert.equal((await state()).settings.pollInterval,value);
  }
  const token=await page.evaluate(()=>sessionStorage.getItem('riftcast-seat-token'));assert.ok(token);
  for(const action of [{type:'set-mode',mode:'demo'},{type:'demo-pause',paused:false},{type:'demo-reset'},{type:'set-settings',patch:{pollInterval:99}},{type:'set-settings',patch:{pollInterval:1001}}]){
    const response=await fetch(base+'/api/action',{method:'POST',headers:{'content-type':'application/json','x-seat-token':token},body:JSON.stringify(action)});assert.equal(response.status,400,await response.text());
  }
  const beforeDemo=await state();await page.getByRole('tab',{name:'图形演示',exact:true}).click();
  await page.getByLabel('演示图形',{exact:true}).selectOption('combat:damage-flow');await page.locator('.demo-watermark').waitFor();
  const afterDemo=await state();assert.equal(afterDemo.mode,'live');assert.deepEqual(afterDemo.players,[]);assert.deepEqual(afterDemo.events,[]);assert.equal(afterDemo.gameTime,0);assert.deepEqual(afterDemo.production.program,beforeDemo.production.program);assert.deepEqual(afterDemo.schedule,[]);
  checks.push('isolated graphic demos render without injecting synthetic data into the real service, programme or archives');
  await page.goto(base+'/index.html#studio');await page.locator('.director-workspace').waitFor();
  assert.equal(await page.locator('.director-demo-controls,.cast-demo').count(),0);
  await page.screenshot({path:path.join(dir,'live-only-studio.png')});
  checks.push('production remains live-only; default and both interval boundaries save through actual settings; removed demo APIs and out-of-range values reject');
  await stop();await start();assert.equal((await state()).settings.pollInterval,1000);
  checks.push('saved polling interval survives service restart');
  await stop();const legacy=createFixture();legacy.mode='demo';legacy.match.seriesId='demo-seed-series';legacy.production.program.mode='demo';legacy.production.previousProgram={content:structuredClone(legacy.production.program),scene:'live'};legacy.settings.pollInterval=10000;
  await writeFile(path.join(data,'state.json'),JSON.stringify(legacy));await start();
  const upgraded=await state();assert.equal(upgraded.mode,'live');assert.equal(upgraded.phase,'pregame');assert.equal(upgraded.settings.pollInterval,1000);
  assert.deepEqual(upgraded.players,[]);assert.deepEqual(upgraded.events,[]);assert.equal(upgraded.production.previousProgram,undefined);assert.equal(upgraded.production.program.mode,'live');
  await stop();const saved=JSON.parse(await readFile(path.join(data,'state.json'),'utf8'));assert.equal(saved.mode,'live');assert.deepEqual(saved.players,[]);
  checks.push('actual service upgrades and durably saves legacy demo data as an empty live state; stale polling range is clamped');
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'passed',version,checks,errors,blocked,scope:'isolated service and built UI; no real game or broadcast'},null,2));
}catch(error){await page?.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'failed',version,checks,errors:[...errors,String(error)],blocked,log},null,2));throw error;}
finally{await browser?.close();await stop();await rm(sandbox,{recursive:true,force:true,maxRetries:5,retryDelay:500});}
