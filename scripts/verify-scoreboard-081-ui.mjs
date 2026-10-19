const { createFixture: createSeed } = await tsImport('../server/test-support/fixture.ts', import.meta.url);
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {tsImport} from 'tsx/esm/api';
const {chromium}=await import(pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href);
const {parseScoreboardRows}=await tsImport('../server/spectator-scoreboard.ts',import.meta.url);
const fixture=JSON.parse(await readFile('server/fixtures/scoreboard-081.json','utf8'));
const rows=parseScoreboardRows(fixture.playerWords,fixture.playerPortraits);
const state=createSeed();state.players=state.players.map((p,i)=>({...p,visionScore:rows[i].visionScore,currentGold:rows[i].currentGold,gold:rows[i].totalGold,cs:rows[i].cs}));
for(const p of state.players){p.itemSlots=[1001,0,3031,2003,1036,1037,3340];p.itemCounts=[1,0,1,3,1,1,1];}
const prices={1001:300,3031:3600,2003:50,1036:350,1037:875,3340:0};
const dir=path.resolve('verification-output/ocr-0.8.1/ui');await mkdir(dir,{recursive:true});
await writeFile(path.join(dir,'index.html'),'<html><body style="margin:0"><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
await writeFile(path.join(dir,'entry.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{BroadcastCanvas}from'/src/components/BroadcastCanvas';import '/src/design-tokens.css';import '/src/styles.css';createRoot(document.getElementById('root')).render(<BroadcastCanvas state={${JSON.stringify(state)}} champions={[]} scene="live" output/>);`);
const vite=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:5198,strictPort:true,watch:{ignored:['**/verification-output/**','**/runtime/**']}}});await vite.listen();let browser;
try{browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:decodeURIComponent(r.request().url()).includes('item.json')?{data:Object.fromEntries(Object.entries(prices).map(([id,gold])=>[id,{name:'item-'+id,gold:{total:gold}}]))}:{}}));await page.goto('http://127.0.0.1:5198/verification-output/ocr-0.8.1/ui/index.html');await page.locator('.lb-player-gold').last().waitFor();
const displayed=Array.from({length:5},(_,i)=>[rows[i],rows[i+5]]).flat();
assert.deepEqual(await page.locator('.lb-player-gold').allTextContents(),displayed.map(r=>`${r.currentGold}(${r.totalGold})`));assert.deepEqual(await page.locator('.lb-vision-score').allTextContents(),displayed.map(r=>String(r.visionScore)));assert.deepEqual(await page.locator('.lb-cs').allTextContents(),displayed.map(r=>String(r.cs)));await page.locator('.lb-items .lb-icon[title^="item-3031"]').first().waitFor();for(const side of ['blue','red']){const cells=page.locator('.lb-player-row.'+side+' .lb-items').first().locator('.lb-item-slot');const positions=await cells.evaluateAll(nodes=>nodes.map(n=>({title:n.querySelector('.lb-icon').title,x:n.getBoundingClientRect().x})));assert.deepEqual(positions.map(p=>p.title.split(" · ")[0]),['item-3031','item-1037','item-1036','item-1001','item-2003','空装备栏']);for(let i=1;i<6;i++)assert.ok(side==='blue'?positions[i].x<positions[i-1].x:positions[i].x>positions[i-1].x);assert.equal(await cells.nth(4).locator('.lb-item-count').textContent(),'3');}assert.deepEqual(errors,[]);await page.screenshot({path:path.join(dir,'scoreboard.png')});assert.equal(await page.locator('.lb-player-gold').first().evaluate(n=>getComputedStyle(n).fontSize),await page.locator('.lb-player-name').first().evaluate(n=>getComputedStyle(n).fontSize));console.log('All ten displayed gold, CS and vision values verified; gold and ID font sizes match');}finally{await browser?.close();await vite.close();}
