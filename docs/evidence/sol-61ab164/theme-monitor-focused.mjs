import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {tsImport} from 'tsx/esm/api';
import {chromium} from './playwright-system.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),source='61ab1645378f1987fa62f478f75b87dddb83f2cc';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),source);
const evidence=path.join(path.dirname(fileURLToPath(import.meta.url)),'theme-monitor');await mkdir(evidence);
const dir=await mkdtemp(path.join(tmpdir(),'riftcast-sol-theme-note-'));
const {createSeed}=await tsImport(path.join(root,'server/state.ts'),import.meta.url),{captureProgram}=await tsImport(path.join(root,'shared/production.ts'),import.meta.url);
const seed=createSeed();seed.paused=true;seed.overlay.nativeHud='off';seed.previewScene=seed.programScene='economy';seed.production.program=captureProgram(seed);await writeFile(path.join(dir,'state.json'),JSON.stringify(seed));
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:root,env:{...process.env,PORT:String(port),ENABLE_LAN:'0',RIFTCAST_DATA_DIR:dir,RIFTCAST_AUTO_CONNECT:'0',RIFTCAST_OBS_AUTOSTART:'0',RIFTCAST_OFFLINE:'1',RIFTCAST_OBS_MODE:'external'},stdio:['ignore','pipe','pipe','ipc']});
let browser,log='',detail;const errors=[],actions=[];child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<100;i++){if(await fn())return;await wait(80);}throw Error(label);}
const state=()=>fetch(base+'/api/state').then(r=>r.json());
try{
 await until(async()=>{try{return(await fetch(base+'/api/health')).ok;}catch{return false;}},'isolated HTTP ready');
 browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1366,height:736},locale:'zh-CN'});
 await ctx.route('**/*',r=>{const req=r.request(),u=new URL(req.url());if(u.origin!==base)return r.abort();if(req.method()!=='GET'&&(u.pathname.startsWith('/api/obs/')||u.pathname==='/api/connect'))return r.fulfill({status:403,json:{error:'Sol blocks physical actions'}});return r.continue();});
 ctx.on('page',p=>{p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/action')actions.push(r.postDataJSON()?.type);});});
 const page=await ctx.newPage();await page.goto(base);for(const kind of ['program','preview'])await page.locator('.monitor-pane.'+kind).getByRole('button',{name:'查看场景排版',exact:true}).click();
 const output=await ctx.newPage();await output.setViewportSize({width:1920,height:1080});await output.goto(base+'/overlay');await output.locator('.chart-sample-note').waitFor();
 const programme=JSON.stringify((await state()).production.program);
 const note=async(p,selector)=>p.locator(selector).evaluate(e=>({text:e.textContent,color:getComputedStyle(e).color,uiMuted:getComputedStyle(e).getPropertyValue('--ui-muted').trim(),rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}}));
 const sample=async()=>({theme:await page.locator('html').getAttribute('data-ui-theme'),program:await note(page,'.monitor-pane.program .chart-sample-note'),preview:await note(page,'.monitor-pane.preview .chart-sample-note'),output:await note(output,'.chart-sample-note')});
 const picture=async(label,p=page)=>{await p.evaluate(()=>{let badge=document.getElementById('sol-theme-badge');if(!badge){badge=document.createElement('div');badge.id='sol-theme-badge';badge.textContent='SOL 隔离演示 / HUD 排版 · 未运行真实 OBS';badge.style.cssText='position:fixed;top:1px;right:1px;z-index:2147483647;background:#ffe69c;color:#111;font:11px sans-serif;pointer-events:none';document.body.append(badge);}});await p.screenshot({path:path.join(evidence,label+'.png')});};
 const dark=await sample();await picture('desktop-dark');await page.getByRole('button',{name:'切换浅色主题',exact:true}).click();await until(async()=>await page.locator('html').getAttribute('data-ui-theme')==='light','light theme');const light=await sample();await picture('desktop-light');await picture('overlay-fixed-dark',output);
 await page.getByRole('button',{name:'切换深色主题',exact:true}).click();await until(async()=>await page.locator('html').getAttribute('data-ui-theme')==='dark','return dark theme');const again=await sample();await picture('desktop-dark-again');
 detail={source,base,dir,environment:'Actual isolated HTTP and Chromium; pure demo, no engine hook/device/OBS',dark,light,again,actions,programmeUnchanged:JSON.stringify((await state()).production.program)===programme,errors};await writeFile(path.join(evidence,'observation.json'),JSON.stringify(detail,null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(actions,[]);assert.equal(detail.programmeUnchanged,true);assert.equal(light.output.color,dark.output.color,'actual overlay output stays fixed');assert.equal(again.program.color,dark.program.color,'returning to dark reproduces the original programme monitor color');
 assert.equal(light.program.color,dark.program.color,'desktop programme HUD text must not inherit console theme');
}catch(e){await writeFile(path.join(evidence,'result.json'),JSON.stringify({source,status:'fail',error:e.message,stack:e.stack,detail},null,2));console.log(e.message);process.exitCode=1;}
finally{await browser?.close();if(child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.send({type:'riftcast-shutdown'});await Promise.race([exited,wait(4000)]);if(child.exitCode===null)child.kill('SIGTERM');}await writeFile(path.join(evidence,'service.txt'),log);}
