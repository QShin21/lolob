import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tsImport } from 'tsx/esm/api';
const { chromium } = await import(pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href);
const { createFixture } = await tsImport('../server/test-support/fixture.ts', import.meta.url);
const { finalizeGame } = await tsImport('../server/game-results.ts', import.meta.url);
const { frozenGameState } = await tsImport('../shared/game-results.ts', import.meta.url);
const state = createFixture(); state.production = undefined; state.overlay.postgamePage = 3;
state.players.forEach((p, i) => { p.telemetryDamageSource = 'postgame'; p.damageDealt = 10000 + i * 500; p.telemetryDamage = { toChampions: p.damageDealt, physicalToChampions: p.damageDealt * .6, magicToChampions: p.damageDealt * .35, trueToChampions: p.damageDealt * .05 }; });
delete state.players[1].telemetryDamage.magicToChampions;
state.players[2].damageDealt = 0; state.players[2].telemetryDamage = { toChampions: 0, physicalToChampions: 0, magicToChampions: 0, trueToChampions: 0 };
finalizeGame(state, { source: 'manual' }); state.connections.live.status = 'disconnected';
const view = frozenGameState(JSON.parse(JSON.stringify(state)));
const dir = path.resolve('verification-output/postgame-composition'); await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, 'index.html'), '<html><head><meta charset="utf-8"/></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
await writeFile(path.join(dir, 'entry.tsx'), `import React from 'react';import{createRoot}from'react-dom/client';import{Postgame}from'/src/components/program/PostgameReport';import'/src/components/broadcast-skins.css';import'/src/components/program/program-scenes.css';document.body.style.cssText='margin:0;overflow:hidden';createRoot(document.getElementById('root')).render(<main className="cast-container"><div className="cast-canvas broadcast-canvas" style={{height:'100vh'}}><Postgame state={${JSON.stringify(view)}} champions={[]} items={{}} version="26.18.1"/></div></main>);`);
const server = await createServer({ configFile: false, cacheDir: path.join(dir, 'vite-cache'), plugins: [react()], server: { host: '127.0.0.1', port: 0 } }); await server.listen();
let browser; const errors = [], checks = [];
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }); page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', r => r.fulfill({ status: 404, body: '' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/verification-output/postgame-composition/index.html`);
  await page.locator('.pr-damage-types').first().waitFor();
  assert.equal(await page.locator('.pr-damage-types').count(), 10);
  assert.equal(await page.locator('.pr-damage-composition').count(), 9);
  const typed = await page.locator('.pr-gold-pair').nth(0).locator('.pr-damage-types').first().innerText();
  assert(typed.includes('6,000') && typed.includes('3,500') && typed.includes('500'));
  assert.equal((await page.locator('.pr-gold-pair').nth(1).locator('.pr-damage-types').first().innerText()).match(/—/g)?.length, 3);
  assert.equal((await page.locator('.pr-gold-pair').nth(2).locator('.pr-damage-types').first().innerText()).match(/ 0/g)?.length, 3);
  checks.push('saved disconnected report retains ten rows, nine complete compositions, explicit unknown and genuine zero');
  for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    const metrics = await page.locator('.pr-damage-types').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, overflow: n.scrollWidth > n.clientWidth + 1 }; }));
    assert(metrics.every(r => !r.overflow && r.x >= 0 && r.y >= 0 && r.right <= size.width && r.bottom <= size.height));
    await page.screenshot({ path: path.join(dir, `postgame-${size.width}.png`) });
    checks.push(`${size.width}px: component values fit their rows and remain inside the canvas`);
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(dir, 'report.json'), JSON.stringify({ status: 'passed', scope: 'Archived synthetic result after live disconnect, postgame page 3', checks, errors }, null, 2));
  console.log(JSON.stringify({ status: 'passed', checks, output: dir }));
} finally { await browser?.close(); await server.close(); }
