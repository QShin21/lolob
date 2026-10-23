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
const { bundledChampions } = await tsImport('../shared/champion-art.ts', import.meta.url);
const state = createFixture();
state.players.forEach((p, i) => { p.telemetryDamageSource = 'postgame'; p.telemetryDamage = { toChampions: 10000 + 1000 * i, physicalToChampions: 6000 + 600 * i, magicToChampions: 3500 + 350 * i, trueToChampions: 500 + 50 * i }; p.visionScore = 20 + i; });
state.economy = Array.from({ length: 61 }, (_, i) => ({ time: i * 30, blue: 2500 + i * 700, red: 2500 + i * 600 + Math.sin(i / 4) * 2500, source: 'api' }));
state.economy.splice(20, 3); state.gameTime = 1800;
const base = finalizeGame(state, { source: 'manual', winner: 'blue', sourceGameId: '801' });
state.gameResults = Array.from({ length: 7 }, (_, i) => {
  const r = structuredClone(base); r.seriesComplete = false; r.id = `g${i + 1}`; r.key = `key${i + 1}`; r.sourceGameId = String(801 + i); r.game = i + 1; r.match.game = i + 1; r.snapshot.duration = 1800 + i * 60; r.endedAt = new Date(Date.parse('2026-10-22T00:00:00Z') + i * 3600000).toISOString();
  const heroes = bundledChampions(); r.snapshot.players.forEach((p, j) => { p.championId = heroes[20 + i * 10 + j].id; p.championName = heroes[20 + i * 10 + j].name; });
  r.draft.bluePicks = r.snapshot.players.slice(0, 5).map(p => p.championId); r.draft.redPicks = r.snapshot.players.slice(5).map(p => p.championId);
  if (i % 2) { [r.blueTeamId, r.redTeamId] = [r.redTeamId, r.blueTeamId]; r.match.blueTeamId = r.blueTeamId; r.match.redTeamId = r.redTeamId; r.snapshot.players.forEach(p => p.team = p.team === 'blue' ? 'red' : 'blue'); [r.draft.bluePicks, r.draft.redPicks] = [r.draft.redPicks, r.draft.bluePicks]; }
  r.winner = i % 3 ? 'red' : 'blue'; r.winnerTeamId = r[`${r.winner}TeamId`]; return r;
});
state.selectedPlayerId = state.players[0].id; state.players[0].fullRuneIds = [8437,8446,8444,8451,8304,8345]; state.players[0].statRuneIds = [5005,5008,5011];
state.draftHistory = []; state.match.game = 8; state.production.rules = { mode: 'fearless', scope: 'all', exceptionGames: [], remakeHistory: 'discard' };
const timeline = { gameId: '807', frames: [{ events: [{ type: 'ITEM_PURCHASED', timestamp: 60000, participantId: 2, itemId: 1001 }, { type: 'ITEM_UNDO', timestamp: 65000, participantId: 2, beforeId: 1001, afterId: 0 }] }] };
const details = { gameId: '807', participants: [{ participantId: 2, championId: bundledChampions()[81].key, teamId: 100 }], participantIdentities: [{ participantId: 2, player: { summonerName: '测试选手' } }] };
const dir = path.resolve('verification-output/archive-graphics'); await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, 'index.html'), '<html><head><meta charset="utf-8"/></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
await writeFile(path.join(dir, 'entry.tsx'), `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ArchiveGraphics,ArchiveGraphicsLinks,ArchiveGraphicsOutput}from'/src/components/ArchiveGraphics';import{PlayerBuild}from'/src/components/PlayerBuild';const initial=${JSON.stringify(state)},heroes=${JSON.stringify(bundledChampions())},timeline=${JSON.stringify(timeline)},details=${JSON.stringify(details)};function App(){const[mode,setMode]=useState('team'),[state,setState]=useState(initial),[items,setItems]=useState(timeline),[control,setControl]=useState(false);window.fixture={mode:setMode,items:setItems,controls:setControl,unknown:()=>setState(s=>({...s,gameResults:s.gameResults.map(r=>({...r,snapshot:{...r.snapshot,players:r.snapshot.players.map(p=>({...p,role:''}))}}))})),empty:()=>setState(s=>({...s,gameResults:[]}))};if(new URLSearchParams(location.search).has('build')){const build=structuredClone(state);if(new URLSearchParams(location.search).has('missing')){delete build.players[0].fullRuneIds;delete build.players[0].statRuneIds;delete build.players[0].runeIds;delete build.players[0].runeSelection;}return <div style={{width:'100vw',height:'100vh',containerType:'inline-size','--cast-ink':'#121d29','--cast-line':'#405568','--cast-muted':'#aabbcc','--cast-panel':'#1b2b3c','--cast-font':'sans-serif'}}><PlayerBuild state={build} champions={heroes} output bus="program"/></div>;}return control?<ArchiveGraphicsLinks state={state}/>:location.search?<ArchiveGraphicsOutput state={state} champions={heroes}/>:<ArchiveGraphics state={state} champions={heroes} resultId="g7" mode={mode} timeline={items} details={details}/>};document.body.style.cssText='margin:0;background:#0b1622;overflow:hidden';createRoot(document.getElementById('root')).render(<App/>);`);
const server = await createServer({ configFile: false, cacheDir: path.join(dir, 'vite-cache'), plugins: [react()], server: { host: '127.0.0.1', port: 0 } }); await server.listen();
let browser; const errors = [], checks = [];
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  const url = `http://127.0.0.1:${server.httpServer.address().port}/verification-output/archive-graphics/index.html`;
  await page.route('**/api/game-archives/g7', r => r.fulfill({ json: { result: state.gameResults[6], raw: { timeline: { payload: timeline }, details: { payload: details } } } }));
  await page.route('**/api/resources/asset?**', r => {
    const target = new URL(r.request().url()).searchParams.get('url');
    return target?.endsWith('/item.json') ? r.fulfill({ json: { data: { 1001: { name: '速度之靴', gold: { total: 300 } } } } }) : r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#c1a96b"/></svg>' });
  });
  await page.goto(url); await page.locator('.ag-metrics').waitFor();
  for (const mode of ['team', 'damage', 'gold', 'series', 'fearless', 'fearless-tree', 'items']) {
    await page.evaluate(m => window.fixture.mode(m), mode); await page.locator(`.ag-mode-${mode}`).waitFor();
    if (mode === 'damage') assert.equal(await page.locator('.ag-damage-list article').count(), 10);
    if (mode === 'series') assert.equal(await page.locator('.ag-series article').count(), 7);
    if (mode === 'fearless-tree') assert.equal(await page.locator('.ag-tree .ag-hero').count(), 70);
    if (mode === 'items') { assert.equal(await page.locator('.ag-items article').count(), 2); await page.getByText('速度之靴', { exact: true }).first().waitFor(); assert.match(await page.locator('.ag-items').innerText(), /测试选手/); assert.equal(await page.locator('.ag-item-player .ag-hero img').count(), 2); }
    const overflow = await page.locator('.ag-body').evaluate(n => n.scrollHeight > n.clientHeight + 2 || n.scrollWidth > n.clientWidth + 2);
    if (overflow) { await page.screenshot({ path: path.join(dir, `${mode}-overflow.png`) }); console.log(await page.locator('.ag-body').evaluate(n => ({ body: [n.clientWidth, n.scrollWidth, n.clientHeight, n.scrollHeight], children: [...n.querySelectorAll('*')].filter(c => c.getBoundingClientRect().bottom > n.getBoundingClientRect().bottom + 2).map(c => [c.tagName, c.className, c.getBoundingClientRect().bottom]) }))); }
    assert.equal(overflow, false, `${mode} body bounds`);
    await page.screenshot({ path: path.join(dir, `${mode}-1920.png`) }); checks.push(`${mode}: frozen data renders within 1920x1080 bounds`);
  }
  await page.evaluate(() => window.fixture.items(undefined)); await page.locator('.ag-empty h2').waitFor();
  assert.match(await page.locator('.ag-empty').innerText(), /尚未采集/); checks.push('missing item timeline shows empty state');
  await page.evaluate(() => { window.fixture.mode('fearless'); window.fixture.unknown(); });
  const unknown = page.locator('.ag-fearless-lanes article').last();
  assert.equal(await unknown.locator('.ag-hero').count(), 70);
  assert.equal(await page.locator('.ag-body').evaluate(n => n.scrollHeight > n.clientHeight + 2), false);
  await page.screenshot({ path: path.join(dir, 'fearless-unknown-lanes.png') }); checks.push('unknown lanes remain unassigned and fit dense history');
  await page.setViewportSize({ width: 1280, height: 720 }); await page.evaluate(() => window.fixture.mode('damage'));
  assert.equal(await page.locator('.ag-body').evaluate(n => n.scrollHeight > n.clientHeight + 2 || n.scrollWidth > n.clientWidth + 2), false);
  await page.screenshot({ path: path.join(dir, 'damage-1280.png') }); checks.push('1280px responsive damage layout');
  await page.goto(`${url}?result=g7&mode=items`); await page.locator('.ag-items article').first().waitFor();
  assert.equal(await page.locator('.ag-items article').count(), 2); assert.match(await page.locator('.ag-items').innerText(), /测试选手/); checks.push('route wrapper loads exact participant identity and raw timeline for fixed result');
  await page.goto(url); await page.evaluate(() => window.fixture.controls(true));
  await page.getByLabel('归档图形模式').selectOption('fearless-tree'); await page.getByLabel('归档图形页码').fill('2');
  const link = await page.getByLabel('归档图形链接').inputValue(); assert.match(link, /result=g7/); assert.match(link, /mode=fearless-tree/); assert.match(link, /page=2/);
  await page.getByRole('button', { name: '复制图形链接' }).click(); await page.getByText('链接已复制', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), link); checks.push('archive and mode selectors produce a copyable fixed-identity link');
  await page.goto(`${url}?build=1`); await page.locator('.pb-rune-icons img').last().waitFor();
  assert.equal(await page.locator('.pb-rune-icons img').count(), 9);
  await page.waitForFunction(() => [...document.querySelectorAll('.pb-rune-icons img')].every(i => i.complete && i.naturalWidth > 0));
  assert.equal(await page.locator('.pb-output').evaluate(n => n.scrollWidth > n.clientWidth + 2), false);
  await page.screenshot({ path: path.join(dir, 'player-build-runes.png') }); checks.push('player build shows six rune choices and three bundled stat shard images');
  await page.goto(`${url}?build=1&missing=1`); await page.locator('.pb-rune-unknown').last().waitFor();
  assert.equal(await page.locator('.pb-rune-unknown').count(), 9); assert.equal(await page.locator('.pb-rune-icons img').count(), 0); checks.push('missing player build runes remain nine unknown slots');
  assert.deepEqual(errors, []);
  await writeFile(path.join(dir, 'report.json'), JSON.stringify({ status: 'passed', scope: 'Synthetic archived results and mocked raw timeline endpoint', checks, errors }, null, 2));
  console.log(JSON.stringify({ status: 'passed', checks, output: dir }));
} finally { await browser?.close(); await server.close(); }
