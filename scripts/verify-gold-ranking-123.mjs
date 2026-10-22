import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {tsImport} from 'tsx/esm/api';
const {chromium}=await import(pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href);
const {createFixture}=await tsImport('../server/test-support/fixture.ts',import.meta.url);
const {goldRanking}=await tsImport('../shared/gold-ranking.ts',import.meta.url);
const version=JSON.parse(await readFile('package.json','utf8')).version,dir=path.resolve(`verification-output/release-${version}/gold-ranking`);
await mkdir(dir,{recursive:true});
const fixture=createFixture();fixture.gameTime=500;fixture.connections.live.status='connected';fixture.gameClock=undefined;
fixture.players.forEach(p=>Object.assign(p,{goldSource:'memory',goldGameTime:500,currentGold:99999}));
await writeFile(path.join(dir,'index.html'),'<html><body style="margin:0"><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
await writeFile(path.join(dir,'entry.tsx'),`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{GoldRankingOverlay}from'/src/components/GoldRanking';import'/src/styles.css';function App(){const[state,setState]=useState(null);window.setRanking=setState;return <div className="cast-canvas" style={{width:1920,height:1080,position:'relative',containerType:'inline-size'}}>{state&&<GoldRankingOverlay state={state} champions={[]}/>}</div>}createRoot(document.getElementById('root')).render(<App/>);`);
const vite=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:0}});await vite.listen();let browser;
const checks=[],errors=[];
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/verification-output/release-${version}/gold-ranking/index.html`);await page.waitForFunction(()=>!!window.setRanking);
 const fresh=()=>{const s=structuredClone(fixture);s.players.forEach(p=>Object.assign(p,{goldSampledAt:new Date().toISOString(),goldExpiresAt:new Date(Date.now()+3000).toISOString()}));return s;};
 const set=async s=>{await page.evaluate(s=>window.setRanking(s),s);};
 const available=()=>page.waitForFunction(()=>document.querySelectorAll('.cast-gold-ranking li[data-gold]:not([data-gold=""])').length===10);
 const missing=()=>page.waitForFunction(()=>document.querySelectorAll('.cast-gold-ranking li.is-unavailable').length===10);
 await set(fresh());await available();
 assert.deepEqual(await page.locator('.cast-gold-ranking li').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.gold))),goldRanking(fresh()).map(r=>r.gold));
 assert.equal(await page.locator('.cast-gold-position').first().innerText(),'1');assert.equal(await page.locator('.cast-gold-position').last().innerText(),'10');
 await page.screenshot({path:path.join(dir,'memory-gold-1920x1080.png')});checks.push('ten direct-memory cumulative values sorted across both teams; 1920x1080 browser canvas');
 await missing();checks.push('expired memory readings become unavailable without another state update');
 const seek=fresh();seek.gameClock={awaitingLiveSample:true};await set(seek);await missing();
 const wrongTime=fresh();wrongTime.gameTime=400;await set(wrongTime);await missing();
 await set(fresh());await available();checks.push('pending seek and wrong-time readings hidden; valid new frame restores ten ranks');
 if(process.env.RIFTCAST_LIVE_STATE_URL){
   const actual=await(await fetch(process.env.RIFTCAST_LIVE_STATE_URL)).json();assert.equal(actual.players.length,10);assert(actual.players.every(p=>p.goldSource==='memory'));
   const rows=goldRanking(actual);assert.equal(rows.filter(r=>r.gold!==null).length,10);
   await set(actual);await available();assert.deepEqual(await page.locator('.cast-gold-ranking li').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.gold))),rows.map(r=>r.gold));
   await page.screenshot({path:path.join(dir,'real-game-gold-1920x1080.png')});await writeFile(path.join(dir,'real-game-values.json'),JSON.stringify({gameTime:actual.gameTime,rows:rows.map(r=>({id:r.player.id,gold:r.gold,rank:r.rank,source:r.player.goldSource}))},null,2));checks.push('current local game snapshot renders ten actual direct-memory gold values without rewriting timestamps');
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'passed',version,checks,errors},null,2));console.log(JSON.stringify({status:'passed',checks}));
}finally{await browser?.close();await vite.close();}
