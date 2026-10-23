import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tsImport } from 'tsx/esm/api';
const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
const { createFixture } = await tsImport('../server/test-support/fixture.ts', import.meta.url);
const { finalizeGame } = await tsImport('../server/game-results.ts', import.meta.url);
const { seasonStatistics } = await tsImport('../shared/season-statistics.ts', import.meta.url);
const { BUILTIN_RUNTIME_STYLE } = await tsImport('../shared/style-packs.ts', import.meta.url);
const { bundledChampions } = await tsImport('../shared/champion-art.ts', import.meta.url);
const state = createFixture(); state.production.control = { owner: 'visual-seat', name: '图形验收' }; state.gameTime = 1800;
state.players.forEach((p, i) => { p.damageDealt = 15000 + i * 1000; p.damageTaken = 10000 + i * 2000; p.gold = 12000 + i * 100; p.visionScore = 12 + i; p.registeredPlayerId = `fixture-${i}`; p.statsGameTime = 1800; });
finalizeGame(state, { source: 'live', sourceGameId: 'visual-season-1', winner: 'blue', terminal: true });
const players = seasonStatistics(state).players;
let audience = { status: 'connected', detail: '隔离验收：Twitch 事件样例', channel: { id: '123', login: 'fixture-channel' }, capabilities: { polls: true, predictions: true, chat: true }, display: 'poll', warnings: [],
  poll: { id: 'p1', title: '谁会赢下这场关键对局？', status: 'ACTIVE', endsAt: new Date(Date.now() + 600000).toISOString(), choices: [{ id: '1', title: '苍穹竞技', votes: 640 }, { id: '2', title: '赤焰战队', votes: 360 }] },
  prediction: { id: 'r1', title: '下一条巨龙归属', status: 'LOCKED', choices: [{ id: '1', title: '蓝方', votes: 56, points: 4000 }, { id: '2', title: '红方', votes: 44, points: 3000 }] } };
const evidence = path.resolve('verification-output/leaguebroadcast-parity-ui'); await mkdir(evidence, { recursive: true });
const vite = await createServer({ configFile: false, cacheDir: path.join(evidence, '.vite'), plugins: [react()], server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }); await vite.listen();
const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
const errors = [], requests = [], checks = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.RIFTCAST_BROWSER_CHANNEL || 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), body = request.method() === 'POST' ? request.postDataJSON() : undefined;
    requests.push({ path: url.pathname, method: request.method(), op: body?.op });
    if (url.pathname === '/api/state') return route.fulfill({ json: state });
    if (url.pathname === '/api/champions') return route.fulfill({ json: { version: 'fixture', champions: bundledChampions() } });
    if (url.pathname.startsWith('/api/style-packs/')) return route.fulfill({ json: { ...BUILTIN_RUNTIME_STYLE, assets: {} } });
    if (url.pathname === '/api/control/seat') return route.fulfill({ json: { token: 'fixture-seat-token', id: 'visual-seat', name: '图形验收', role: 'director' } });
    if (url.pathname === '/api/network') return route.fulfill({ json: { enabled: false, urls: [] } });
    if (url.pathname === '/api/obs/engine') return route.fulfill({ json: { mode: 'embedded', available: false, running: false, connected: false, version: '', streamActive: false, recordActive: false, sceneName: '', inputs: [] } });
    if (url.pathname === '/api/twitch-audience') {
      if (body?.op === 'display') audience.display = body.display;
      if (body?.op === 'start-vote') audience.chatVote = { id: 'local', title: body.title, status: 'ACTIVE', startedAt: new Date().toISOString(), endsAt: new Date(Date.now() + body.durationSeconds * 1000).toISOString(), totalVoters: 0, choices: body.options.map((title, i) => ({ id: String(i + 1), title, votes: 0 })) };
      return route.fulfill({ json: audience });
    }
    return route.fulfill({ status: 503, json: { error: '隔离验收未连接设备' } });
  });
  await context.routeWebSocket('**/ws', route => route.send(JSON.stringify(state)));
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/#manage'); await page.getByRole('tab', { name: '赛季统计', exact: true }).click(); await page.locator('.season-statistics table tbody tr').first().waitFor();
  assert.equal(await page.locator('.season-statistics table tbody tr').count(), 10);
  await page.screenshot({ path: path.join(evidence, 'season-workspace-1600.png') }); checks.push('Management tab renders ten archived players');
  await page.getByLabel('排行榜指标', { exact: true }).selectOption('damage');
  await page.getByLabel('最少出场局数', { exact: true }).fill('2'); assert.equal(await page.locator('.season-statistics table tbody tr').count(), 0); assert.match(await page.locator('.season-statistics a').first().getAttribute('href'), /minimum=2/);
  await page.getByLabel('最少出场局数', { exact: true }).fill('1');
  await page.getByRole('button', { name: '英雄选禁', exact: true }).click(); assert.ok(await page.locator('.season-statistics table tbody tr').count() > 0);
  await page.getByText('选用率样本 1 局', { exact: false }).waitFor(); await page.screenshot({ path: path.join(evidence, 'season-champions-1600.png') });
  await page.getByRole('button', { name: '历史交手', exact: true }).click(); assert.equal(await page.locator('.season-statistics table tbody tr').count(), 1); checks.push('Metric threshold, champion BP and head-to-head controls work');
  await page.setViewportSize({ width: 640, height: 1000 }); await page.screenshot({ path: path.join(evidence, 'season-workspace-640.png') }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto(base + '/overlay/season?metric=damage'); await page.locator('.season-overlay-ranking article').first().waitFor(); assert.equal(await page.locator('.season-overlay-ranking article').count(), 5); await page.screenshot({ path: path.join(evidence, 'season-ranking-1920.png') });
  await page.goto(base + '/overlay/season?metric=kda&player=' + encodeURIComponent(players[0].id)); await page.locator('.season-overlay-spotlight').waitFor(); assert.equal(await page.locator('.season-overlay-spotlight .season-spotlight-metrics>div').count(), 6); await page.screenshot({ path: path.join(evidence, 'season-spotlight-1920.png') }); checks.push('Actual /overlay/season route shows Top5 and player spotlight');
  await page.setViewportSize({ width: 1600, height: 1000 }); await page.goto(base + '/#settings'); await page.getByRole('tab', { name: /观众互动/ }).click(); await page.locator('.twitch-audience-workspace').waitFor(); await page.locator('.twitch-audience-graphic').waitFor(); await page.screenshot({ path: path.join(evidence, 'twitch-workspace-1600.png') });
  await page.getByRole('button', { name: '开始收集聊天投票', exact: true }).click(); await page.getByRole('button', { name: '聊天投票', exact: true }).click(); await page.locator('.twitch-audience-graphic h2').filter({ hasText: '本局 MVP 是谁' }).waitFor(); checks.push('Settings audience tab starts a local vote and selects it for output');
  await page.setViewportSize({ width: 640, height: 1000 }); await page.screenshot({ path: path.join(evidence, 'twitch-workspace-640.png') }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
  await page.setViewportSize({ width: 1920, height: 1080 }); audience.display = 'poll'; await page.goto(base + '/overlay/twitch'); await page.locator('.twitch-audience-graphic').waitFor(); assert.match(await page.locator('.twitch-audience-graphic').innerText(), /64.0%/);
  assert.deepEqual(await page.evaluate(() => [document.documentElement, document.body].map(el => getComputedStyle(el).backgroundColor)), ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
  await page.screenshot({ path: path.join(evidence, 'twitch-overlay-1920.png'), omitBackground: true }); checks.push('Actual /overlay/twitch route renders vote proportions over a transparent page');
  state.previewScene = 'lineup'; state.connections.lcu = { status: 'connected', detail: '隔离符文样本' };
  for (const p of state.players) { p.fullRuneIds = [8437,8446,8444,8451,8304,8345]; p.statRuneIds = [5005,5008,5011]; }
  await page.goto(base + '/overlay?preview=1'); await page.locator('.rl-runes [data-rune-kind="shard"] img').first().waitFor();
  assert.equal(await page.locator('.rl-runes img').count(), 90); assert.equal(await page.locator('.rl-runes [data-rune-kind="shard"] img').count(), 30);
  assert.equal(await page.locator('.rl-runes [data-rune-kind="shard"] img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), true);
  await page.screenshot({ path: path.join(evidence, 'lineup-nine-runes-1920.png') });
  delete state.players[0].statRuneIds; await page.reload(); await page.locator('.rl-rune-unknown').first().waitFor(); assert.equal(await page.locator('.rl-runes [data-rune-kind="shard"] img').count(), 27); checks.push('Lineup renders six choices plus three offline stat shards per player and preserves missing slots');
  state.previewScene = 'schedule'; state.schedule[0].status = 'finished'; state.overlay.scheduleView = { filter: 'finished', page: 0, day: '' };
  await page.goto(base + '/overlay?preview=1'); await page.locator('.cast-schedule-row').first().waitFor();
  assert.equal(await page.locator('.cast-schedule-row:not(.finished)').count(), 0); assert.equal(await page.locator('.cast-schedule-row.finished').count(), 1);
  await page.getByText('已完成比赛与赛果', { exact: true }).waitFor(); await page.screenshot({ path: path.join(evidence, 'schedule-finished-1920.png') }); checks.push('Schedule output selects completed matches and renders their results');
  assert.deepEqual(errors, []);
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify({ status: 'passed', mode: 'isolated mocked API and WebSocket; actual App routes', checks, errors, requests }, null, 2)); console.log(JSON.stringify({ status: 'passed', checks, evidence }));
} finally { await browser?.close(); await vite.close(); }
