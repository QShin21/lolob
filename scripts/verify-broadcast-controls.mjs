// Isolated UI fixtures: never opens OBS, connects to a game, or reads production state.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tsImport } from 'tsx/esm/api';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.resolve(process.env.RIFTCAST_CONTROLS_VERIFY_DIR || path.join(root, 'verification-output/broadcast-controls'));
const { createSeed, fallbackChampions, applyAction } = await tsImport('../server/state.ts', import.meta.url);
const { tickPlayerFeeds, playerFeedPairs } = await tsImport('../shared/player-feeds.ts', import.meta.url);
const { goldRanking } = await tsImport('../shared/gold-ranking.ts', import.meta.url);
const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
let state = createSeed(); state.paused = true; state.overlay.nativeHud = 'off'; state.previewScene = 'live'; state.overlay.sponsor = '';
const original = structuredClone(state), champions = fallbackChampions();
state.assets = original.players.map((player, index) => ({ id: `portrait-${index}`, name: `选手素材 ${index + 1}`, type: 'image/webp', url: `/uploads/player-${index}.webp`, createdAt: new Date().toISOString() }));
const cameras = Array.from({ length: 10 }, (_, index) => ({ name: `Fixture camera ${index + 1}`, id: `camera-${index}` }));
const requests = [], errors = [], checks = [];
const entryPath = path.join(root, '_broadcast-controls-fixture.tsx').replaceAll('\\', '/');
const entry = `import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';
import{BroadcastCanvas}from'/src/components/BroadcastCanvas.tsx';import{LiveBottomControls}from'/src/components/LiveBottomControls.tsx';import{PlayerFeedSwitcher}from'/src/components/PlayerFeedSwitcher.tsx';import{GoldRankingControls}from'/src/components/GoldRanking.tsx';import{championArtwork}from'/shared/champion-art.ts';import'/src/styles.css';import'/src/responsive.css';import'/src/director.css';
const initial=await fetch('/fixture/state').then(r=>r.json()),champions=await fetch('/fixture/champions').then(r=>r.json());
function Fixture(){const[state,setState]=useState(initial),[scene,setScene]=useState(null),[gallery,setGallery]=useState(null);
useEffect(()=>{const timer=setInterval(()=>fetch('/fixture/state').then(r=>r.json()).then(setState),100);return()=>clearInterval(timer)},[]);
const send=async(action)=>{const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action)});const result=await response.json();if(!response.ok)throw Error(result.error);setState(result)};
window.broadcastFixture={setState,setScene,setGallery};const ctx={state,champions,send,notify:()=>{}};
return gallery?<div className="fixture-gallery">{champions.slice(gallery.start,gallery.end).map(c=><article key={c.id}><strong>{c.id} · {c.name}</strong><div><img src={championArtwork(c,'draft')} alt={c.name+' BP'}/><img src={championArtwork(c,'lineup')} alt={c.name+' 首发'}/></div></article>)}</div>:<><div className="fixture-stage"><BroadcastCanvas state={state} champions={champions} scene={scene||state.programScene} output/></div><div className="app-shell fixture-settings"><div id="director-switcher"><PlayerFeedSwitcher {...ctx}/></div><LiveBottomControls {...ctx}/><GoldRankingControls {...ctx}/></div></>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
const vite = await createServer({ root, configFile: false, appType: 'custom', plugins: [react(), { name: 'broadcast-controls-fixture', resolveId: id => id === '/_broadcast-controls-fixture.tsx' ? entryPath : undefined, load: id => id === entryPath ? entry : undefined }], server: { middlewareMode: true, hmr: false } });
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/fixture/state') { json(res, state); return; }
    if (req.url === '/fixture/champions') { json(res, champions); return; }
    if (req.url === '/api/obs/cameras') { json(res, { devices: cameras, detail: '隔离摄像头设备列表' }); return; }
    if (req.url === '/api/obs/player-feeds') { json(res, { applied: true, detail: '隔离 OBS 请求成功' }); return; }
    if (req.url === '/api/action') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const action = JSON.parse(Buffer.concat(chunks).toString()); requests.push(action); state = applyAction(state, action); json(res, state); return;
    }
    const upload = req.url?.match(/^\/uploads\/player-(\d+)\.webp$/);
    if (upload) { const source = champions.find(c => c.id === original.players[Number(upload[1])].championId).image; res.setHeader('Content-Type', 'image/webp'); res.end(await readFile(path.join(root, 'public', source))); return; }
    if (req.url === '/' || req.url?.startsWith('/?')) {
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/', `<!doctype html><html><head><meta charset="utf-8"/><style>html,body{margin:0}.fixture-stage{width:100vw;height:56.25vw;background:#19342b;position:relative}.fixture-stage .is-output{width:100%;height:100%}.fixture-settings{display:block!important;max-width:1200px;margin:24px auto;padding:24px}.fixture-gallery{display:grid;grid-template-columns:repeat(8,1fr);gap:8px;padding:16px;background:#080f17;color:#fff;font:12px Arial}.fixture-gallery article{min-width:0}.fixture-gallery strong{display:block;margin-bottom:5px;white-space:nowrap;overflow:hidden}.fixture-gallery article>div{display:flex;align-items:flex-start;gap:3px}.fixture-gallery img{width:calc(50% - 2px);height:214px;object-fit:contain;object-position:top}</style></head><body><div id="root"></div><script type="module" src="/_broadcast-controls-fixture.tsx"></script></body></html>`)); return;
    }
    vite.middlewares(req, res, () => { res.statusCode = 404; res.end(); });
  } catch (error) { json(res, { error: error.message }, 400); }
});
const rotation = setInterval(() => { if (tickPlayerFeeds(state)) state.revision++; }, 50);
let browser;
try {
  await mkdir(evidence, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', error => errors.push(error.message));
  // Item/rune/ultimate telemetry is outside this fixture. Hero art always uses real local assets.
  await page.route('**/api/resources/asset?**', route => route.fulfill({json:{data:{}}}));
  await page.route('https://**', route => route.fulfill(route.request().url().includes('.json') ? { json: { data: {} } } : { contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n1cAAAAASUVORK5CYII=', 'base64') }));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const settings = page.locator('.live-bottom-controls'), switcher = page.locator('#director-switcher');
  await settings.waitFor();
  for (let index = 0; index < 5; index++) {
    await settings.getByRole('tab').nth(index).click();
    await settings.getByLabel('蓝色方图片素材', { exact: true }).selectOption(`/uploads/player-${index}.webp`);
    await settings.getByLabel('红色方图片素材', { exact: true }).selectOption(`/uploads/player-${index + 5}.webp`);
  }
  await settings.getByRole('button', { name: '保存底部配置', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.live-bottom-controls .badge').textContent === '已同步');
  assert.deepEqual(state.overlay.playerFeedPairs.map(pair => [pair.blue.imageUrl, pair.red.imageUrl]), Array.from({ length: 5 }, (_, index) => [`/uploads/player-${index}.webp`, `/uploads/player-${index + 5}.webp`]));
  checks.push('UI saves five independent blue/red material pairs');
  for (let index = 0; index < 5; index++) {
    await switcher.getByRole('button', { name: /^准备/ }).nth(index).click();
    await page.waitForFunction(index => document.querySelector('.lb-feed.blue')?.dataset.feedIndex === String(index), index);
    assert.equal(await page.locator('.lb-feed.blue img').getAttribute('src'), `/uploads/player-${index}.webp`);
    assert.equal(await page.locator('.lb-feed.red img').getAttribute('src'), `/uploads/player-${index + 5}.webp`);
    assert.equal(await page.locator('.lb-feed.blue .lb-nameplate').textContent(), original.players[index].name);
    assert.equal(await page.locator('.lb-feed.red .lb-nameplate').textContent(), original.players[index + 5].name);
  }
  await page.locator('.fixture-stage').screenshot({ path: path.join(evidence, 'live-player-feeds.png') });
  checks.push('Every manual preparation updates both preview portraits and lane names');
  await switcher.getByRole('button', { name: '5 秒自动轮播', exact: true }).click();
  let previous = Date.now();
  for (let step = 0; step < 5; step++) {
    await page.waitForFunction(index => document.querySelector('.lb-feed.blue')?.dataset.feedIndex === String(index), step, { timeout: 7000 });
    const observed = Date.now(); assert.ok(observed - previous >= 4550, `Slot changed early: ${observed - previous}ms`); previous = observed;
    assert.equal(await page.locator('.lb-feed.red').getAttribute('data-feed-index'), String(step));
  }
  checks.push('Complete five-slot auto cycle uses five-second wall-clock slots and synchronized panels');
  await switcher.getByRole('button', { name: '准备中单对位' }).click();
  assert.equal(state.overlay.playerFeedControl.mode, 'manual');
  assert.equal(state.overlay.playerFeedControl.activeIndex, 2);
  // Test camera selection through the same editable group, without starting a physical source.
  await settings.getByRole('tab', { name: '编辑中单' }).click();
  await settings.getByLabel('蓝色方展示来源', { exact: true }).selectOption('camera');
  await settings.getByLabel('蓝色方摄像头设备', { exact: true }).selectOption('camera-2');
  await settings.getByRole('button', { name: '保存底部配置', exact: true }).click();
  await page.locator('.lb-feed.blue.is-camera').waitFor();
  assert.equal(state.overlay.playerFeedPairs[2].blue.cameraDeviceId, 'camera-2');
  checks.push('Camera mode saves its group/device independently; manual cut stops rotation');
  await page.getByRole('button', { name: '切入经济排行', exact: true }).click();
  await page.locator('.cast-gold-ranking').waitFor();
  const expected = goldRanking(state);
  assert.deepEqual(await page.locator('.cast-gold-columns li').evaluateAll(elements => elements.map(element => element.dataset.playerId)), expected.map(row => row.player.id));
  assert.equal(await page.locator('.cast-gold-columns>ol').count(), 2);
  for (let column = 0; column < 2; column++) assert.equal(await page.locator('.cast-gold-columns>ol').nth(column).locator('li').count(), 5);
  assert.equal(await page.locator('.cast-gold-hero img').evaluateAll(images => images.filter(image => image.complete && image.naturalWidth === 120).length), 10);
  assert.deepEqual(await page.locator('.cast-gold-amount').allTextContents(), expected.map(row => Math.round(row.gold).toLocaleString('zh-CN')));
  await page.locator('.fixture-stage').screenshot({ path: path.join(evidence, 'gold-ranking.png') });
  checks.push('Unified descending ranking renders five rows per column, ten local champion icons, bars and full gold numbers');
  // Check every actual hero in both runtime programs, including the final short batch.
  const coverage = new Set();
  for (let start = 0; start < champions.length; start += 10) {
    const batch = champions.slice(start, start + 10);
    state.draft.bluePicks = batch.slice(0, 5).map(champion => champion.id); state.draft.redPicks = batch.slice(5).map(champion => champion.id);
    state.players.forEach((player, index) => { player.championId = batch[index]?.id || ''; });
    await page.evaluate(value => { window.broadcastFixture.setState(value); window.broadcastFixture.setScene('draft'); }, state);
    await page.waitForFunction(() => [...document.querySelectorAll('.cast-draft-card img')].every(image => image.complete && image.naturalWidth === 400));
    assert.equal(await page.locator('.cast-draft-card img').count(), batch.length);
    assert.ok((await page.locator('.cast-draft-card img').evaluateAll(images => images.map(image => getComputedStyle(image).objectFit))).every(fit => fit === 'fill'));
    if (start === 0) await page.locator('.fixture-stage').screenshot({ path: path.join(evidence, 'draft-local-art.png') });
    await page.evaluate(() => window.broadcastFixture.setScene('lineup'));
    await page.waitForFunction(() => [...document.querySelectorAll('.cast-lineup-photo img')].every(image => image.complete && image.naturalWidth === 400 && image.naturalHeight === 864));
    assert.equal(await page.locator('.cast-lineup-photo img').count(), batch.length);
    if (start === 0) await page.locator('.fixture-stage').screenshot({ path: path.join(evidence, 'lineup-local-art.png') });
    batch.forEach(champion => coverage.add(champion.id));
  }
  assert.equal(coverage.size, 173);
  checks.push('All 173 champions decode their prepared artwork in BP and lineup programs');
  for (let start = 0; start < champions.length; start += 48) {
    await page.evaluate(range => window.broadcastFixture.setGallery(range), { start, end: start + 48 });
    await page.waitForFunction(() => [...document.querySelectorAll('.fixture-gallery img')].every(image => image.complete && image.naturalWidth === 400));
    await page.locator('.fixture-gallery').screenshot({ path: path.join(evidence, `champion-art-sheet-${Math.floor(start / 48) + 1}.png`) });
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(evidence, 'verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checks, errors, heroCoverage: coverage.size, configurationRequests: requests.length,
    boundary: 'Isolated browser fixtures with explicit demo data and mocked camera RPCs. Local Riot hero assets decode normally. No production state, OBS, game control or live output was accessed.' }, null, 2));
  console.log(`PASS broadcast controls: ${checks.join('; ')}`);
} finally {
  clearInterval(rotation); await browser?.close(); await vite.close(); await new Promise(resolve => server.close(resolve));
}
