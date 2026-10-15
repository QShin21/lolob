import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tsImport } from 'tsx/esm/api';
import { amounts, counts, reportFixture } from './report-093-fixture.mjs';
const modulePath=process.env.RIFTCAST_PLAYWRIGHT_MODULE;
const {chromium}=await import(modulePath?pathToFileURL(modulePath).href:'playwright');
const {bundledChampions}=await tsImport('../shared/champion-art.ts',import.meta.url);
const dir=path.resolve('verification-output/release-0.9.3/layout');await fs.mkdir(dir,{recursive:true});
const fixtures=Object.fromEntries(['full','partial','missing'].map(v=>[v,reportFixture(v)]));
await fs.writeFile(path.join(dir,'index.html'),'<div id="root"></div><script type="module" src="./entry.tsx"></script>');
await fs.writeFile(path.join(dir,'entry.tsx'),`import React from'react';import{createRoot}from'react-dom/client';import{BroadcastCanvas}from'/src/components/BroadcastCanvas';import'/src/styles.css';import'/src/design-tokens.css';const q=new URLSearchParams(location.search);const state=${JSON.stringify(fixtures)}[q.get('variant')||'full'];state.overlay.postgamePage=Number(q.get('page')||1);document.body.style.margin='0';createRoot(document.getElementById('root')).render(<BroadcastCanvas state={state} champions={${JSON.stringify(bundledChampions())}} scene="postgame" output/>);`);
const vite=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:5198,strictPort:true}});await vite.listen();
let browser;const errors=[],checks=[];
try {
  browser=await chromium.launch({headless:true,...(process.env.RIFTCAST_BROWSER_EXECUTABLE?{executablePath:process.env.RIFTCAST_BROWSER_EXECUTABLE}:{channel:process.env.RIFTCAST_BROWSER_CHANNEL||'msedge'})});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{}}));
  for(const width of [1920,1280])for(const variant of ['full','partial','missing']) {
    await page.setViewportSize({width,height:width*9/16});
    await page.goto(`http://127.0.0.1:5198/verification-output/release-0.9.3/layout/index.html?variant=${variant}`);
    await page.locator('.pr-gold-player').last().waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);
    assert.equal(await page.locator('.pr-gold-player').count(),10);assert.equal(await page.locator('.pr-metrics>div').count(),6);
    const text=await page.locator('.pr-overview').innerText();assert.match(text,/英雄经济/);assert.doesNotMatch(text,/远古龙|峡谷先锋|ELDERS|HERALDS|对英雄伤害|DAMAGE/);
    assert.deepEqual(await page.locator('.pr-metrics>div>span').allTextContents(),['KDA','GOLD · 团队经济','TURRETS · 防御塔','DRAKES · 小龙','BARONS · 大龙','VOIDGRUBS · 虚空巢虫']);
    for(const side of ['blue','red']) {
      const base=side==='blue'?0:5;
      assert.deepEqual(await page.locator(`.pr-gold-player.${side} .pr-gold-label>b`).allTextContents(),amounts.slice(base,base+5).map((n,i)=>variant==='missing'||variant==='partial'&&base+i===0?'未采集':`${(n/1000).toFixed(1)}k`));
      for(const [i,key]of ['towers','dragons','barons','voidgrubs'].entries())assert.equal(await page.locator('.pr-metrics>div').nth(i+2).locator('b').nth(side==='blue'?0:1).innerText(),variant==='missing'||variant==='partial'&&side==='red'&&key==='barons'?'未采集':String(counts[side][key]));
    }
    const overflow=await page.locator('.fit-name').evaluateAll(nodes=>nodes.filter(h=>{const t=h.firstElementChild.getBoundingClientRect(),r=h.getBoundingClientRect();return t.width>r.width+1||t.left<r.left-1||t.right>r.right+1;}).map(h=>h.textContent));assert.deepEqual(overflow,[]);
    if(variant==='missing')assert.ok((await page.locator('.pr-bar>i').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width))).every(w=>w===0));
    await page.screenshot({path:path.join(dir,`${variant}-${width}.png`)});checks.push(`${variant}/${width}: 10 gold values, four objective rows, explicit missing values, names fit`);
  }
  for(const width of [1920,1280]) {
    await page.setViewportSize({width,height:width*9/16});await page.goto('http://127.0.0.1:5198/verification-output/release-0.9.3/layout/index.html?page=2');await page.locator('.pr-ring').last().waitFor();
    assert.equal(await page.locator('.pr-ring').count(),30);assert.equal(await page.locator('.fit-name').count(),10);await page.screenshot({path:path.join(dir,`matchups-${width}.png`)});checks.push(`matchups/${width}: existing second page preserved`);
  }
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(dir,'report.json'),JSON.stringify({checks,errors,fixture:'synthetic OCR archive, not a real game'},null,2));console.log(checks);
}finally{await browser?.close();await vite.close();}
