import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';import react from '@vitejs/plugin-react';import {tsImport} from 'tsx/esm/api';
const {chromium}=await import(pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href);
const {createFixture}=await tsImport('../server/test-support/fixture.ts',import.meta.url);
const {bundledChampions}=await tsImport('../shared/champion-art.ts',import.meta.url);
const {BUILTIN_RUNTIME_STYLES,BUILTIN_STYLE_RECORDS}=await tsImport('../shared/style-packs.ts',import.meta.url);
const pages=JSON.parse(await readFile('server/test-support/rune-pages.json','utf8'));
const version=JSON.parse(await readFile('package.json','utf8')).version,dir=path.resolve(`verification-output/release-${version}/runes`);await mkdir(dir,{recursive:true});
const state=createFixture();state.production=undefined;state.players.forEach((p,i)=>{p.fullRuneIds=pages[i].runes;p.statRuneIds=pages[i].shards;});
await writeFile(path.join(dir,'index.html'),'<div id="root"></div><script type="module" src="./entry.tsx"></script>');
await writeFile(path.join(dir,'entry.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{BroadcastCanvas}from'/src/components/BroadcastCanvas';import'/src/styles.css';const s=${JSON.stringify(state)};s.overlay.stylePack=${JSON.stringify(BUILTIN_RUNTIME_STYLES.map(({id,revision,name})=>({id,revision,name})))}.find(p=>p.id===new URLSearchParams(location.search).get('pack'));if(new URLSearchParams(location.search).has('missing'))s.players.forEach(p=>{delete p.fullRuneIds;delete p.runeIds;delete p.runeSelection;});document.body.style.margin='0';createRoot(document.getElementById('root')).render(<BroadcastCanvas state={s} champions={${JSON.stringify(bundledChampions())}} scene="lineup" output/>);`);
const vite=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:0}});await vite.listen();let browser;const errors=[],checks=[];
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{const parts=new URL(route.request().url()).pathname.split('/');if(parts[2]==='style-packs'){const record=BUILTIN_STYLE_RECORDS.find(p=>p.manifest.id===parts[3]);if(record){if(parts[5]==='assets')return route.fulfill({contentType:'image/png',body:await readFile(path.join('public/style-packs',parts[3],parts[4],record.manifest.assets[parts[6]]))});return route.fulfill({json:BUILTIN_RUNTIME_STYLES.find(p=>p.id===parts[3])});}}return route.fulfill({json:{}});});
 const origin=`http://127.0.0.1:${vite.httpServer.address().port}/verification-output/release-${version}/runes/index.html`;
 for(const width of [1920,1280])for(const pack of BUILTIN_RUNTIME_STYLES){
  await page.setViewportSize({width,height:width*9/16});await page.goto(`${origin}?pack=${pack.id}`);await page.locator('[data-style-status=ready]').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.rl-runes img').length===60&&[...document.querySelectorAll('.rl-runes img')].every(i=>i.complete&&i.naturalWidth>0));
  const rows=await page.locator('.rl-card').evaluateAll(cards=>cards.map(c=>{const info=c.querySelector('.rl-info').getBoundingClientRect();return [...c.querySelectorAll('.rl-runes>span')].map(n=>{const b=n.getBoundingClientRect();return {id:Number(n.dataset.runeId),inside:b.left>=info.left-1&&b.right<=info.right+1&&b.bottom<=info.bottom+1};});}));
  assert.equal(rows.length,10);rows.forEach((row,i)=>{assert.deepEqual(row.map(r=>r.id),pages[Math.floor(i/2)+(i%2)*5].runes);assert(row.every(r=>r.inside),`${pack.id} ${width} rune clipping`);});
  await page.screenshot({path:path.join(dir,`${pack.id}-${width}.png`)});checks.push(`${pack.id} ${width}: 10 players, 60 local icons, correct order, no clipping`);
 }
 await page.goto(`${origin}?pack=qinghua-celestial&missing=1`);await page.locator('[data-style-status=ready]').waitFor();assert.equal(await page.locator('.rl-runes img').count(),0);assert.deepEqual(errors,[]);
 await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'passed',version,checks,errors},null,2));console.log(checks);
}finally{await browser?.close();await vite.close();}
