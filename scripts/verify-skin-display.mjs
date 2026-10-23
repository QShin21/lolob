import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tsImport } from 'tsx/esm/api';
const { chromium } = await import(pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href);
const { createFixture } = await tsImport('../server/test-support/fixture.ts', import.meta.url);
const { bundledChampions } = await tsImport('../shared/champion-art.ts', import.meta.url);
const state = createFixture(), champions = bundledChampions(); state.phase = 'live'; state.gameTime = 900; state.production = undefined;
state.connections.live = { status: 'connected', updatedAt: new Date().toISOString(), detail: 'synthetic' };
state.players.forEach((p, i) => { p.skinId = i === 0 ? 2 : i === 1 ? 0 : i === 3 ? 999 : 1; }); delete state.players[4].skinId;
const badChampion = state.players[2].championId, firstChampion = state.players[0].championId;
const dir = path.resolve('verification-output/skin-display'); await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, 'index.html'), '<html><head><meta charset="utf-8"/></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
await writeFile(path.join(dir, 'entry.tsx'), `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BroadcastAnalysis,BroadcastAnalysisControls}from'/src/components/BroadcastAnalysis';import'/src/styles.css';const initial=${JSON.stringify(state)},champions=${JSON.stringify(champions)};function App(){const[state,setState]=useState(initial),[mode,setMode]=useState('off'),[controls,setControls]=useState(true);window.fixture={hideControls:()=>setControls(false),refresh:()=>setState(s=>({...s,connections:{...s.connections,live:{...s.connections.live,status:'connected',updatedAt:new Date().toISOString()}}})),stale:()=>setState(s=>({...s,connections:{...s.connections,live:{...s.connections.live,status:'disconnected'}}})),version:()=>setState(s=>({...s,production:{versions:{resources:'99.1.1'}},connections:{...s.connections,live:{...s.connections.live,status:'connected',updatedAt:new Date().toISOString()}}}))};return controls?<BroadcastAnalysisControls mode={mode} onModeChange={m=>{setMode(m);setControls(false)}} killFeed={false} onKillFeedChange={()=>{}} announcer={false} onAnnouncerChange={()=>{}} inhibitors={false} onInhibitorsChange={()=>{}}/>:<main style={{position:'relative',containerType:'inline-size',width:'100vw',height:'56.25vw',background:'#263a4c'}}><BroadcastAnalysis state={state} champions={champions} mode={mode}/></main>}document.body.style.margin='0';createRoot(document.getElementById('root')).render(<App/>);`);
const server = await createServer({ configFile: false, cacheDir: path.join(dir, 'vite-cache'), plugins: [react()], server: { host: '127.0.0.1', port: 0 } }); await server.listen();
let browser; const checks = [], errors = [], requested = [];
try {
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/resources/asset?*', async route => {
    const url = new URL(new URL(route.request().url()).searchParams.get('url')); requested.push(url.pathname);
    const metadata = /\/data\/zh_CN\/champion\/([A-Za-z0-9]+)\.json$/.exec(url.pathname);
    if (metadata) { const id = metadata[1], prefix = url.pathname.includes('/99.1.1/') ? '新版' : '测试'; return route.fulfill({ json: { data: { [id]: { id, skins: [{ num: 0, name: 'default' }, { num: 1, name: `${prefix}皮肤 ${id}` }, { num: 2, name: `${prefix}炫彩 ${id}`, parentSkin: 1 }] } } } }); }
    const splash = /\/splash\/([A-Za-z0-9]+)_(\d+)\.jpg$/.exec(url.pathname);
    if (splash) { if (splash[1] === badChampion) return route.fulfill({ status: 404 }); const champion = champions.find(c => c.id === splash[1]); return route.fulfill({ path: path.resolve('public', `.${champion.splash}`), contentType: 'image/webp' }); }
    return route.fulfill({ status: 404 });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/verification-output/skin-display/index.html`);
  await page.getByLabel('局内分析面板').selectOption('skin-display'); await page.getByRole('region', { name: '选手皮肤展示' }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.skin-card[data-known=true]').length === 8); checks.push('production analysis selector opens the ten-player skin graphic');
  assert.equal(await page.locator('.skin-card').count(), 10); assert.match(await page.locator('.skin-card').nth(0).innerText(), /炫彩 · 使用所属皮肤原画/); assert.match(await page.locator('.skin-card').nth(1).innerText(), /原生皮肤/);
  assert(requested.some(p => p.endsWith(`/splash/${firstChampion}_1.jpg`))); assert(!requested.some(p => p.endsWith(`/splash/${firstChampion}_2.jpg`))); checks.push('explicit zero and chroma parent mappings render their correct names and requested art identity');
  assert.equal(await page.locator('.skin-card').nth(3).locator('img').count(), 0); assert.match(await page.locator('.skin-card').nth(3).innerText(), /皮肤 #999 · 目录未收录/); assert.match(await page.locator('.skin-card').nth(4).innerText(), /皮肤信息未提供/); checks.push('absent and unrecognised IDs keep unknown states without default-skin substitution');
  await page.getByText('皮肤原画暂不可用', { exact: true }).waitFor(); assert.match(await page.locator('.skin-card').nth(2).innerText(), /测试皮肤/); checks.push('failed art keeps known skin name with an explicit image placeholder');
  await page.evaluate(() => window.fixture.refresh()); await page.screenshot({ path: path.join(dir, 'skin-1920.png') });
  await page.setViewportSize({ width: 1280, height: 720 }); const bounds = await page.locator('.analysis-skin-display').boundingBox(); assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 1280 && bounds.y + bounds.height <= 720); await page.screenshot({ path: path.join(dir, 'skin-1280.png') }); checks.push('ten-player cards fit both 1920px and 1280px canvases');
  await page.evaluate(() => window.fixture.stale()); await page.waitForFunction(() => document.querySelectorAll('.skin-card img').length === 0); assert.equal(await page.getByText('等待有效局内数据', { exact: true }).count(), 10); checks.push('live disconnection withdraws all displayed skin images');
  await page.evaluate(() => window.fixture.version()); await page.getByText(`新版炫彩 ${firstChampion}`, { exact: true }).waitFor(); assert(requested.some(p => p.startsWith('/cdn/99.1.1/'))); checks.push('resource version switch replaces the previous catalog without stale skin names');
  assert.deepEqual(errors, []); const report = { status: 'passed', scope: 'Isolated UI with explicit synthetic skin metadata and bundled art; real Riot identifier schema and resource bytes validated separately', checks, errors }; await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await browser?.close(); await server.close(); }
