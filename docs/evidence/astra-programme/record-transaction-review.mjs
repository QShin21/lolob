// Short implementation review. Real HTTP/WS/React with an isolated synthetic data directory.
// Device writes are blocked; no OBS hook or physical capture/output is used.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const evidence=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(evidence,'../../..');
const {createSeed}=await tsImport('../../../server/state.ts',import.meta.url);
const dir=await mkdtemp(path.join(tmpdir(),'lolob-astra-save-'));
const seed=createSeed();seed.paused=true;seed.recordings=[];
await writeFile(path.join(dir,'state.json'),JSON.stringify(seed));
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));
const port=listener.address().port;await new Promise(r=>listener.close(r));const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:root,env:{...process.env,PORT:String(port),ENABLE_LAN:'0',RIFTCAST_DATA_DIR:dir,RIFTCAST_AUTO_CONNECT:'0',RIFTCAST_OBS_AUTOSTART:'0',RIFTCAST_OFFLINE:'1',RIFTCAST_OBS_MODE:'external'},stdio:['ignore','pipe','pipe','ipc']});
child.stdout.resume();child.stderr.resume();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<75;i++){if(await fn())return;await delay(80);}throw Error(label);}
const state=()=>fetch(base+'/api/state').then(r=>r.json());
const checks=[],errors=[],requests=[];let browser,page,mode='',completed=false;
try{
 await until(async()=>{try{return(await fetch(base+'/api/health')).ok;}catch{return false;}},'isolated service ready');
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
 const context=await browser.newContext({viewport:{width:1366,height:736},locale:'zh-CN'});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();
  if(req.method()!=='GET'&&(url.pathname.startsWith('/api/obs/')||url.pathname==='/api/connect'||url.pathname.startsWith('/api/economy/')))return route.fulfill({status:403,json:{error:'Implementation review forbids physical writes'}});
  if(url.pathname==='/api/action'&&req.method()==='POST'){
   const body=req.postDataJSON();assert.equal(body.type,'save-recording');requests.push(body);
   if(mode==='reject'){mode='';return route.fulfill({status:409,json:{error:'合成配置冲突，未提交'}});}
   const response=await route.fetch();assert.equal(response.status(),200);
   if(mode==='lose'){mode='';return route.abort();}
   if(mode==='delay')await delay(1200);
   return route.fulfill({response});
  }
  return route.continue();
 });
 page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByRole('region',{name:'固定播出与应急控制'}).waitFor();
 await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'赛事与素材',exact:true}).click();
 const records=()=>page.getByRole('tab',{name:/比赛记录/}).click();await records();
 const title=page.getByRole('textbox',{name:'记录标题',exact:true}),save=()=>page.getByRole('button',{name:'保存记录',exact:true});
 await title.fill('Astra 同回合两次保存');mode='delay';
 await save().evaluate(e=>{e.click();e.click();});
 await until(()=>Promise.resolve(requests.length===1),'first request reached route');
 await page.getByRole('tab',{name:/战队与选手/}).click();await records();
 assert.ok(await page.getByRole('button',{name:'正在保存记录',exact:true}).isDisabled());
 await until(()=>save().isVisible(),'receipt received');mode='';
 assert.equal(requests.length,1);assert.equal((await state()).recordings.length,1);
 checks.push('Two synchronous native clicks plus classification switch: exactly one POST and one saved snapshot');
 await title.fill('Astra 丢失回执原事务');mode='lose';await save().click();
 const retry=page.getByRole('button',{name:'核对并重试原保存',exact:true});await retry.waitFor();
 assert.equal((await state()).recordings.length,2);assert.ok(await title.isDisabled());
 await page.getByRole('tab',{name:/战队与选手/}).click();await records();await retry.waitFor();
 await page.screenshot({path:path.join(evidence,'record-unknown-receipt.png')});
 await retry.click();await until(()=>save().isVisible(),'original receipt recovered');
 assert.equal(requests.length,3);assert.deepEqual(requests[1],requests[2]);assert.equal((await state()).recordings.length,2);
 checks.push('Actual server commit followed by aborted HTTP receipt: retry reuses exact ID/version/payload and retains exactly one snapshot');
 await title.fill('Astra 已知冲突保留标题');mode='reject';await save().click();
 await page.locator('.manage-records').getByRole('alert').filter({hasText:'合成配置冲突'}).waitFor();assert.equal(await title.inputValue(),'Astra 已知冲突保留标题');assert.ok(await title.isEnabled());
 await save().click();await until(async()=>!await title.inputValue(),'new known-rejection transaction saved');
 assert.equal(requests.length,5);assert.notEqual(requests[3].requestId,requests[4].requestId);assert.equal((await state()).recordings.length,3);
 assert.equal(errors.length,0);checks.push('Known first 409 retains editable title; explicit retry starts a new transaction and saves once');completed=true;
}finally{
 await browser?.close();child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(1500)]);if(child.exitCode===null)child.kill('SIGKILL');
 const files=['src/pages/ManagementRecords.tsx','src/pages/Management.tsx','src/useBroadcast.ts','src/lib.ts'];
 const source=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(path.join(root,f))).digest('hex')])));
 await writeFile(path.join(evidence,'record-transaction-result.json'),JSON.stringify({completed,base:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),scope:'Astra short implementation review, not Sol acceptance; isolated real HTTP/WS with synthetic data/faults; no physical devices',dataDir:dir,checks,errors,requests,source},null,2));
 console.log(JSON.stringify({completed,checks,errors,posts:requests.length}));
}
