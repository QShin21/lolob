// Astra implementation self-review only. Sol owns independent acceptance.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import sharp from 'sharp';
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const evidence=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(evidence,'../../..');
const baseCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const tracked=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard','src','shared','server','scripts','package.json','package-lock.json'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const hashes={};for(const f of new Set(tracked)){try{hashes[f]=createHash('sha256').update(await readFile(path.join(root,f))).digest('hex');}catch{}}
await writeFile(path.join(evidence,'source.json'),JSON.stringify({baseCommit,workingTree:true,hashes},null,2));
const {createSeed}=await tsImport(path.join(root,'server/state.ts'),import.meta.url),{captureProgram}=await tsImport(path.join(root,'shared/production.ts'),import.meta.url);
const dir=await mkdtemp(path.join(tmpdir(),'riftcast-astra-workspaces-'));await mkdir(path.join(dir,'uploads'));
await sharp({create:{width:360,height:240,channels:4,background:{r:35,g:108,b:139,alpha:.7}}}).png().toFile(path.join(dir,'uploads','fixture.png'));
const seed=createSeed();seed.paused=true;seed.previewScene=seed.programScene='economy';seed.overlay.nativeHud='off';seed.production.program=captureProgram(seed);seed.assets.push({id:'synthetic-image',name:'隔离合成标志.png',url:'/uploads/fixture.png',type:'image/png',createdAt:new Date().toISOString(),width:360,height:240,category:'logo',alpha:true});await writeFile(path.join(dir,'state.json'),JSON.stringify(seed));
const net=createServer();await new Promise(r=>net.listen(0,'127.0.0.1',r));const port=net.address().port;await new Promise(r=>net.close(r));const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:root,env:{...process.env,PORT:String(port),ENABLE_LAN:'0',RIFTCAST_DATA_DIR:dir,RIFTCAST_AUTO_CONNECT:'0',RIFTCAST_OBS_AUTOSTART:'0',RIFTCAST_OFFLINE:'1',RIFTCAST_OBS_MODE:'external'},stdio:['ignore','pipe','pipe','ipc']});
let browser,log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
const errors=[],actions=[],checks=[],shots=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<80;i++){if(await fn())return;await wait(80);}throw Error(label);}
try{
 await until(async()=>{try{return(await fetch(base+'/api/health')).ok;}catch{return false;}},'isolated service ready');
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1366,height:736},locale:'zh-CN'});
 await context.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==base)return route.abort();if(req.method()!=='GET'&&(u.pathname.startsWith('/api/obs/')||u.pathname==='/api/connect'||u.pathname.startsWith('/api/economy/')))return route.fulfill({status:403,json:{error:'Astra self-review forbids physical source/device operations'}});return route.continue();});
 context.on('page',p=>{p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/action')actions.push(r.postDataJSON().type);});});
 const page=await context.newPage();await page.goto(base);await until(async()=>!!await page.evaluate(()=>sessionStorage.getItem('riftcast-seat-token')),'verified seat');
 const action=body=>page.evaluate(async body=>{const s=await fetch('/api/state').then(r=>r.json());const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','x-seat-token':sessionStorage.getItem('riftcast-seat-token')},body:JSON.stringify({...body,requestId:crypto.randomUUID(),expectedConfigVersion:s.production.configVersion})});if(!r.ok)throw Error((await r.json()).error);return r.json();},body);
 async function shot(name){await page.evaluate(()=>{let b=document.getElementById('astra-evidence');if(!b){b=document.createElement('div');b.id='astra-evidence';b.textContent='ASTRA 隔离演示自审 · 未连接真实 OBS';b.style.cssText='position:fixed;right:2px;top:1px;z-index:2147483647;background:#ffe59b;color:#171b21;font:10px sans-serif;pointer-events:none';document.body.append(b);}});await page.screenshot({path:path.join(evidence,name+'.png')});shots.push(name);}
 const nav=name=>page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name,exact:true}).click();
 for(const kind of ['program','preview'])await page.locator('.monitor-pane.'+kind).getByRole('button',{name:'查看场景排版',exact:true}).click();
 const colour=()=>page.locator('.monitor-pane.program .chart-sample-note').evaluate(e=>getComputedStyle(e).color);
 const dark=await colour();await page.getByRole('button',{name:'切换浅色主题',exact:true}).click();const light=await colour();assert.equal(dark,light);await page.getByRole('button',{name:'切换深色主题',exact:true}).click();checks.push({name:'desktop economy note uses fixed media colour',dark,light});
 await action({type:'finalize-game',winner:'blue'});
 const programme=JSON.stringify((await fetch(base+'/api/state').then(r=>r.json())).production.program);
 for(const theme of ['dark','light']){
  if(await page.locator('html').getAttribute('data-ui-theme')!==theme)await page.getByRole('button',{name:theme==='light'?'切换浅色主题':'切换深色主题',exact:true}).click();
  for(const [name,key]of[['实时数据','data'],['赛事与素材','manage'],['使用指南','help'],['赛后收尾','wrap']]){
   await nav(name);await page.locator(`.page-${key} .domain-workspace:visible`).waitFor();await wait(120);
   const geometry=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};return{viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],footer:rect(document.querySelector('.broadcast-status')),heading:rect(document.querySelector('.control-page:not([hidden]) h1'))};});
   assert.equal(geometry.document[0],1366);assert.ok(geometry.footer.bottom<=738);assert.ok(geometry.heading.y>=0);checks.push({name:`${key} ${theme} 1366x736`,geometry});await shot(`${key}-${theme}-1366x736`);
  }
 }
 await nav('赛事与素材');await page.getByRole('tab',{name:/战队与选手/}).click();await page.locator('.manage-object[data-kind=team]').first().click();await page.getByLabel('选手 1 游戏账号',{exact:true}).fill('isolated-draft-account');await shot('manage-team-light-1366x736');await page.locator('.manage-object[data-kind=team]').nth(1).click();await page.locator('.manage-object[data-kind=team]').first().click();assert.equal(await page.getByLabel('选手 1 游戏账号',{exact:true}).inputValue(),'isolated-draft-account');checks.push({name:'per-team local draft preserved when switching objects'});
 await page.getByRole('tab',{name:/图片素材/}).click();await shot('manage-assets-light-1366x736');await page.getByRole('tab',{name:/比赛记录/}).click();await shot('manage-records-light-1366x736');
 await nav('赛后收尾');await page.getByRole('tab',{name:'报告核对',exact:true}).click();await shot('wrap-report-light-1366x736');await page.getByRole('tab',{name:'重赛与修订',exact:true}).click();await shot('wrap-corrections-light-1366x736');
 await page.getByRole('button',{name:'前往 BP 规则开启新系列赛',exact:true}).click();await page.getByRole('tab',{name:'规则与历史',exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'规则与历史',exact:true}).getAttribute('aria-selected'),'true');checks.push({name:'wrap navigation reaches real BP rules without starting a series'});
 await nav('使用指南');await page.getByRole('button',{name:/伴侣有画面，却没有声音/}).click();await page.getByRole('button',{name:'打开输出信号路径',exact:true}).click();await page.locator('.settings-directory button[aria-selected=true],.settings-directory button[aria-current=page]').getByText('输出',{exact:true}).waitFor().catch(async()=>{await page.getByRole('heading',{name:'输出',exact:true}).waitFor();});checks.push({name:'help navigates to actual output task'});
 for(const [width,height,key,name]of[[1920,1080,'data','实时数据'],[1920,1080,'manage','赛事与素材'],[1440,900,'help','使用指南'],[1440,900,'wrap','赛后收尾']]){await page.setViewportSize({width,height});await nav(name);await shot(`${key}-light-${width}x${height}`);}
 const owner=await page.evaluate(()=>sessionStorage.getItem('riftcast-seat-token'));const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});await mobile.goto(base+'/remote?seat='+encodeURIComponent(owner));await mobile.getByRole('heading',{name:'主导播席',exact:true}).waitFor();for(const scroll of [0,10000]){await mobile.evaluate(y=>scrollTo(0,y),scroll);const r=await mobile.locator('.remote-take-dock').boundingBox();assert.ok(r&&r.y>600&&r.y+r.height<=846&&r.x>=0&&r.x+r.width<=392);}checks.push({name:'verified current controller dock is in viewport before and after scroll'});
 assert.equal(JSON.stringify((await fetch(base+'/api/state').then(r=>r.json())).production.program),programme);assert.ok(!actions.includes('take'));assert.deepEqual(errors,[]);checks.push({name:'navigation, theme and local edits did not TAKE or change programme snapshot'});
 await writeFile(path.join(evidence,'result.json'),JSON.stringify({status:'pass',baseCommit,environment:'Linux Chromium / actual isolated HTTP / demo / no OBS or physical devices',dir,checks,shots,errors,actions},null,2));console.log(JSON.stringify({status:'pass',checks:checks.length,screenshots:shots.length,pageErrors:errors.length}));
}catch(e){await writeFile(path.join(evidence,'result.json'),JSON.stringify({status:'fail',baseCommit,error:e.message,stack:e.stack,dir,checks,shots,errors,actions},null,2));console.error(e);process.exitCode=1;}
finally{await browser?.close();if(child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.send({type:'riftcast-shutdown'});await Promise.race([exited,wait(4000)]);if(child.exitCode===null)child.kill('SIGTERM');}await writeFile(path.join(evidence,'service.txt'),log);}
