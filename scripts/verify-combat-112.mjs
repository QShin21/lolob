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
const {ResourceCache}=await tsImport('../server/resource-cache.ts',import.meta.url);
const version=JSON.parse(await readFile('package.json','utf8')).version,dir=path.resolve(`verification-output/release-${version}/combat`);
await mkdir(dir,{recursive:true});
const resources=new ResourceCache(path.resolve(`verification-output/release-${version}/static-cache`)),fixture=createFixture(),champions=bundledChampions();
fixture.programScene='teamfight';fixture.gameTime=1200;fixture.paused=true;fixture.overlay.sponsor='';fixture.production=undefined;
fixture.gameClock={source:'live',gameTime:1200,paused:true,speed:1,sampledAt:new Date().toISOString(),sessionId:'combat-fixture',discontinuity:0,validForMs:600000};
fixture.gameClock.matchKey=JSON.stringify([fixture.mode,fixture.match.seriesId,fixture.match.game,fixture.match.blueTeamId,fixture.match.redTeamId]);
fixture.players.forEach((p,i)=>{
 p.telemetry={source:'memory',sampledAt:new Date().toISOString(),gameTime:1200,validForMs:600000};p.telemetryDamage={toChampions:10000};p.telemetryDamageSource='memory';
 p.damageDealt=[12400,7600,16900,14000,4300,29600,16000,15200,24700,5000][i];
 p.ultimate={state:i%2?'ready':'cooldown',level:2,readyAt:1208,totalCooldown:80};p.summonerSpells[0].cooldown={state:'cooldown',readyAt:1209,totalCooldown:300};
 p.isDead=i===3;p.respawnAt=i===3?1215:undefined;p.buffs={baron:i===0,elder:i===5,baronExpiresAt:1260,elderExpiresAt:1260};
});
fixture.neutralObjectives={gameTime:1200,sampledAt:new Date().toISOString(),validForMs:600000,profile:'synthetic',objectives:[{kind:'baron',state:'alive'},{kind:'elder',state:'countdown',dueAt:1550}]};
await writeFile(path.join(dir,'index.html'),'<html><head><meta charset="utf-8"/></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
await writeFile(path.join(dir,'entry.tsx'),`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BroadcastCanvas}from'/src/components/BroadcastCanvas';import{syncFightSegment}from'/shared/combat-display';import'/src/styles.css';import'/src/responsive.css';const initial=${JSON.stringify(fixture)},packs=${JSON.stringify(BUILTIN_RUNTIME_STYLES)};initial.overlay.stylePack=packs.find(p=>p.id===new URLSearchParams(location.search).get('pack'));syncFightSegment(initial);function App(){const[state,setState]=useState(initial),[scene,setScene]=useState('teamfight');window.combatFixture={setState,scene:setScene,advance:()=>setState(s=>{const n=structuredClone(s);n.players.forEach((p,i)=>p.telemetryDamage.toChampions+=(i+1)*123);syncFightSegment(n);return n;}),air:scene=>setState(s=>{const n={...s,programScene:scene};syncFightSegment(n);return n;})};return <BroadcastCanvas state={state} champions={${JSON.stringify(champions)}} scene={scene} output bus="program"/>}document.body.style.margin='0';document.body.style.background='#182d3d';createRoot(document.getElementById('root')).render(<App/>);`);
const vite=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:0}});await vite.listen();let browser;
const checks=[],errors=[];
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),parts=url.pathname.split('/');
  if(url.pathname==='/api/resources/asset'){try{const asset=await resources.read(url.searchParams.get('url'));return route.fulfill({contentType:asset.type,body:asset.bytes});}catch{return route.fulfill({status:404,body:''});}}
  if(parts[2]==='style-packs'){const record=BUILTIN_STYLE_RECORDS.find(p=>p.manifest.id===parts[3]);if(record){if(parts[5]==='assets')return route.fulfill({contentType:'image/png',body:await readFile(path.join('public/style-packs',parts[3],parts[4],record.manifest.assets[parts[6]]))});return route.fulfill({json:BUILTIN_RUNTIME_STYLES.find(p=>p.id===parts[3])});}}
  return route.fulfill({json:{}});
 });
 const origin=`http://127.0.0.1:${vite.httpServer.address().port}/verification-output/release-${version}/combat/index.html`;
 const geometry=async()=>{
  const cards=await page.locator('.tf-player').evaluateAll(nodes=>nodes.map(n=>{const rect=e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};return {card:rect(n),parts:[...n.children].map(rect)};}));
  for(const c of cards)for(const p of c.parts){assert(p.left>=c.card.left-1&&p.right<=c.card.right+1);assert(p.top>=c.card.top-1&&p.bottom<=c.card.bottom+1);}
  const bounds=await page.locator('.tf-panel').boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=page.viewportSize().width+1&&bounds.y+bounds.height<=page.viewportSize().height+1);
 };
 for(const pack of BUILTIN_RUNTIME_STYLES){
  await page.goto(`${origin}?pack=${pack.id}`);await page.locator('[data-style-status=ready]').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>document.querySelectorAll('.tf-ultimate img').length===10&&[...document.querySelectorAll('.tf-player img')].every(i=>i.complete&&i.naturalWidth>0),undefined,{timeout:30000});
  assert.equal(await page.locator('.tf-player').count(),10);assert.equal(await page.locator('.tf-vitals .lb-meter').count(),30);assert.equal(await page.locator('.tf-spells .lb-cooldown-seconds').count(),10);
  assert.equal(await page.locator('.tf-respawn').innerText(),'15');assert.equal(await page.locator('.tf-portrait.has-baron').count(),1);assert.equal(await page.locator('.tf-portrait.has-elder').count(),1);
  assert.deepEqual(await page.locator('.tf-damage>b').allInnerTexts(),Array(10).fill('0'));await geometry();
  assert.equal(await page.locator('.neutral-objective.alive>b').count(),0);assert.equal(await page.locator('.neutral-objective.countdown>b').innerText(),'5:50');
  await page.evaluate(()=>window.combatFixture.advance());await page.waitForFunction(()=>document.querySelector('.tf-damage>b')?.textContent==='615');
  await page.screenshot({path:path.join(dir,`${pack.id}-teamfight.png`)});
  await page.locator('.tf-panel').screenshot({path:path.join(dir,`${pack.id}-teamfight-detail.png`)});
  await page.evaluate(()=>{window.combatFixture.air('live');window.combatFixture.air('teamfight');});await page.waitForFunction(()=>[...document.querySelectorAll('.tf-damage>b')].every(n=>n.textContent==='0'));
  await page.evaluate(()=>{window.combatFixture.scene('postgame');window.combatFixture.setState(s=>({...s,overlay:{...s.overlay,postgamePage:3}}));});await page.locator('.pr-damage').waitFor();
  const bars=await page.locator('.pr-damage .pr-bar i').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect();return {value:Number(n.dataset.damage),ratio:b.width/p.width,left:b.left-p.left,right:p.right-b.right,red:n.closest('.red')!==null};}));
  assert.equal(bars.length,10);for(const b of bars){assert(Math.abs(b.ratio-b.value/29600)<.002);assert(Math.abs(b.red?b.right:b.left)<1);}
  assert.equal(await page.locator('.pr-gold-comparison').count(),0);assert.equal(await page.locator('.pr-metrics>div').count(),6);assert.equal(await page.locator('.pr-economy').count(),1);
  await page.screenshot({path:path.join(dir,`${pack.id}-damage-report.png`)});await page.locator('.pr-damage').screenshot({path:path.join(dir,`${pack.id}-damage-detail.png`)});
  checks.push(`${pack.id}: ten HUD cards with 30 bars, spell cooldowns, death and buffs; interval reset; report page 3 shared maximum and mirrored anchors`);
 }
 await page.evaluate(()=>window.combatFixture.setState(s=>({...s,players:s.players.map((p,i)=>({...p,damageDealt:i===0?undefined:0}))})));
 assert.equal(await page.locator('.pr-gold-label>b').first().innerText(),'未采集');assert(await page.locator('.pr-bar i').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().width===0)));
 await page.evaluate(()=>window.combatFixture.setState(s=>({...s,overlay:{...s.overlay,postgamePage:1}})));await page.locator('.pr-gold-comparison').first().waitFor();assert.equal(await page.locator('.pr-gold-comparison').count(),5);
 await page.evaluate(()=>window.combatFixture.setState(s=>({...s,overlay:{...s.overlay,postgamePage:2}})));await page.locator('.pr-matchups').waitFor();assert.equal(await page.locator('.pr-player').count(),10);
 checks.push('missing damage stays missing, genuine zero has zero width; original report pages remain accessible');
 for(const scene of ['live','teamfight','gold-ranking','economy','ranking']){await page.evaluate(s=>window.combatFixture.scene(s),scene);await page.locator(`.cast-scene-${scene} .neutral-timers`).waitFor();assert.equal(await page.locator('.neutral-objective').count(),2);}
 await page.evaluate(()=>{window.combatFixture.scene('teamfight');window.combatFixture.setState(s=>({...s,gameTime:1210,gameClock:{...s.gameClock,gameTime:1210,sampledAt:new Date().toISOString()},neutralObjectives:{...s.neutralObjectives,gameTime:1210,objectives:[{kind:'herald',state:'countdown',dueAt:1432},{kind:'dragon',element:'chemtech',state:'countdown',dueAt:1278}]}}));});
 await page.waitForFunction(()=>document.querySelector('.neutral-objective>b')?.textContent==='3:42');assert.equal(await page.locator('.neutral-objective.dragon>b').innerText(),'1:08');await page.waitForTimeout(300);assert.equal(await page.locator('.neutral-objective.herald>b').innerText(),'3:42');
 await page.evaluate(()=>window.combatFixture.setState(s=>({...s,neutralObjectives:{...s.neutralObjectives,objectives:[{kind:'grubs',state:'countdown',dueAt:1339},{kind:'dragon',state:'alive'}]}})));await page.waitForFunction(()=>document.querySelector('.neutral-objective.grubs>b')?.textContent==='2:09');
 checks.push('neutral objectives present in every built-in in-game scene; alive, Herald, grubs, elemental dragon and Elder layouts; paused countdown');
 for(const width of [1280,960]){await page.setViewportSize({width,height:width*9/16});await geometry();await page.screenshot({path:path.join(dir,`teamfight-${width}.png`)});}
 await page.evaluate(()=>window.combatFixture.setState(s=>({...s,players:s.players.map(p=>({...p,telemetry:{...p.telemetry,sampledAt:'2000-01-01T00:00:00Z'}})),neutralObjectives:{...s.neutralObjectives,sampledAt:'2000-01-01T00:00:00Z'}})));
 await page.waitForFunction(()=>document.querySelectorAll('.tf-damage[data-available=false]').length===10);assert.equal(await page.locator('.tf-vitals .is-unavailable').count(),30);assert.equal(await page.locator('.neutral-objective.unknown').count(),2);
 checks.push('scaled 1280/960 layouts remain bounded; stale samples hide damage and vitals and mark neutral state unknown');
 assert.deepEqual(errors,[]);await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'passed',version,checks,errors,scope:'Synthetic browser validation; real CN damage field remains unconfirmed'},null,2));console.log(JSON.stringify({status:'passed',checks}));
}finally{await browser?.close();await vite.close();}
