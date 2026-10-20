import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {tsImport} from 'tsx/esm/api';
const {chromium}=await import(pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href);
const {createFixture}=await tsImport('../server/test-support/fixture.ts',import.meta.url);
const {BUILTIN_RUNTIME_STYLES,BUILTIN_STYLE_RECORDS}=await tsImport('../shared/style-packs.ts',import.meta.url);
const {bundledChampions}=await tsImport('../shared/champion-art.ts',import.meta.url);
const version=JSON.parse(await readFile('package.json','utf8')).version,dir=path.resolve(`verification-output/release-${version}/draft-focus`);
await mkdir(dir,{recursive:true});const fixture=createFixture(),champions=bundledChampions();fixture.overlay.ticker=false;
fixture.draft={...fixture.draft,bluePicks:['Gwen','Jinx','Ahri'],redPicks:['Nunu','Lucian','Zeri'],bluePreselect:['Camille'],redPreselect:[],activeTeam:'blue',action:'选择英雄',locked:false};
await writeFile(path.join(dir,'index.html'),'<div id="root"></div><script type="module" src="./entry.tsx"></script>');
await writeFile(path.join(dir,'entry.tsx'),`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BroadcastCanvas}from'/src/components/BroadcastCanvas';import'/src/styles.css';const initial=${JSON.stringify(fixture)},packs=${JSON.stringify(BUILTIN_RUNTIME_STYLES)};initial.overlay.stylePack=packs.find(p=>p.id===new URLSearchParams(location.search).get('pack'));function App(){const[state,setState]=useState(initial);window.draftFixture={setDraft:patch=>setState(s=>({...s,draft:{...s.draft,...patch}}))};return <BroadcastCanvas state={state} champions={${JSON.stringify(champions)}} scene="draft" output/>}document.body.style.margin='0';document.body.style.background='#182d3d';createRoot(document.getElementById('root')).render(<App/>);`);
const vite=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:0}});await vite.listen();let browser;
const checks=[],errors=[];
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{const parts=new URL(route.request().url()).pathname.split('/');if(parts[2]==='style-packs'){const record=BUILTIN_STYLE_RECORDS.find(p=>p.manifest.id===parts[3]);if(record){if(parts[5]==='assets')return route.fulfill({contentType:'image/png',body:await readFile(path.join('public/style-packs',parts[3],parts[4],record.manifest.assets[parts[6]]))});return route.fulfill({json:BUILTIN_RUNTIME_STYLES.find(p=>p.id===parts[3])});}}return route.fulfill({json:{}});});
 const origin=`http://127.0.0.1:${vite.httpServer.address().port}/verification-output/release-${version}/draft-focus/index.html`;
 const patch=async value=>{await page.evaluate(p=>window.draftFixture.setDraft(p),value);await page.waitForTimeout(330);};
 const geometry=async()=>{
  const rows=await page.locator('.cast-draft-team').evaluateAll(teams=>teams.map(t=>{const r=t.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,cards:[...t.querySelectorAll('.cast-draft-card')].map(c=>{const b=c.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height,active:c.classList.contains('active-slot'),texture:getComputedStyle(c).backgroundImage};})};}));
  for(const row of rows){for(let i=0;i<5;i++){const c=row.cards[i];assert(c.left>=row.left-1&&c.right<=row.right+1&&c.top>=row.top-1&&c.bottom<=row.bottom+1);if(i)assert(c.left>=row.cards[i-1].right-.5);assert(c.texture!=='none','Each card retains the theme texture');}const a=row.cards.find(c=>c.active);if(a)for(const c of row.cards.filter(c=>!c.active)){assert(a.width>c.width*2.1&&a.width<c.width*2.3);assert(a.height>c.height+10);}}
  return rows;
 };
 for(const pack of BUILTIN_RUNTIME_STYLES){
  await page.goto(`${origin}?pack=${pack.id}`);await page.locator('[data-style-status=ready]').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>[...document.querySelectorAll('.cast-draft-card img')].every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.locator('.active-slot').count(),1);assert.match(await page.locator('.active-slot img').getAttribute('src'),/Camille-draftExpanded.webp$/);await geometry();
  assert(await page.locator('.cast-draft-card.locked img').evaluateAll(images=>images.every(i=>i.src.endsWith('-draftCompact.webp'))));
  await page.locator('.cast-draft').screenshot({path:path.join(dir,`${pack.id}-blue-focus.png`)});
  await patch({bluePicks:['Gwen','Jinx','Ahri','Camille'],bluePreselect:[],activeTeam:'red',redPreselect:['Rakan']});await geometry();assert.match(await page.locator('.active-slot img').getAttribute('src'),/Rakan-draftExpanded.webp$/);assert.match(await page.locator('.cast-draft-team.blue .cast-draft-card').nth(3).locator('img').getAttribute('src'),/Camille-draftCompact.webp$/);
  await page.locator('.cast-draft').screenshot({path:path.join(dir,`${pack.id}-red-focus.png`)});
  await patch({redPreselect:[]});assert.equal(await page.locator('.active-slot[data-state=choosing]').count(),1);assert.equal(await page.locator('.active-slot img').count(),0);await geometry();
  await patch({redPicks:['Nunu','','Zeri'],redPreselect:['Rakan']});assert.equal(await page.locator('.cast-draft-team.red .cast-draft-card').nth(1).getAttribute('data-state'),'preselect');
  for(const action of ['禁用英雄','等待选人','等待客户端 BP 数据']){await patch({action});assert.equal(await page.locator('.active-slot').count(),0);}
  await patch({action:'选择英雄',locked:true});assert.equal(await page.locator('.active-slot').count(),0);await geometry();
  await patch({locked:false,redPicks:['Nunu','Lucian','Zeri','Rakan','Braum']});assert.equal(await page.locator('.active-slot').count(),0);
  checks.push(`${pack.id}: hover, wide/narrow crops, lock, side switch, empty hover, sparse slots, bans/wait/final lock, bounded geometry and themed per-card texture`);
 }
 for(const width of [1280,960]){await page.setViewportSize({width,height:width*9/16});await page.goto(`${origin}?pack=qinghua-celestial`);await page.locator('[data-style-status=ready]').waitFor();await page.waitForTimeout(330);const cards=await page.locator('.cast-draft-card').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,active:n.classList.contains('active-slot')})));assert(cards.find(c=>c.active).width>cards[0].width*2);await page.locator('.cast-draft').screenshot({path:path.join(dir,`qinghua-${width}.png`)});checks.push(`${width}px scaled focus layout`);}
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.cast-draft-card').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');checks.push('reduced motion disables transitions');
 assert.deepEqual(errors,[]);await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'passed',version,checks,errors,scope:'Synthetic BP transitions; no live client or OBS acceptance'},null,2));console.log(JSON.stringify({status:'passed',checks}));
}finally{await browser?.close();await vite.close();}
