import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';import react from '@vitejs/plugin-react';import {tsImport} from 'tsx/esm/api';
const {chromium}=await import(pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href);
const {createFixture}=await tsImport('../server/test-support/fixture.ts',import.meta.url),{VdoNinjaService}=await tsImport('../server/vdo-ninja.ts',import.meta.url),{bundledChampions}=await tsImport('../shared/champion-art.ts',import.meta.url),{BUILTIN_RUNTIME_STYLES,BUILTIN_STYLE_RECORDS}=await tsImport('../shared/style-packs.ts',import.meta.url);
const state=createFixture(),service=new VdoNinjaService();state.production.control={owner:'visual-seat',name:'图形验收'};
const dir=path.resolve('verification-output/vdo-demo-resources');await mkdir(dir,{recursive:true});
const vite=await createServer({configFile:false,cacheDir:path.join(dir,'.vite'),plugins:[react()],server:{host:'127.0.0.1',port:0},logLevel:'error'});await vite.listen();const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
const checks=[],errors=[],requests=[],external=[];let browser;let progress={phase:'idle',completed:0,total:0,failed:0,detail:'等待准备离线素材'};
try{
 browser=await chromium.launch({headless:true,channel:process.env.RIFTCAST_BROWSER_CHANNEL||'msedge'});const context=await browser.newContext({viewport:{width:1600,height:1100}});
 await context.route('https://vdo.ninja/**',route=>{external.push(route.request().url());return route.fulfill({contentType:'text/html; charset=utf-8',body:'<meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;height:100vh;background:#194962;color:white;font:40px sans-serif">隔离视频样本</body>'});});
 await context.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),body=req.method()==='POST'?req.postDataJSON():undefined;requests.push({path:url.pathname,method:req.method(),op:body?.op});
  if(url.pathname==='/api/state')return route.fulfill({json:state});
  if(url.pathname==='/api/champions')return route.fulfill({json:{version:'fixture',champions:bundledChampions()}});
  if(url.pathname.startsWith('/api/style-packs/')){const parts=url.pathname.split('/'),record=BUILTIN_STYLE_RECORDS.find(p=>p.manifest.id===parts[3]);if(record){if(parts[5]==='assets')return route.fulfill({contentType:'image/png',body:await readFile(path.join('public/style-packs',parts[3],parts[4],record.manifest.assets[parts[6]]))});return route.fulfill({json:BUILTIN_RUNTIME_STYLES.find(p=>p.id===parts[3])});}}
  if(url.pathname==='/api/control/seat')return route.fulfill({json:{token:'test-seat',id:'visual-seat',name:'验收',role:'director'}});
  if(url.pathname==='/api/network')return route.fulfill({json:{enabled:false,urls:[]}});
  if(url.pathname==='/api/obs/engine')return route.fulfill({json:{mode:'embedded',available:false,running:false,connected:false,streamActive:false,recordActive:false,inputs:[]}});
  if(url.pathname==='/api/vdo-ninja')return route.fulfill({json:body?await service.update(state,body):service.snapshot(state)});
  if(url.pathname==='/api/vdo-ninja/feeds'){const {enabled,feeds}=service.snapshot(state);return route.fulfill({json:{enabled,feeds}});}
  if(url.pathname==='/api/resources/versions')return route.fulfill({json:{versions:['16.21.1','16.20.1'],gameVersion:'16.20.123',recommended:'16.20.1',detail:'实际游戏版本 16.20.123 对应目录 16.20.1'}});
  if(url.pathname==='/api/resources/maintenance'){
   if(body?.op==='prepare')progress={phase:'assets',version:body.version,completed:45,total:100,failed:2,detail:'隔离下载进度样例'};
   if(body?.op?.startsWith('cleanup'))return route.fulfill({json:{files:3,bytes:1024*1024,protectedVersions:['16.20.1'],threshold:'2026-10-08',removed:body.op==='cleanup'}});
   return route.fulfill({json:{progress,protectedVersions:['16.20.1']}});
  }
  return route.fulfill({status:503,json:{error:'隔离验收未连接设备'}});
 });
 await context.routeWebSocket('**/ws',route=>route.send(JSON.stringify(state)));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#settings');await page.getByRole('tab',{name:/远程选手/}).click();await page.locator('.vdo-workspace').waitFor();
 await page.getByRole('button',{name:'生成 / 补齐当前名单链接'}).click();await page.waitForFunction(()=>document.querySelectorAll('.vdo-invitations article').length===10);assert.equal(external.length,0);assert.equal(await page.locator('.vdo-feed-links article').count(),10);
 await page.getByLabel('启用远程选手画面').click();await page.waitForFunction(()=>document.querySelector('[aria-label="启用远程选手画面"]').checked);await page.screenshot({path:path.join(dir,'vdo-workspace-1600.png')});checks.push('Real settings VDO tab generates 10 invitations with no third-party connection and enables explicit output');
 const initial=service.snapshot(state).feeds[0].viewUrl;await page.goto(base+'/overlay/vdo?side=blue&slot=0');await page.locator('.vdo-output iframe').waitFor();assert.equal(await page.locator('iframe').getAttribute('src'),initial);await page.frameLocator('.vdo-output iframe').getByText('隔离视频样本',{exact:true}).waitFor();await page.screenshot({path:path.join(dir,'vdo-output.png')});
 await service.update(state,{op:'enabled',enabled:false});await page.locator('.vdo-output-empty').waitFor();assert.equal(await page.locator('iframe').count(),0);checks.push('Actual VDO output uses selected identity and disconnects iframe when disabled; remote media intercepted');
 await page.goto(base+'/#settings');await page.getByRole('tab',{name:'图形演示',exact:true}).click();await page.locator('.demo-workspace').waitFor();
 const values=await page.getByLabel('演示图形').locator('option').evaluateAll(options=>options.map(o=>o.value));
 for(const value of values){await page.getByLabel('演示图形').selectOption(value);await page.locator('.demo-stage').waitFor();assert((await page.locator('.demo-stage').innerHTML()).length>100,value+' empty');if(['lineup','season','archive:team','archive:items','combat:damage-flow','twitch:poll'].includes(value))await page.locator('.demo-preview').screenshot({path:path.join(dir,'demo-'+value.replace(':','-')+'.png')});}
 await page.getByLabel('演示图形').selectOption('draft');await page.getByLabel('演示布局').selectOption('full-height');await page.locator('.demo-preview').screenshot({path:path.join(dir,'demo-full-height.png')});
 await page.getByLabel('演示图形').selectOption('lineup');await page.getByText('缺失数据场景',{exact:true}).check();assert.equal(await page.locator('.rl-rune-unknown').count(),90);await page.getByText('缺失数据场景',{exact:true}).uncheck();assert.equal(await page.locator('.rl-runes img').count(),90);
 assert(!requests.some(r=>r.path==='/api/action'));checks.push(`All ${values.length} demo modes render; full-height variant and missing nine-rune slots verified; no producer mutations`);
 await page.setViewportSize({width:640,height:1000});await page.screenshot({path:path.join(dir,'demo-workspace-640.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);checks.push('Demo controls and scaled full canvas fit 640px without horizontal overflow');
 await page.setViewportSize({width:1600,height:1100});await page.getByRole('tab',{name:'资源维护',exact:true}).click();await page.locator('.resource-maintenance').waitFor();const before=await page.getByLabel('素材准备版本').inputValue();await page.getByRole('button',{name:'查询官方版本',exact:true}).click();await page.getByText('实际游戏版本 16.20.123 对应目录 16.20.1',{exact:true}).waitFor();assert.equal(await page.getByLabel('素材准备版本').inputValue(),before);
 await page.getByRole('button',{name:'采用建议 16.20.1'}).click();await page.getByRole('button',{name:'准备离线素材',exact:true}).click();await page.getByText('45 / 100 · 待补齐 2',{exact:true}).waitFor();await page.screenshot({path:path.join(dir,'resources-progress.png')});
 progress={...progress,phase:'complete',completed:100,failed:0,detail:'隔离素材准备完成'};await page.getByRole('button',{name:'检查可清理缓存'}).click();await page.getByRole('button',{name:'清理已过期缓存'}).click();await page.getByText('已清理 3 项 · 1.00 MB',{exact:true}).waitFor();checks.push('Resources preserve chosen version until explicit adoption, display stage progress and support previewed cleanup');
 assert.deepEqual(errors,[]);await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'passed',checks,errors,requests,interceptedVdoRequests:external.length},null,2));console.log(JSON.stringify({checks,evidence:dir}));
}finally{await browser?.close();await vite.close();}
