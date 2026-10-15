import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tsImport } from 'tsx/esm/api';
const {chromium}=await import(pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href);
const {createSeed}=await tsImport('../server/state.ts',import.meta.url);
const dir=path.resolve('verification-output/request-fixes');await mkdir(dir,{recursive:true});
const state=createSeed();state.overlay.ticker=false;state.overlay.sponsor='';state.overlay.sponsorLogo='';
const champions=JSON.parse(await readFile('data/champions.json','utf8'));const list=Array.isArray(champions)?champions:champions.champions||[];
await writeFile(path.join(dir,'index.html'),'<html><body style="margin:0"><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
await writeFile(path.join(dir,'entry.tsx'),`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{BroadcastCanvas}from'/src/components/BroadcastCanvas';import{OcrCalibration}from'/src/components/OcrCalibration';import '/src/design-tokens.css';import '/src/styles.css';const state=${JSON.stringify(state)};const champions=${JSON.stringify(list)};function App(){const [config,setConfig]=useState({enabled:true,blue:{x:.33,y:0,width:.08,height:.06},red:{x:.59,y:0,width:.08,height:.06}});return location.search.includes('ocr')?<OcrCalibration config={config} onChange={setConfig}/>:<BroadcastCanvas state={state} champions={champions} scene={location.search.includes('lineup')?'lineup':'live'} output/>}createRoot(document.getElementById('root')).render(<App/>);`);
const vite=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:5198,strictPort:true,watch:{ignored:['**/verification-output/**','**/runtime/**']}}});await vite.listen();
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1920,height:1080}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{}}));
 await page.goto('http://127.0.0.1:5198/verification-output/request-fixes/index.html?lineup');await page.locator('.cast-lineup-five article').last().waitFor();await page.screenshot({path:path.join(dir,'lineup.png')});assert.equal(await page.locator('.cast-lineup-five article').count(),10);
 const sides=await page.locator('.cast-lineup-side').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));assert.equal(sides[0].y,sides[1].y);assert.ok(sides[1].x>sides[0].x);
 await page.goto('http://127.0.0.1:5198/verification-output/request-fixes/index.html');await page.locator('.lt-native-team').last().waitFor();assert.equal(await page.locator('.lt-dragons,.lt-kills,.ob-score-mask,.lt-clock,.lt-resources').count(),0);assert.equal(await page.locator('.lt-native-extension').evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');await page.screenshot({path:path.join(dir,'live.png'),omitBackground:true});
 await page.unroute('**/api/**');let failed=true;const png=await readFile(path.join(dir,'lineup.png'));await page.route('**/api/obs/game-frame*',r=>failed?r.fulfill({status:400,json:{error:'游戏窗口已最小化，请恢复游戏'}}):r.fulfill({contentType:'image/png',body:png}));
 await page.goto('http://127.0.0.1:5198/verification-output/request-fixes/index.html?ocr');await page.getByRole('button',{name:'载入当前游戏采样图'}).click();await page.getByRole('alert').filter({hasText:'游戏窗口已最小化'}).waitFor();assert.equal(await page.locator('.ocr-frame img').count(),0);
 failed=false;await page.getByRole('button',{name:'载入当前游戏采样图'}).click();await page.locator('.ocr-box').last().waitFor();assert.equal(await page.locator('.ocr-box').count(),3);assert.equal(await page.getByRole('alert').count(),0);assert.equal(await page.locator('.ocr-frame img').evaluate(n=>n.naturalWidth),1920);
 await page.screenshot({path:path.join(dir,'ocr-loaded.png')});assert.deepEqual(errors,[]);await writeFile(path.join(dir,'ui-report.json'),JSON.stringify({passed:true,checks:['legacy ten portrait cards in two side-by-side teams','transparent native top extension; no resource/dragon/clock masks','specific capture error without broken image','successful retry loads single blob with three calibration regions'],errors},null,2));console.log('UI regression passed');
}finally{await browser?.close();await vite.close()}
