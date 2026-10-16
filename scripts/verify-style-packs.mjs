import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createServer as netServer } from 'node:net';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tsImport } from 'tsx/esm/api';
import { isolatedNativeEnvironment, nativeRequestGuard } from './verify-native-safety.mjs';
import { reportFixture } from './report-093-fixture.mjs';
import { stylePackFixture } from './style-pack-fixture.mjs';
const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
const { STYLE_SCENES, BUILTIN_STYLE_REF } = await tsImport('../shared/style-packs.ts', import.meta.url);
const { bundledChampions } = await tsImport('../shared/champion-art.ts', import.meta.url);
const version = JSON.parse(await readFile('package.json','utf8')).version;
const dir = path.resolve('verification-output', `release-${version}`, 'styles');
await mkdir(dir, { recursive: true });
const sandbox = await mkdtemp(path.join(os.tmpdir(),'riftcast-style-check-'));
const listener = netServer(); await new Promise(r=>listener.listen(0,'127.0.0.1',r)); const port=listener.address().port; await new Promise(r=>listener.close(r));
const base=`http://127.0.0.1:${port}`, data=path.join(sandbox,'data'); await mkdir(data,{recursive:true});
const fixture=reportFixture(); await writeFile(path.join(data,'state.json'),JSON.stringify(fixture));
const input=await stylePackFixture(), filename=path.join(sandbox,'verification.riftstyle.zip'); await writeFile(filename,input);
const checks=[],errors=[],blocked=[]; let service,browser,vite,page,serviceLog='';
async function start() {
  service=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...await isolatedNativeEnvironment(sandbox),PORT:String(port),RIFTCAST_DATA_DIR:data,RIFTCAST_OBS_AUTOSTART:'0'},stdio:['ignore','pipe','pipe']});
  service.stdout.on('data',b=>{serviceLog+=b;});service.stderr.on('data',b=>{serviceLog+=b;});
  for(let i=0;i<150;i++){try{const h=await(await fetch(base+'/api/health')).json();assert.equal(h.version,version);return;}catch{if(service.exitCode!==null)throw new Error(serviceLog);await new Promise(r=>setTimeout(r,200));}}
  throw new Error('Service did not start: '+serviceLog);
}
async function stop(){if(!service||service.exitCode!==null)return;const done=once(service,'exit');service.kill();await Promise.race([done,new Promise(r=>setTimeout(r,5000))]);if(service.exitCode===null){service.kill('SIGKILL');await done;}service=undefined;}
const state=async()=>await(await fetch(base+'/api/state')).json();
try {
  await start();
  const seat=await(await fetch(base+'/api/control/seat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'director'})})).json();assert.ok(seat.token);
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.RIFTCAST_BROWSER_EXECUTABLE?{executablePath:process.env.RIFTCAST_BROWSER_EXECUTABLE}:{channel:process.env.RIFTCAST_BROWSER_CHANNEL||'msedge'})});
  const context=await browser.newContext({viewport:{width:1600,height:1000}});await nativeRequestGuard(blocked).attach(context);
  await context.addInitScript(token=>sessionStorage.setItem('riftcast-seat-token',token),seat.token);
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  await page.getByRole('button',{name:'风格包',exact:true}).click({timeout:30000});
  const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByRole('button',{name:'导入风格包',exact:true}).waitFor();
  await page.screenshot({path:path.join(dir,'manager-builtin.png')});
  const before=await state();
  await dialog.locator('input[type=file]').setInputFiles(filename);
  await dialog.locator('.style-pack-choice[aria-pressed=true]').filter({hasText:'验证用赛事风格'}).waitFor();
  const stage=dialog.getByRole('button',{name:'准备到预监',exact:true});await stage.waitFor();
  await stage.click();
  await page.waitForFunction(()=>document.querySelector('.style-pack-buses')?.textContent.includes('新风格待 TAKE'));
  const staged=await state(),ref=staged.overlay.stylePack;
  assert.equal(ref.id,'verification-cup');assert.equal(staged.production.program.overlay.stylePack.id,BUILTIN_STYLE_REF.id);
  assert.deepEqual(staged.gameResults,before.gameResults);assert.deepEqual(staged.customScenes,before.customScenes);
  assert.deepEqual(Object.keys(ref).sort(),['id','name','revision']);
  await page.screenshot({path:path.join(dir,'manager-imported.png')});
  checks.push('real scene-library ZIP import and stage preserve program, archived match data and custom scenes; state carries only immutable reference');
  const preview=await context.newPage();await preview.goto(base+'/overlay?preview=1');await preview.locator('[data-style-pack=verification-cup][data-style-status=ready]').waitFor();
  const program=await context.newPage();await program.goto(base+'/overlay');await program.locator('[data-style-pack=glacier-aurora]').waitFor();
  checks.push('independent browser preview loads imported art while on-air browser retains builtin art until TAKE');
  await preview.close();await program.close();
  const exported=await fetch(`${base}/api/style-packs/${ref.id}/${ref.revision}/export`);assert.equal(exported.status,200);assert.match(exported.headers.get('content-type'),/zip/);
  const bad=new FormData();bad.append('file',new Blob([Buffer.from('invalid ZIP')]),'bad.zip');
  assert.equal((await fetch(base+'/api/style-packs/import',{method:'POST',headers:{'x-seat-token':seat.token},body:bad})).status,400);
  const other=await(await fetch(base+'/api/control/seat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'readonly',fresh:true})})).json();
  const denied=new FormData();denied.append('file',new Blob([input]),'denied.zip');
  assert.equal((await fetch(base+'/api/style-packs/import',{method:'POST',headers:{'x-seat-token':other.token},body:denied})).status,400);
  checks.push('real multipart limits and errors work; readonly seat cannot import');
  await dialog.getByRole('button',{name:'关闭风格包'}).click();
  await page.getByRole('button',{name:'切换浅色主题',exact:true}).click();await page.getByRole('button',{name:'风格包',exact:true}).click();
  await page.screenshot({path:path.join(dir,'manager-light.png')});
  await page.getByRole('button',{name:'关闭风格包'}).click();await page.close();
  // Standalone renderer fixtures exercise every real scene component against the actual asset API.
  const html=path.join(dir,'index.html');await writeFile(html,'<div id="root"></div><script type="module" src="./entry.tsx"></script>');
  await writeFile(path.join(dir,'entry.tsx'),`import React from'react';import{createRoot}from'react-dom/client';import{BroadcastCanvas}from'/src/components/BroadcastCanvas';import'/src/styles.css';import'/src/design-tokens.css';const q=new URLSearchParams(location.search);const state=${JSON.stringify(fixture)};if(q.has('styled'))state.overlay.stylePack=${JSON.stringify(ref)};document.body.style.margin='0';createRoot(document.getElementById('root')).render(<BroadcastCanvas state={state} champions={${JSON.stringify(bundledChampions())}} scene={q.get('scene')||'standby'} output/>);`);
  vite=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:0,proxy:{'/api':{target:base,changeOrigin:true}}}});await vite.listen();const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
  const render=await context.newPage();page=render;render.on('pageerror',e=>{errors.push(e.message);console.error('Scene renderer:',e.message);});await render.setViewportSize({width:1920,height:1080});
  for(const styled of [false,true])for(const scene of STYLE_SCENES){
    console.log(`Checking ${styled?'imported':'builtin'}/${scene}`);
    await render.goto(`${origin}/verification-output/release-${version}/styles/index.html?scene=${scene}${styled?'&styled=1':''}`);
    await render.locator('.cast-canvas').waitFor();if(scene!=='teamfight')await render.locator(`[data-style-pack=${styled?'verification-cup':BUILTIN_STYLE_REF.id}][data-style-status=ready]`).waitFor();
    await render.evaluate(()=>document.fonts.ready);await render.waitForTimeout(100);
    if(['draft','live','economy','ranking','interview','teamfight','gold-ranking'].includes(scene))assert.equal(await render.locator('.cast-canvas').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    if(scene==='teamfight')assert.equal(await render.locator('.cast-canvas').innerHTML(),'');
    if(scene==='postgame')assert.equal(await render.locator('.pr-gold-player').count(),10);
    if(scene!=='teamfight'){
      const surfaces=await render.locator('[data-style-pack]').evaluate(root=>{
        const targets={header:'.arena-header,.arena-analysis-heading,.pr-header,.rl-header',panel:'.cast-analysis,.cast-interview,.pb-output,.cast-gold-ranking',cardBlue:'.cast-draft-team.blue,.rl-card.blue',cardRed:'.cast-draft-team.red,.rl-card.red',scoreboard:'.lb-scoreboard',rowBlue:'.lb-player-row.blue',rowRed:'.lb-player-row.red',nameplate:'.lb-nameplate,.cast-interview-name,.lt-native-team',ticker:'.cast-ticker',paper:'.arena-start',draftCenter:'.cast-draft-center'};
        const checked=[];
        if(root.dataset.packBackground==='true')for(const el of root.querySelectorAll('.cast-canvas,.arena-full,.rune-lineup,.postgame-report'))checked.push({slot:'background',image:getComputedStyle(el).backgroundImage});
        for(const slot of root.dataset.packTextures.split(' ').filter(Boolean))for(const el of root.querySelectorAll(targets[slot]))checked.push({slot,image:getComputedStyle(el).backgroundImage});
        return checked;
      });
      for(const surface of surfaces)assert.match(surface.image,new RegExp('/api/style-packs/'+(styled?'verification-cup':BUILTIN_STYLE_REF.id)+'/'),`${scene}/${surface.slot} must use the selected texture`);
    }
    await render.screenshot({path:path.join(dir,`${styled?'imported':'builtin'}-${scene}.png`),omitBackground:true});
    checks.push(`${styled?'imported':'builtin'}/${scene}: rendered, transparent capture area preserved`);
  }
  await browser.close();browser=undefined;await vite.close();vite=undefined;
  await stop();await start();const restored=await state();assert.deepEqual(restored.overlay.stylePack,ref);assert.equal(restored.production.program.overlay.stylePack.id,BUILTIN_STYLE_REF.id);
  assert.equal((await(await fetch(base+'/api/style-packs')).json()).packs.length,6);
  checks.push('real service restart restores both immutable style versions and separate preview/program selection');
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'passed',version,checks,errors,blocked},null,2));console.log(checks.join('\n'));
} catch(error){await page?.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'failed',version,checks,errors:[...errors,String(error)],blocked,serviceLog},null,2));throw error;}
finally{await browser?.close();await vite?.close();await stop();await rm(sandbox,{recursive:true,force:true,maxRetries:5,retryDelay:500});}
