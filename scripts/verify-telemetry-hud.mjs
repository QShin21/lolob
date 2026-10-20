import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {tsImport} from 'tsx/esm/api';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {createFixture}=await tsImport('../server/test-support/fixture.ts',import.meta.url);
const {fallbackChampions}=await tsImport('../server/state.ts',import.meta.url);
const {gameClockMatchKey}=await tsImport('../shared/game-clock.ts',import.meta.url);
const {ResourceCache}=await tsImport('../server/resource-cache.ts',import.meta.url);
const resources=new ResourceCache(path.join(root,'verification-output/release-1.1.0/static-cache'));
const {chromium}=await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE?pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href:'playwright');
const state=createFixture(),champions=fallbackChampions();
state.gameTime=1200;state.paused=true;state.overlay.nativeHud='mask';state.connections.live={status:'connected',updatedAt:new Date().toISOString()};
state.gameClock={source:'live',gameTime:1200,paused:true,speed:1,sampledAt:new Date().toISOString(),sessionId:'fixture',discontinuity:0,matchKey:gameClockMatchKey(state),validForMs:60000};
state.players.forEach((p,i)=>{
 p.name=['Rainy丶Night','这是一个需要缩放的很长选手名称','Knight','Viper','ON','Breathe','Tarzan','Shanks','Hope','Kael'][i];
 p.telemetry={source:'memory',sampledAt:new Date().toISOString(),gameTime:1200,validForMs:60000};
 p.goldSource='memory';p.goldSampledAt=p.telemetry.sampledAt;p.goldExpiresAt=new Date(Date.now()+60000).toISOString();p.goldGameTime=1200;p.currentGold=1234;
 p.ultimate={state:i===2?'unlearned':i%2?'ready':'cooldown',level:i===2?0:2,readyAt:1208,totalCooldown:80};
 p.summonerSpells[0].cooldown={state:'cooldown',readyAt:1209,totalCooldown:300};
 p.summonerSpells[1].cooldown={state:'cooldown',readyAt:1230,totalCooldown:180};
 p.itemSlots=[1055,3006,3157,3085,3036,0,3340];p.itemCooldowns=[{slot:2,itemId:3157,cooldown:{state:'cooldown',readyAt:1206,totalCooldown:120}}];
 p.buffs={baron:i===0||i===7,elder:i===5||i===7,baronExpiresAt:1260,elderExpiresAt:1250};
 p.isDead=i===3;p.respawnAt=i===3?1215:undefined;
 p.telemetryDamage={toChampions:98765};
});
const entryPath=path.join(root,'_telemetry-fixture.tsx').replaceAll('\\','/');
const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BroadcastCanvas}from'/src/components/BroadcastCanvas.tsx';import'/src/styles.css';import'/src/responsive.css';
const initial=await fetch('/fixture/state').then(r=>r.json()),champions=await fetch('/fixture/champions').then(r=>r.json());
function App(){const[state,setState]=useState(initial);window.hudFixture={setState};return <div className="fixture-stage" style={{width:'100vw',height:'56.25vw',position:'relative',background:'#17313a'}}><BroadcastCanvas state={state} champions={champions} scene="live" output/></div>};createRoot(document.getElementById('root')).render(<App/>);`;
const vite=await createServer({root,configFile:false,appType:'custom',plugins:[react(),{name:'telemetry-fixture',resolveId:id=>id==='/_telemetry-fixture.tsx'?entryPath:undefined,load:id=>id===entryPath?entry:undefined}],server:{middlewareMode:true,hmr:false}});
const server=http.createServer(async(req,res)=>{
 if(req.url?.startsWith('/api/resources/asset?')){try{const asset=await resources.read(new URL(req.url,'http://localhost').searchParams.get('url'));res.setHeader('Content-Type',asset.type);res.end(asset.bytes);}catch{res.statusCode=404;res.end();}return;}
 if(req.url==='/fixture/state'||req.url==='/fixture/champions'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/fixture/state'?state:champions));return;}
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/',`<!doctype html><html><head><meta charset="utf-8"/><style>html,body{margin:0}.fixture-stage .is-output{width:100%;height:100%}</style></head><body><div id="root"></div><script type="module" src="/_telemetry-fixture.tsx"></script></body></html>`));return;}
 vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});
});
const dir=path.join(root,'verification-output/release-1.1.0/telemetry-hud'),checks=[],errors=[];let browser;
try{
 await mkdir(dir,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.lb-scoreboard').waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.lb-ultimate img').length===10&&[...document.querySelectorAll('.lb-scoreboard img')].every(i=>i.complete));
 assert.equal(await page.locator('.lb-player-row').count(),10);assert.equal(await page.locator('.lb-meter').count(),30);
 assert.equal(await page.locator('.lb-spells .lb-cooldown-seconds').count(),10);
 assert.equal(await page.locator('.lb-items .lb-cooldown-seconds').count(),10);
 assert.equal(await page.locator('.lb-ultimate .lb-cooldown-seconds').count(),4);
 assert.equal(await page.locator('.lb-respawn').innerText(),'15');
 assert.equal(await page.locator('.lb-champion.has-baron').count(),2);assert.equal(await page.locator('.lb-champion.has-elder').count(),2);
 assert(!(await page.locator('.cast-canvas').innerText()).includes('98765'),'Damage stays out of program');
 const geometry=await page.locator('.lb-player-row').evaluateAll(rows=>rows.map(row=>{
  const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
  const selectors=['.lb-inventory','.lb-runes','.lb-spells','.lb-champion','.lb-identity','.lb-player-gold','.lb-stat-column'];
  return {side:row.classList.contains('red')?'red':'blue',row:box(row),parts:selectors.map(s=>({selector:s,...box(row.querySelector(s))}))};
 }));
 for(const row of geometry){for(const part of row.parts){assert(part.x>=row.row.x-1&&part.right<=row.row.right+1,`${row.side} ${part.selector} exceeds row`);assert(part.y>=row.row.y-1&&part.bottom<=row.row.bottom+1,`${part.selector} exceeds row height`);}}
 checks.push('ten mirrored rows, 30 bars, no layout overflow','D/F, R and item masks with last-ten-second labels','dead portrait, resurrection countdown, Baron and Elder including both','damage absent from program');
 await page.screenshot({path:path.join(dir,'scoreboard-1920.png')});
 await page.locator('.lb-scoreboard').screenshot({path:path.join(dir,'scoreboard-detail.png')});
 const paused=await page.locator('.lb-spells .lb-cooldown-mask').first().getAttribute('style');await page.waitForTimeout(300);assert.equal(await page.locator('.lb-spells .lb-cooldown-mask').first().getAttribute('style'),paused);checks.push('paused game time freezes cooldown mask');
 await page.evaluate(()=>window.hudFixture.setState(s=>({...s,gameTime:1205,gameClock:{...s.gameClock,gameTime:1205,sampledAt:new Date().toISOString()}})));
 await page.waitForFunction(()=>document.querySelector('.lb-spells .lb-cooldown-seconds')?.textContent==='4');checks.push('game-time advance updates seconds');
 await page.evaluate(()=>window.hudFixture.setState(s=>({...s,gameClock:{...s.gameClock,awaitingLiveSample:true}})));
 await page.waitForFunction(()=>document.querySelectorAll('.lb-cooldown-mask').length===0);checks.push('seek waits for the current live sample');
 await page.evaluate(()=>window.hudFixture.setState(s=>({...s,gameClock:{...s.gameClock,awaitingLiveSample:false}})));
 await page.waitForFunction(()=>document.querySelectorAll('.lb-cooldown-mask').length>0);
 await page.evaluate(()=>window.hudFixture.setState(s=>({...s,players:s.players.map(p=>({...p,telemetry:{...p.telemetry,sampledAt:'2000-01-01T00:00:00Z'}}))})));
 await page.waitForFunction(()=>document.querySelectorAll('.lb-cooldown-mask,.lb-champion.has-baron,.lb-champion.has-elder').length===0);checks.push('stale data hides cooldowns, bars and buff assertions');
 assert.equal(await page.locator('.lb-meter.is-unavailable').count(),30);
 await page.setViewportSize({width:1280,height:720});await page.screenshot({path:path.join(dir,'stale-1280.png')});assert.deepEqual(errors,[]);
 await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'passed',checks,errors,geometry},null,2));console.log(JSON.stringify({status:'passed',checks}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await vite.close();}
