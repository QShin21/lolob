import { checkStyleDeletion, checkDeletedAfterRestart } from './style-deletion-checks.mjs';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { isolatedNativeEnvironment, nativeRequestGuard } from './verify-native-safety.mjs';
import { stylePackFixture } from './style-pack-fixture.mjs';
import { reportFixture, amounts, counts } from './report-093-fixture.mjs';
const modulePath=process.env.RIFTCAST_PLAYWRIGHT_MODULE;
const {_electron}=await import(modulePath?pathToFileURL(modulePath).href:'playwright');
const root=process.cwd(),version='1.1.5',dir=path.join(root,'verification-output',`release-${version}`);
await mkdir(dir,{recursive:true});
const sandbox=await mkdtemp(path.join(os.tmpdir(),'riftcast-100-package-'));
const appRoot=path.join(sandbox,'app'),userData=path.join(sandbox,'user'),data=path.join(userData,'data');
const hash=value=>createHash('sha256').update(value).digest('hex');
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
const errors=[],blocked=[],checks=[];let application,page;
const base=`http://127.0.0.1:${port}`;
async function readyControlWindow(app){
  const window=await app.firstWindow({timeout:90000});
  window.on('pageerror',error=>errors.push(error.message));
  // firstWindow resolves before Electron's asynchronous loadURL finishes.
  // Let the real startup navigation and React hydration finish before navigating.
  await window.waitForURL(base+'/',{timeout:90000,waitUntil:'domcontentloaded'});
  await window.getByRole('button',{name:'风格包',exact:true}).waitFor({timeout:30000});
  // Seat issuance finishes after the first control buttons render. Navigating to
  // /overlay before it completes abandons the owner token during the test.
  await window.waitForFunction(()=>!!sessionStorage.getItem('riftcast-seat-token') && !!sessionStorage.getItem('riftcast-seat-info'),undefined,{timeout:30000});
  return window;
}
try {
  await cp(path.join(root,'release',version,'win-unpacked'),appRoot,{recursive:true});await mkdir(data,{recursive:true});
  const fixture=reportFixture();
  const damageAmounts=[12400,7600,16900,14000,4300,29600,16000,15200,24700,5000];
  fixture.gameResults[0].snapshot.players.forEach((p,i)=>{p.damageDealt=damageAmounts[i];});
  for(const file of ['scripts/observer-telemetry-worker.ps1','scripts/native/observer-reader.cs','scripts/read-spectator-gold.ps1','scripts/spectator-ocr-worker.ps1','scripts/spectator-portrait-matcher.cs'])assert.equal(hash(await readFile(path.join(appRoot,'resources/app',file))),hash(await readFile(path.join(root,file))));
  const env={...await isolatedNativeEnvironment(sandbox),PATH:[path.join(process.env.SystemRoot,'System32'),process.env.SystemRoot,path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0')].join(path.delimiter),PORT:String(port),RIFTCAST_USER_DATA_DIR:userData,RIFTCAST_OBS_AUTOSTART:'0'};
  await assert.rejects(access(path.join(appRoot,'resources/app/server/test-support')));
  assert.doesNotMatch(await readFile(path.join(appRoot,'resources/app/server/index.mjs'),'utf8'),/function tickDemo|function createFixture|fixture-series/);
  application=await _electron.launch({executablePath:path.join(appRoot,'RiftCast.exe'),args:[],env,timeout:90000});
  await nativeRequestGuard(blocked).attach(application.context());page=await readyControlWindow(application);
  const fresh=await(await fetch(base+'/api/state')).json();assert.equal(fresh.mode,'live');assert.equal(fresh.overlay.stylePack.id,'qinghua-celestial');assert.equal(fresh.settings.pollInterval,500);assert.equal(fresh.gameTime,0);assert.deepEqual(fresh.players,[]);assert.deepEqual(fresh.events,[]);assert.deepEqual(fresh.schedule,[]);
  assert.doesNotMatch(await page.locator('body').innerText(),/演示|DEMO/);assert.equal(await page.locator('.director-demo-controls,.cast-demo').count(),0);
  await page.screenshot({path:path.join(dir,'packaged-live-only-start.png')});
  await application.close();application=undefined;
  checks.push('fresh packaged EXE starts live-only at 500 ms with empty telemetry and no demonstration controls; test fixtures absent from package');
  await writeFile(path.join(data,'state.json'),JSON.stringify(fixture));
  application=await _electron.launch({executablePath:path.join(appRoot,'RiftCast.exe'),args:[],env,timeout:90000});
  await nativeRequestGuard(blocked).attach(application.context());
  page=await readyControlWindow(application);
  const health=await (await fetch(base+'/api/health')).json();assert.equal(health.version,version);
  const metadata=await application.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged,userData:app.getPath('userData')}));
  assert.equal(metadata.version,version);assert.equal(metadata.packaged,true);assert.equal(metadata.userData,userData);
  for(const id of ['Camille','Gnar','KogMaw'])for(const variant of ['draftCompact','draftExpanded','draftReveal']){const url=`/champion-art/${id}-${variant}.webp`,response=await fetch(base+url);assert.equal(response.status,200);assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(await readFile(path.join(root,'public',url))));}
  checks.push('packaged service serves compact, expanded and lock-reveal local artwork with exact source hashes');
  checks.push('isolated packaged EXE and bundled service start at 1.1.5 without development Node/npm on PATH');
  const restored=await (await fetch(base+'/api/state')).json();
  assert.equal(restored.finishedGameId,fixture.finishedGameId);assert.equal(restored.phase,'postgame');
  const result=restored.gameResults.find(item=>item.id===fixture.finishedGameId);
  assert.ok(result);assert.equal(result.winner,'red');assert.deepEqual(result.snapshot.ocrMatch,fixture.gameResults[0].snapshot.ocrMatch);
  checks.push('bundled service restores the confirmed result and byte-equivalent serialized OCR archive');
  await page.goto(base+'/overlay?preview=1');await page.locator('.pr-gold-player').last().waitFor({timeout:30000});
  assert.equal(await page.locator('.pr-gold-player').count(),10);assert.equal(await page.locator('.pr-metrics>div').count(),8);
  for(const [sideIndex,side] of ['blue','red'].entries()) {
    assert.deepEqual(await page.locator(`.pr-gold-player.${side} .pr-gold-label>b`).allInnerTexts(),amounts.slice(sideIndex*5,sideIndex*5+5).map(n=>`${(n/1000).toFixed(1)}k`));
    for(const [row,key] of ['towers','dragons','barons','voidgrubs'].entries())assert.equal(await page.locator('.pr-metrics>div').nth(row+2).locator('b').nth(sideIndex).innerText(),String(counts[side][key]));
  }
  assert.doesNotMatch(await page.locator('.pr-overview').innerText(),/DAMAGE/);
  const bars=await page.locator('.pr-gold-comparison').first().locator('i').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));assert.ok(Math.abs(bars[0]/(bars[0]+bars[1])-amounts[0]/(amounts[0]+amounts[5]))<.001);
  await page.screenshot({path:path.join(dir,'packaged-report.png')});checks.push('compiled packaged report restores all ten gold values, eight objective values including zero, and six metric rows');
  checks.push('packaged observer and OCR scripts match the tested source files byte for byte');
  const controlToken=await page.evaluate(()=>sessionStorage.getItem('riftcast-seat-token'));
  const setPage=async postgamePage=>{const latest=await(await fetch(base+'/api/state')).json();const response=await fetch(base+'/api/action',{method:'POST',headers:{'content-type':'application/json','x-seat-token':controlToken},body:JSON.stringify({type:'set-overlay',patch:{postgamePage},expectedConfigVersion:latest.production.configVersion,requestId:crypto.randomUUID()})});assert.equal(response.status,200,await response.text());};
  await setPage(3);await page.locator('.pr-damage').waitFor();
  const damageBars=await page.locator('.pr-damage .pr-bar>i').evaluateAll(nodes=>nodes.map(n=>({value:Number(n.dataset.damage),ratio:n.getBoundingClientRect().width/n.parentElement.getBoundingClientRect().width})));
  assert.equal(damageBars.length,10);for(const bar of damageBars)assert(Math.abs(bar.ratio-bar.value/29600)<.002);
  assert.deepEqual(await page.locator('.pr-gold-player.blue .pr-gold-label>b').allInnerTexts(),damageAmounts.slice(0,5).map(n=>`${(n/1000).toFixed(1)}K`));
  assert.equal(await page.locator('.pr-gold-comparison').count(),0);
  await page.screenshot({path:path.join(dir,'packaged-damage-report.png')});
  await setPage(1);await page.locator('.pr-gold-comparison').first().waitFor();
  checks.push('packaged report page 3 reads frozen per-player champion damage; ten bars share maximum; switching restores original gold page');

  const styleFile=path.join(sandbox,'fixture.riftstyle.zip');await writeFile(styleFile,await stylePackFixture());
  await page.goto(base);await page.getByRole('button',{name:'风格包',exact:true}).click({timeout:30000});
  const dialog=page.getByRole('dialog');
  await dialog.locator('.style-pack-choice').nth(4).waitFor();
  assert.equal(await dialog.locator('.style-pack-choice').count(),6);
  assert.doesNotMatch(await dialog.innerText(),/简陋包/);
  for(const [id,name] of [['glacier-aurora','冰川极光'],['regalia','曜金典藏'],['neon-pulse','霓虹脉冲'],['vermilion-ink','朱砂墨韵'],['porcelain-racing','瓷白竞速'],['qinghua-celestial','青花瓷 · 云山雅韵']]){
    await dialog.locator('.style-pack-choice').filter({hasText:name}).click();
    await dialog.locator(`[data-style-pack=${id}][data-style-status=ready]`).waitFor({timeout:30000});
  }
  checks.push('all six original builtins load in the isolated packaged EXE before any import; retired style absent');
  await dialog.locator('input[type=file]').setInputFiles(styleFile);
  await dialog.locator('.style-pack-choice[aria-pressed=true]').filter({hasText:'验证用赛事风格'}).waitFor();
  await dialog.getByRole('button',{name:'准备到预监',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.style-pack-buses')?.textContent.includes('新风格待 TAKE'));
  const styled=await(await fetch(base+'/api/state')).json(),ref=styled.overlay.stylePack;
  assert.equal(ref.id,'verification-cup');assert.equal(styled.production.program.overlay.stylePack.id,'qinghua-celestial');
  assert.deepEqual(styled.gameResults,restored.gameResults);
  const archive=await fetch(`${base}/api/style-packs/${ref.id}/${ref.revision}/export`);assert.equal(archive.status,200);
  assert.equal(Buffer.from(await archive.arrayBuffer()).readUInt32LE(0),0x04034b50);
  await page.screenshot({path:path.join(dir,'packaged-style-manager.png')});
  await page.goto(base+'/overlay?preview=1');await page.locator('[data-style-pack=verification-cup][data-style-status=ready]').waitFor();
  assert.equal(await page.locator('.pr-gold-player').count(),10);await page.screenshot({path:path.join(dir,'packaged-style-preview.png')});
  checks.push('bundled unzipper and native sharp import and export ZIP through the packaged UI; preview is styled, program and archived data remain unchanged');
  await application.close();application=undefined;
  application=await _electron.launch({executablePath:path.join(appRoot,'RiftCast.exe'),args:[],env,timeout:90000});
  await nativeRequestGuard(blocked).attach(application.context());page=await readyControlWindow(application);
  await page.goto(base+'/overlay?preview=1');await page.locator('[data-style-pack=verification-cup][data-style-status=ready]').waitFor({timeout:30000});
  const restart=await(await fetch(base+'/api/state')).json();assert.deepEqual(restart.overlay.stylePack,ref);
  assert.equal(restart.production.program.overlay.stylePack.id,'qinghua-celestial');
  assert.equal((await(await fetch(base+'/api/style-packs')).json()).packs.length,7);
  checks.push('packaged EXE restart restores imported local assets and independent preview/program style references');
  const removed=await checkStyleDeletion({page,base,dir,checks});
  await application.close();application=undefined;
  application=await _electron.launch({executablePath:path.join(appRoot,'RiftCast.exe'),args:[],env,timeout:90000});
  await nativeRequestGuard(blocked).attach(application.context());page=await readyControlWindow(application);
  await checkDeletedAfterRestart(base,removed,checks,page);
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  await writeFile(path.join(dir,'packaged-report.json'),JSON.stringify({status:'passed',version,checks,errors,blocked,fixture:'synthetic archive; no live game, device installation, OBS output or platform streaming'},null,2));
} catch(error) {
  await page?.screenshot({path:path.join(dir,'packaged-report-failure.png')}).catch(()=>{});
  await writeFile(path.join(dir,'packaged-report.json'),JSON.stringify({status:'failed',version,checks,errors:[...errors,String(error)],blocked},null,2));throw error;
} finally {await application?.close();await rm(sandbox,{recursive:true,force:true,maxRetries:5,retryDelay:1000});}
