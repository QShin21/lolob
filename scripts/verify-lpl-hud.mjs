// Render source in an isolated browser; no persisted state, OBS, game commands or outputs.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {tsImport} from 'tsx/esm/api';
import {imagePixelDifference} from './compare-image-pixels.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=path.resolve(process.env.RIFTCAST_HUD_VERIFY_DIR||path.join(root,'verification-output/hud'));
const {createSeed,fallbackChampions}=await tsImport('../server/state.ts',import.meta.url);
const {chromium}=await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE?pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href:'playwright');
let state=createSeed();state.paused=true;state.phase='live';state.gameTime=477;state.overlay.nativeHud='mask';state.overlay.sponsor='';state.overlay.ticker=false;
state.stats.blue.kills=0;state.stats.red.kills=0;state.stats.blue.gold=13000;state.stats.red.gold=12900;state.stats.blue.towers=0;state.stats.red.towers=0;
state.stats.blue.dragons=0;state.stats.red.dragons=0;
const names=['Bin','Xun','Knight','Viper','ON','Breathe','Tarzan','Shanks','Hope','Kael'];
state.players.forEach((p,i)=>{p.name=names[i];p.cs=[74,60,81,82,7,77,58,73,80,11][i];p.kills=0;p.deaths=0;p.assists=0;p.level=i%5===4?6:7;p.itemSlots=[1055,3006,3031,3085,3036,6673,3340];});
state.teams[0].tag='BLG';state.teams[1].tag='AL';state.teams[0].name='Fixture BLG';state.teams[1].name='Fixture AL';
// Regression tokens seen in the read-only live sample. Their art must use base spell files.
state.players[0].summonerSpells=[{name:'GeneratedTip_SummonerSpell_S12_SummonerTeleportUpgrade_DisplayName'},{id:4,name:'Flash'}];
state.players[1].summonerSpells=[{name:'GeneratedTip_SummonerSpell_SummonerSmiteAvatarOffensive_DisplayName'},{id:4,name:'Flash'}];
const champions=fallbackChampions();
const entryPath=path.join(root,'_lpl-fixture.tsx').replaceAll('\\','/');
const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{BroadcastCanvas}from'/src/components/BroadcastCanvas.tsx';import'/src/styles.css';import'/src/responsive.css';
const initial=await fetch('/fixture/state').then(r=>r.json()),champions=await fetch('/fixture/champions').then(r=>r.json());
function App(){const[state,setState]=useState(initial),[scene,setScene]=useState('live');window.hudFixture={setState,setScene};return <div className="fixture-stage" style={{width:'100vw',height:'56.25vw',position:'relative',background:'repeating-linear-gradient(45deg,#91145b 0px,#91145b 35px,#176144 35px,#176144 70px)'}}><BroadcastCanvas state={state} champions={champions} scene={scene} output/></div>};createRoot(document.getElementById('root')).render(<App/>);`;
const vite=await createServer({root,configFile:false,appType:'custom',plugins:[react(),{name:'lpl-hud-fixture',resolveId:id=>id==='/_lpl-fixture.tsx'?entryPath:undefined,load:id=>id===entryPath?entry:undefined}],server:{middlewareMode:true,hmr:false}});
const server=http.createServer(async(req,res)=>{
 if(req.url==='/fixture/state'||req.url==='/fixture/champions'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/fixture/state'?state:champions));return;}
 if(req.url==='/'||req.url?.startsWith('/?')){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/',`<!doctype html><html><head><meta charset="utf-8"/><style>html,body{margin:0}.fixture-stage .is-output{width:100%;height:100%}</style></head><body><div id="root"></div><script type="module" src="/_lpl-fixture.tsx"></script></body></html>`));return;}
 vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});
});
let browser;const errors=[],checks=[],pixelChecks=[];
const waitImages=page=>page.waitForFunction(()=>[...document.querySelectorAll('.lt-scoreboard img,.lb-scoreboard img')].every(img=>img.complete),{},{timeout:20000});
async function opaqueAgainstBackground(page,selector,inset=0,hideArtwork=false){
 const element=page.locator(selector);const box=await element.boundingBox();
 // Circular filtered images may rerasterize at different edge values after a
 // repaint. Verify the opaque body without artwork, then restore all artwork
 // for the separate decode, layout and full rendering checks.
 const temporaryStyle=hideArtwork?await page.addStyleTag({content:`${selector} img{visibility:hidden!important}`}):undefined;
 // Pixels outside the curved corners belong to the game. Compare the full
 // interior including the header/plot/footer, while retaining the card shape.
 const screenshot=()=>inset?page.screenshot({clip:{x:box.x+inset,y:box.y+inset,width:box.width-inset*2,height:box.height-inset*2}}):element.screenshot();
 const before=await screenshot();
 await page.locator('.fixture-stage').evaluate(e=>e.style.background='#f100e7');
 const after=await screenshot();
 if(!after.equals(before)){await writeFile(path.join(evidence,selector.slice(1)+'-before.png'),before);await writeFile(path.join(evidence,selector.slice(1)+'-after.png'),after);}
 const difference=imagePixelDifference(before,after);pixelChecks.push({selector,...difference,artworkHiddenForComparison:hideArtwork});
 if(temporaryStyle)await temporaryStyle.evaluate(e=>e.remove());
 assert.equal(difference.changedPixels,0,selector+' underlying background comparison: '+JSON.stringify(difference));
 await page.locator('.fixture-stage').evaluate(e=>e.style.background='repeating-linear-gradient(45deg,#91145b 0px,#91145b 35px,#176144 35px,#176144 70px)');
}
try{
 await mkdir(evidence,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,args:['--disable-gpu']});
 const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',error=>errors.push(error.message));
 console.log('Render fixture: load all official static artwork');
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.lb-scoreboard').waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.lb-ultimate img').length===10,{},{timeout:15000});await waitImages(page);
 assert.equal(await page.locator('.lb-pair').count(),5);assert.equal(await page.locator('.lb-player-row').count(),10);
 assert.equal(await page.locator('.lb-spells img').count(),20);
 assert.equal(await page.locator('.lb-ultimate img').evaluateAll(images=>images.filter(image=>image.naturalWidth>0).length),10,'All static ultimate images actually decode');
 assert.equal(await page.locator('.lb-runes img').evaluateAll(images=>images.filter(image=>image.naturalWidth>0).length),20,'All keystone and secondary rune images actually decode');
 for(const selector of ['.lb-identity','.lb-vitals','.lb-stat-column','.lb-level','.lb-quest','.lb-trinket','.lb-vision-score'])assert.equal(await page.locator(selector).count(),10,selector);
 assert.equal(await page.locator('.lb-meter').count(),30);assert.equal(await page.locator('.lb-items .lb-item-slot').count(),60);
 assert.equal(await page.locator('.lb-spells img').evaluateAll(images=>images.filter(image=>image.naturalWidth>0).length),20,'All summoner spell PNGs actually decode');
 assert.equal(await page.locator('.lb-spells img').first().getAttribute('src'),'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/spell/SummonerTeleport.png');
 checks.push('20 decoded summoner spell images, including upgraded teleport and evolved smite');
 checks.push('10 decoded ultimate icons, 20 rune icons, 30 explicit vital bars, 60 equipment slots and ten independent quest/trinket/vision cells');
 const box=await page.locator('.lb-scoreboard').boundingBox();assert.ok(Math.abs(box.x-496)<1&&Math.abs(box.width-928)<1&&Math.abs(box.y-829.4)<1&&Math.abs(box.height-250.6)<1,JSON.stringify(box));
 assert.equal(await page.locator('.lb-scoreboard>header').count(),0,'Reference table uses all five rows without a title band');
 const row=page.locator('.lb-player-row.blue').first();const mirrored=page.locator('.lb-player-row.red').first();
 const cols=['.lb-inventory','.lb-runes','.lb-spells','.lb-champion','.lb-identity','.lb-stat-column'];
 const blueCols=await Promise.all(cols.map(selector=>row.locator(selector).boundingBox()));const redCols=await Promise.all(cols.map(selector=>mirrored.locator(selector).boundingBox()));
 for(let i=1;i<cols.length;i++){assert.ok(blueCols[i].x>blueCols[i-1].x,'Blue column order');assert.ok(redCols[i].x<redCols[i-1].x,'Red column order');}
 const spells=await row.locator('.lb-spells .lb-icon').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y};}));assert.ok(Math.abs(spells[0].x-spells[1].x)<.01&&spells[1].y>spells[0].y,'Summoners stack vertically');
 checks.push('Mirrored six column groups; CS/KDA share one column and summoner spells stack in two rows');
 console.log('Render fixture: bottom geometry and opacity');
 assert.equal(await page.locator('.lb-scoreboard').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)');assert.equal(await page.locator('.lb-scoreboard').evaluate(e=>getComputedStyle(e).opacity),'1');
 await opaqueAgainstBackground(page,'.lb-scoreboard',1,true);checks.push('928px mirrored table, five equal rows, opaque black body; body pixel comparison excludes image artwork rerasterization');
 await page.screenshot({path:path.join(evidence,'live-full.png')});await page.locator('.lb-scoreboard').screenshot({path:path.join(evidence,'bottom-table.png')});
 const top=page.locator('.lt-scoreboard');await top.waitFor();await opaqueAgainstBackground(page,'.lt-scoreboard',1);
 const topBox=await top.boundingBox();const maskBox=await page.locator('.ob-score-mask').boundingBox();assert.ok(Math.abs(topBox.x-maskBox.x)<1&&Math.abs(topBox.width-maskBox.width)<1&&Math.abs(topBox.height-maskBox.height)<1,'Top scoreboard exactly fills its cover rectangle');
 await top.screenshot({path:path.join(evidence,'top-scoreboard.png')});checks.push('Top scoreboard fills its opaque cover area');
 const economy=structuredClone(state);economy.gameTime=1236;economy.stats.blue.gold=39500;economy.stats.red.gold=43200;
 economy.economy=Array.from({length:41},(_,i)=>({time:Math.round(i*1236/40),blue:2500+i*925,red:2500+i*1017.5+Math.sin(i/3)*350}));economy.economy[40].red=43200;
 await page.evaluate(s=>{window.hudFixture.setState(s);window.hudFixture.setScene('economy');},economy);await page.locator('.cast-economy').waitFor();
 assert.equal(await page.locator('.cast-economy').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(11, 23, 35)');assert.equal(await page.locator('.cast-economy').evaluate(e=>getComputedStyle(e).opacity),'1');
 await opaqueAgainstBackground(page,'.cast-economy',10);await page.locator('.cast-economy').screenshot({path:path.join(evidence,'economy-opaque.png')});await page.screenshot({path:path.join(evidence,'economy-full.png')});checks.push('Economy header, values, plot and footer retain exactly the same pixels over different underlying game colors');
 const missing=structuredClone(state);missing.mode='live';missing.paused=true;missing.players.forEach(p=>{for(const key of ['health','maxHealth','resource','maxResource','experience','maxExperience','ultimate','roleQuest'])delete p[key];p.goldSource='ocr';p.goldExpiresAt=new Date(Date.now()+60000).toISOString();});
 await page.evaluate(s=>{window.hudFixture.setState(s);window.hudFixture.setScene('live');},missing);await page.waitForTimeout(100);
 assert.equal(await page.locator('.lb-meter.is-unavailable').count(),30);assert.equal(await page.locator('.lb-ultimate.unknown').count(),10);assert.equal(await page.locator('.lb-quest.is-unavailable').count(),10);
 await page.locator('.lb-scoreboard').screenshot({path:path.join(evidence,'bottom-unavailable-telemetry.png')});checks.push('Absent real vitals, experience, ultimate and role quest stay explicitly unavailable');
 for(const width of [1440,1280,960]){await page.setViewportSize({width,height:Math.ceil(width*9/16)});const scaled=await page.locator('.lb-scoreboard').boundingBox();assert.ok(Math.abs(scaled.width/width-928/1920)<.001);assert.ok(Math.abs(scaled.x/width-496/1920)<.001);}
 checks.push('Layout geometry scales proportionally at 1440,1280,960 widths');
 assert.deepEqual(errors,[]);
 await writeFile(path.join(evidence,'verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,pixelChecks,geometry:{bottom:box,top:topBox,mask:maskBox},boundary:'Isolated browser with synthetic explicitly supplied telemetry. Art requests use official static Riot images. No OBS or production state was accessed.'},null,2));
 console.log('PASS LPL HUD: '+checks.join('; '));
}finally{await browser?.close();await vite.close();await new Promise(resolve=>server.close(resolve));}
