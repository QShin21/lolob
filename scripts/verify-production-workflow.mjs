// Built UI against an isolated real HTTP service. It never starts OBS or loads the operator's data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=path.join(root,'verification-output','production-0.3.0');await mkdir(evidence,{recursive:true});
const {createSeed}=await tsImport('../server/state.ts',import.meta.url);
const seed=createSeed();seed.paused=true;seed.previewScene='standby';seed.programScene='standby';
const dir=await mkdtemp(path.join(tmpdir(),'riftcast-production-ui-'));await writeFile(path.join(dir,'state.json'),JSON.stringify(seed));
const port=52000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),ENABLE_LAN:'0',RIFTCAST_DATA_DIR:dir,RIFTCAST_AUTO_CONNECT:'0',RIFTCAST_OBS_AUTOSTART:'0',RIFTCAST_OFFLINE:'1'},stdio:['ignore','ignore','ignore','ipc']});
let browser;const tests=[],errors=[];let takes=0;
const state=()=>fetch(base+'/api/state').then(r=>r.json());
const until=async(check,label)=>{for(let i=0;i<60;i++){if(await check())return;await new Promise(r=>setTimeout(r,80));}throw new Error(label);};
try{
  await until(async()=>{try{return (await fetch(base+'/api/health')).ok;}catch{return false;}},'service ready');
  const {chromium}=await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE?pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href:'playwright');
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1920,height:1080},locale:'zh-CN'});
  await context.route('**/api/resources/asset?**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"data":{}}'}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{if(request.url().endsWith('/api/action')&&request.postDataJSON()?.type==='take')takes++;});
  await page.goto(base);await page.getByRole('region',{name:'固定播出与应急控制'}).waitFor();
  await until(()=>page.evaluate(()=>!!sessionStorage.getItem('riftcast-seat-token')),'seat established');
  const action=async body=>page.evaluate(async body=>{const s=await fetch('/api/state').then(r=>r.json());const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','x-seat-token':sessionStorage.getItem('riftcast-seat-token')},body:JSON.stringify({...body,requestId:crypto.randomUUID(),expectedConfigVersion:s.production.configVersion})});if(!r.ok)throw new Error((await r.json()).error);return r.json();},body);
  const overlay=await context.newPage();overlay.on('pageerror',e=>errors.push(e.message));await overlay.goto(base+'/overlay');await overlay.getByText(seed.match.title,{exact:true}).first().waitFor();
  await action({type:'set-match',patch:{title:'隔离验证 · 待播标题'}});await action({type:'set-overlay',patch:{ticker:true,tickerText:'隔离验证字幕'}});
  assert.equal((await state()).production.program.match.title,seed.match.title);await overlay.getByText(seed.match.title,{exact:true}).first().waitFor();
  tests.push('pending title and ticker preserve on-air content');
  await page.getByRole('button',{name:'整体切入',exact:true}).click();await overlay.getByText('隔离验证 · 待播标题',{exact:true}).first().waitFor();
  assert.equal((await state()).production.program.version,(await state()).production.configVersion);tests.push('same-scene TAKE commits the full staged configuration');
  await page.getByRole('button',{name:'赛事与素材',exact:true}).click();assert.ok(await page.getByRole('region',{name:'固定播出与应急控制'}).isVisible());
  await page.getByRole('tab',{name:/战队与选手/}).click();await page.locator('.team-directory-card').first().click();
  await page.getByLabel('选手 1 游戏账号',{exact:true}).fill('fixture-account');const before=takes;
  await page.keyboard.press('Control+Enter');await new Promise(r=>setTimeout(r,200));assert.equal(takes,before);tests.push('editing account fields suppresses TAKE hotkeys');
  const openedVersion=(await state()).production.configVersion;await action({type:'set-overlay',patch:{sponsor:'并发资料修改'}});
  await page.getByRole('button',{name:'保存战队',exact:true}).click();await page.getByText('配置已被其他席位修改，请核对最新版本后重新保存',{exact:true}).waitFor();
  assert.equal((await state()).teams[0].players[0].account,undefined);assert.equal((await state()).production.configVersion,openedVersion+1);tests.push('stale team editor is rejected without overwriting new settings');
  await page.getByRole('button',{name:'BP 与阵容',exact:true}).click();await page.getByRole('heading',{name:'赛事规则、BP 接管与最终归属'}).waitFor();
  await page.getByRole('button',{name:'人工接管',exact:true}).click();await until(async()=>(await state()).production.draftMode==='manual','manual BP');
  const hold=page.getByRole('button',{name:'按住新系列赛',exact:true});await hold.click();assert.equal((await state()).match.seriesId,seed.match.seriesId);
  const box=await hold.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await new Promise(r=>setTimeout(r,1150));await page.mouse.up();
  await until(async()=>(await state()).match.seriesId!==seed.match.seriesId,'held series reset');assert.deepEqual([(await state()).match.blueScore,(await state()).match.redScore],[0,0]);tests.push('short clicks do not reset series; held actions start at 0:0');
  await page.getByRole('button',{name:'导播工作台',exact:true}).click();await page.screenshot({path:path.join(evidence,'studio-1920.png'),fullPage:true});
  await page.getByText(/比赛日检查与固定版本/).click();await page.getByRole('button',{name:'检查全部素材',exact:true}).click();await page.getByText(/英雄 173 位 · 缺失 0 项/).waitFor();tests.push('all bundled hero assets are inventoried without network access');
  await page.getByText(/待播顺序、字幕立即播出与控制席/).click();await page.getByRole('button',{name:'加入待播顺序',exact:true}).click();await until(async()=>(await state()).production.rundown.length===1,'rundown persisted');
  await page.screenshot({path:path.join(evidence,'checks-and-rundown.png'),fullPage:true});tests.push('rundown preparations persist through the actual HTTP service');
  await page.setViewportSize({width:1366,height:768});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(evidence,'studio-1366.png'),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert.equal(overflow,false);tests.push('1366 pixel console fits without document horizontal overflow');
  await page.evaluate(()=>window.scrollTo(0,1100));const pinned=await page.getByRole('region',{name:'固定播出与应急控制'}).boundingBox();assert.ok(pinned&&pinned.y>=-2&&pinned.y<70,'production controls remain visible while scrolling');
  assert.deepEqual(errors,[]);const saved=JSON.parse(await readFile(path.join(dir,'state.json'),'utf8'));assert.equal(saved.production.rundown.length,1);
  await writeFile(path.join(evidence,'report.json'),JSON.stringify({version:'0.3.0',tests,errors,boundary:'Built browser UI and actual isolated service, explicit demo seed and stubbed static metadata. No operator data, real OBS, Riot game, physical camera/microphone, streaming platform or long-run performance was exercised.'},null,2));
  console.log(`Production workflow: ${tests.length} checks passed. Evidence: ${evidence}`);
}catch(error){
  const page=browser?.contexts()[0]?.pages()[0];
  const diagnostic={error:String(error),errors,body:page?await page.locator('body').innerText().catch(()=>undefined):undefined};
  await writeFile(path.join(evidence,'failure.json'),JSON.stringify(diagnostic,null,2));if(page)await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true}).catch(()=>{});
  console.error(JSON.stringify({...diagnostic,body:diagnostic.body?.slice(0,700)}));throw error;
}finally{
  await browser?.close();if(child.exitCode===null){child.send({type:'riftcast-shutdown'});await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},4000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
  const absolute=path.resolve(dir);assert.ok(absolute.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(absolute).startsWith('riftcast-production-ui-'));await rm(absolute,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
