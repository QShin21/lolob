import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer as netServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tsImport } from 'tsx/esm/api';
import { isolatedNativeEnvironment, nativeRequestGuard } from './verify-native-safety.mjs';
import { reportFixture } from './report-093-fixture.mjs';
const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
const { BUILTIN_STYLE_REF, BUILTIN_RUNTIME_STYLES, BUILTIN_STYLE_RECORDS, STYLE_SCENES } = await tsImport('../shared/style-packs.ts', import.meta.url);
const { createSeed } = await tsImport('../server/state.ts', import.meta.url);
const { bundledChampions } = await tsImport('../shared/champion-art.ts', import.meta.url);
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const dir = path.resolve('verification-output', `release-${version}`, 'builtins'); await mkdir(dir, { recursive: true });
const sandbox = await mkdtemp(path.join(os.tmpdir(), 'riftcast-five-styles-'));
const data = path.join(sandbox, 'data'); await mkdir(data, { recursive: true });
const listener = netServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r)); const port = listener.address().port; await new Promise(r => listener.close(r));
const base = `http://127.0.0.1:${port}`;
const legacy = reportFixture(); const retired = { id: 'jianlou', revision: 'builtin-v1', name: '简陋包' };
legacy.overlay.stylePack = { ...retired }; legacy.production.program.overlay.stylePack = { ...retired };
legacy.production.previousProgram = { content: structuredClone(legacy.production.program), scene: 'postgame' };
await writeFile(path.join(data, 'state.json'), JSON.stringify(legacy));
const checks = [], errors = [], blocked = []; let service, browser, vite, page, log = '';
async function stop() { if (!service || service.exitCode !== null) return; const done = once(service, 'exit'); service.kill(); await Promise.race([done, new Promise(r => setTimeout(r, 5000))]); if (service.exitCode === null) { service.kill('SIGKILL'); await done; } service = undefined; }
async function start() {
  service = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...await isolatedNativeEnvironment(sandbox), PORT: String(port), RIFTCAST_DATA_DIR: data, RIFTCAST_OBS_AUTOSTART: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  service.stdout.on('data', b => log += b); service.stderr.on('data', b => log += b);
  for (let i = 0; i < 150; i++) { try { assert.equal((await (await fetch(base + '/api/health')).json()).version, version); return; } catch { if (service.exitCode !== null) throw new Error(log); await new Promise(r => setTimeout(r, 200)); } } throw new Error(log || 'Service startup timed out');
}
const state = async () => await (await fetch(base + '/api/state')).json();
try {
  await start(); const initial = await state();
  for (const overlay of [initial.overlay, initial.production.program.overlay, initial.production.previousProgram.content.overlay]) assert.deepEqual(overlay.stylePack, BUILTIN_STYLE_REF);
  assert.deepEqual(initial.gameResults, legacy.gameResults);
  assert.equal((await fetch(base + '/api/style-packs/jianlou/builtin-v1')).status, 404);
  const list = await (await fetch(base + '/api/style-packs')).json();
  assert.equal(list.packs.length, 5); assert.ok(list.packs.every(p => p.builtin)); assert.deepEqual(list.warnings, []);
  checks.push('legacy retired references migrate on both buses and undo; archived game data unchanged; retired API returns 404');
  for (const record of BUILTIN_STYLE_RECORDS) {
    const pack = await (await fetch(`${base}/api/style-packs/${record.manifest.id}/${record.revision}`)).json();
    for (const [id, url] of Object.entries(pack.assets)) {
      const response = await fetch(base + url); assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(createHash('sha256').update(bytes).digest('hex'), record.hashes[record.manifest.assets[id]]);
    }
    const exported = await fetch(`${base}/api/style-packs/${pack.id}/${pack.revision}/export`); assert.equal(exported.status, 200);
    checks.push(`${pack.id}: all 23 approved normalized PNG hashes verified through the real asset API and ZIP export`);
  }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.RIFTCAST_BROWSER_EXECUTABLE ? { executablePath: process.env.RIFTCAST_BROWSER_EXECUTABLE } : { channel: process.env.RIFTCAST_BROWSER_CHANNEL || 'msedge' }) });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); await nativeRequestGuard(blocked).attach(context);
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.goto(base);
  await page.getByRole('button', { name: '风格包', exact: true }).click({ timeout: 30000 });
  const dialog = page.getByRole('dialog'); await dialog.locator('.style-pack-choice').nth(4).waitFor();
  assert.equal(await dialog.locator('.style-pack-choice').count(), 5); assert.doesNotMatch(await dialog.innerText(), /简陋包/);
  assert.match(await dialog.locator('.style-pack-choice').filter({ hasText: '冰川极光' }).innerText(), /默认/);
  for (const pack of BUILTIN_RUNTIME_STYLES.slice(1)) {
    await dialog.locator('.style-pack-choice').filter({ hasText: pack.name }).click();
    await dialog.locator(`[data-style-pack="${pack.id}"][data-style-status=ready]`).waitFor();
    await dialog.getByRole('button', { name: '准备到预监', exact: true }).click();
    await page.waitForFunction(id => document.querySelector('.style-pack-buses')?.textContent?.includes(id), pack.name);
    const result = await state(); assert.equal(result.overlay.stylePack.id, pack.id); assert.deepEqual(result.production.program.overlay.stylePack, BUILTIN_STYLE_REF);
  }
  await page.screenshot({ path: path.join(dir, 'five-builtin-manager.png') });
  const staged = (await state()).overlay.stylePack;
  checks.push('five builtins visible without import; Glacier marked default; all other builtin choices stage independently of program');
  const fixture = createSeed(); fixture.paused = true; fixture.overlay.ticker = true;
  await writeFile(path.join(dir, 'index.html'), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
  await writeFile(path.join(dir, 'entry.tsx'), `import React from'react';import{createRoot}from'react-dom/client';import{BroadcastCanvas}from'/src/components/BroadcastCanvas';import'/src/styles.css';import'/src/design-tokens.css';const q=new URLSearchParams(location.search),packs=${JSON.stringify(BUILTIN_RUNTIME_STYLES.map(({id,revision,name})=>({id,revision,name})))},scene=q.get('scene')||'standby';const state=scene==='postgame'?${JSON.stringify(reportFixture())}:${JSON.stringify(fixture)};state.overlay.stylePack=packs.find(p=>p.id===q.get('pack'));if(q.has('page2'))state.overlay.postgamePage=2;if(q.has('focus'))state.selectedPlayerId=state.players[0].id;document.body.style.margin='0';createRoot(document.getElementById('root')).render(<BroadcastCanvas state={state} champions={${JSON.stringify(bundledChampions())}} scene={scene} output/>);`);
  vite = await createServer({ configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: base, changeOrigin: true } } } }); await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  const variants = [...STYLE_SCENES.map(scene => ({ scene, query: '', suffix: '' })), { scene: 'postgame', query: '&page2=1', suffix: '-page2' }, { scene: 'ranking', query: '&focus=1', suffix: '-focus' }];
  for (const pack of BUILTIN_RUNTIME_STYLES) for (const variant of variants) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${origin}/verification-output/release-${version}/builtins/index.html?scene=${variant.scene}&pack=${pack.id}${variant.query}`);
    await page.locator('.cast-canvas').waitFor();
    if (variant.scene !== 'teamfight') await page.locator(`[data-style-pack=${pack.id}][data-style-status=ready]`).waitFor({ timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    if (['draft','live','economy','ranking','interview','teamfight','gold-ranking'].includes(variant.scene)) assert.equal(await page.locator('.cast-canvas').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    if (variant.scene === 'teamfight') assert.equal(await page.locator('.cast-canvas').innerHTML(), '');
    if (variant.scene === 'postgame' && !variant.suffix) assert.equal(await page.locator('.pr-gold-player').count(), 10);
    assert.equal(await page.locator('.style-pack-frame').evaluateAll(elements => elements.every(el => el.complete && el.naturalWidth === 1920)), true);
    await page.screenshot({ path: path.join(dir, `${pack.id}-${variant.scene}${variant.suffix}.png`), omitBackground: true });
    checks.push(`${pack.id}/${variant.scene}${variant.suffix}: ready, original scene rendered and transparency preserved`);
    console.log(checks.at(-1));
  }
  await browser.close(); browser = undefined; await vite.close(); vite = undefined; await stop(); await start();
  const restored = await state(); assert.deepEqual(restored.overlay.stylePack, staged); assert.deepEqual(restored.production.program.overlay.stylePack, BUILTIN_STYLE_REF);
  assert.equal((await (await fetch(base + '/api/style-packs')).json()).packs.length, 5);
  checks.push('service restart retains staged builtin independently from Glacier program, with no imported copies');
  await stop(); await rm(path.join(data, 'state.json')); await start();
  const fresh = await state(); assert.deepEqual(fresh.overlay.stylePack, BUILTIN_STYLE_REF); assert.deepEqual(fresh.production.program.overlay.stylePack, BUILTIN_STYLE_REF);
  checks.push('fresh installation uses Glacier Aurora on both buses');
  assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
  await writeFile(path.join(dir, 'report.json'), JSON.stringify({ status: 'passed', version, checks, errors, blocked, fixtures: 'synthetic; no live game, OBS outputs or platform streaming' }, null, 2));
} catch(error) { await page?.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{}); await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'failed',version,checks,errors:[...errors,String(error)],blocked,log},null,2));throw error; }
finally { await browser?.close(); await vite?.close(); await stop(); await rm(sandbox,{recursive:true,force:true,maxRetries:5,retryDelay:500}); }
