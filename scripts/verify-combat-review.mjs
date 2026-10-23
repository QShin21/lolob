import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tsImport } from 'tsx/esm/api';
const { chromium }=await import(pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href);
const { createFixture }=await tsImport('../server/test-support/fixture.ts',import.meta.url);
const { ReplayDamageIndex }=await tsImport('../server/replay-damage.ts',import.meta.url);
const { buildCombatReview }=await tsImport('../server/combat-review.ts',import.meta.url);
const { StylePackStore }=await tsImport('../server/style-packs.ts',import.meta.url);
const dir=path.resolve('verification-output/combat-review');await mkdir(dir,{recursive:true});
const store=new StylePackStore(path.join(dir,'styles'));await store.initialize();
const fixture=createFixture();fixture.gameTime=110;fixture.production=undefined;fixture.phase='live';fixture.connections.live.status='connected';fixture.gameClock=undefined;
const heroes=fixture.players.map((p,i)=>({networkId:i+1,champion:p.championId,team:p.team,officialTotal:0}));
const hits=[];for(let i=0;i<10;i++)for(let t=100;t<110;t++)hits.push({time:t,source:i+1,target:i<5?6:1,amount:100+i*20,type:i%3});hits.push({time:108,source:1,target:500,amount:2000,type:0});
const moments=[{id:'fight1',kind:'teamfight',time:100,start:95,end:109,participants:heroes.map(h=>h.champion),basis:'damage',title:'团战'},{id:'death1',kind:'kill',time:109,start:97,end:109,participants:[heroes[0].champion,heroes[5].champion],victim:heroes[5].champion,basis:'damage',title:'死亡'}];
fixture.combatReview=buildCombatReview(new ReplayDamageIndex(heroes,200,hits),{session:'fixture',time:110,from:0,until:110,players:fixture.players,moments,units:new Map([[500,'barons']])});fixture.combatReview.validForMs=600000;fixture.overlay={...fixture.overlay,combatReviewMode:'damage-flow',sponsor:'',scoreboard:false,objectives:false};
await writeFile(path.join(dir,'index.html'),'<html><body style="margin:0"><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
await writeFile(path.join(dir,'entry.tsx'),`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BroadcastCanvas}from'/src/components/BroadcastCanvas';import{CombatReviewControls}from'/src/components/CombatReview';import{bundledChampions}from'/shared/champion-art';import'/src/styles.css';const initial=${JSON.stringify(fixture)};function App(){const[s,set]=useState(initial),[controls,setControls]=useState(false);window.review={set:mode=>set(v=>({...v,overlay:{...v.overlay,combatReviewMode:mode,combatMomentId:''}})),controls:()=>setControls(true),stale:()=>set(v=>({...v,connections:{...v.connections,live:{status:'disconnected'}}}))};const send=async action=>{window.actions??=[];window.actions.push(action);if(action.type==='set-overlay')set(v=>({...v,overlay:{...v.overlay,...action.patch}}));};return controls?<CombatReviewControls state={s} send={send} notify={()=>{}}/>:<BroadcastCanvas state={s} champions={bundledChampions()} scene="live" output/>}createRoot(document.getElementById('root')).render(<App/>);`);
const vite=await createServer({configFile:false,cacheDir:path.join(dir,'vite-cache'),plugins:[react()],server:{host:'127.0.0.1',port:0}});await vite.listen();let browser;const checks=[],errors=[];
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{const p=new URL(route.request().url()).pathname.split('/'),ref={id:p[3],revision:p[4],name:'fixture'};if(p[2]==='style-packs'){if(p[5]==='assets')return route.fulfill({body:await store.asset(ref,p[6]),contentType:'image/png'});return route.fulfill({json:store.get(ref)});}return route.fulfill({status:404,body:''});});
 await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/verification-output/combat-review/index.html`);await page.locator('[data-style-status=ready]').waitFor();
 for(const width of [1920,1280]){await page.setViewportSize({width,height:width*9/16});for(const mode of ['damage-flow','death-recap','objective-dps','fight-history']){
   await page.evaluate(mode=>window.review.set(mode),mode);await page.locator(`.review-${mode}`).waitFor();assert.equal(await page.locator('.cr-empty').count(),0);assert.equal(await page.locator('.combat-review-overlay').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}),true);await page.screenshot({path:path.join(dir,`${mode}-${width}.png`)});
 }}checks.push('All four graphics render actual backend-derived damage at 1920 and 1280 widths within output bounds');
 assert.equal(await page.locator('.cr-damage-rows article').count(),10);checks.push('Historical fight shows all ten heroes from the selected interval');
 await page.evaluate(()=>window.review.stale());await page.locator('.cr-empty').waitFor();assert.equal(await page.locator('.cr-damage-rows article').count(),0);checks.push('Disconnected telemetry clears values');
 await page.evaluate(()=>window.review.controls());await page.getByRole('button',{name:/01:40 — 01:49/}).click();const actions=await page.evaluate(()=>window.actions);assert.equal(actions[0].patch.combatReviewMode,'fight-history');assert.equal(actions[0].patch.combatMomentId,'fixture:fight1');assert.equal(actions[1].type,'preview-scene');assert.ok(actions.every(a=>a.type!=='take'));checks.push('History selection prepares the exact interval off air');
 assert.deepEqual(errors,[]);await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'passed',checks,errors,scope:'Synthetic packet index and actual output components; actual game validation remains separate'},null,2));console.log(JSON.stringify({status:'passed',checks}));
}finally{await browser?.close();await vite.close();}
