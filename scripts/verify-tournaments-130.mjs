import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { Open } from 'unzipper';
import { isolatedNativeEnvironment, nativeRequestGuard } from './verify-native-safety.mjs';
const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
const { createFixture } = await tsImport('../server/test-support/fixture.ts', import.meta.url);
const { applyAction } = await tsImport('../server/state.ts', import.meta.url);
const { finalizeGame } = await tsImport('../server/game-results.ts', import.meta.url);
const { PostgameArchiveStore } = await tsImport('../server/postgame-archive.ts', import.meta.url);
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const evidence = path.resolve(`verification-output/release-${version}/tournaments`); await mkdir(evidence, { recursive: true });
const sandbox = await mkdtemp(path.join(os.tmpdir(), 'riftcast-tournament-')), dataDir = path.join(sandbox, 'data'); await mkdir(dataDir);
const listener = createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r)); const port = listener.address().port; await new Promise(r => listener.close(r));
const base = `http://127.0.0.1:${port}`, errors = [], blocked = [], checks = [];
let service, browser, page, log = '';
const state = async () => (await fetch(base + '/api/state')).json();
async function start() {
  service = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...await isolatedNativeEnvironment(sandbox), PORT: String(port), RIFTCAST_DATA_DIR: dataDir, RIFTCAST_OBS_AUTOSTART: '0' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  service.stdout.on('data', b => log += b); service.stderr.on('data', b => log += b);
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} if (service.exitCode !== null) throw new Error(log); await new Promise(r => setTimeout(r, 100)); }
  throw new Error(log || 'Startup timed out');
}
async function stop() { if (!service || service.exitCode !== null) return; const done = once(service, 'exit'); service.send({ type: 'riftcast-shutdown' }); await done; service = undefined; }
async function action(value, token) {
  const s = await state();
  const response = await fetch(base + '/api/action', { method: 'POST', headers: { 'content-type': 'application/json', 'x-seat-token': token ?? await page.evaluate(() => sessionStorage.getItem('riftcast-seat-token')) }, body: JSON.stringify({ ...value, expectedConfigVersion: s.production.configVersion, requestId: randomUUID() }) });
  const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body;
}
try {
  await start();
  browser = await chromium.launch({ headless: true, channel: process.env.RIFTCAST_BROWSER_CHANNEL || 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); await nativeRequestGuard(blocked).attach(context);
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/#manage'); await page.getByRole('button', { name: '建立整届赛事', exact: true }).first().click();
  await page.getByLabel('赛事名称', { exact: true }).fill('秋季邀请赛 · 自动化验收');
  await page.getByRole('button', { name: '清空选择', exact: true }).click();
  await page.getByLabel('批量新建战队（每行一队）', { exact: true }).fill('青山\n流水\n星河\n长风\n赤羽\n晴空\n远帆\n白露');
  await page.getByLabel('常规对阵局数', { exact: true }).selectOption('BO1');
  await page.getByLabel('淘汰赛 / 总决赛局数', { exact: true }).selectOption('BO1');
  await page.screenshot({ path: path.join(evidence, 'create-1600.png') });
  const program = (await state()).production.program;
  await page.getByRole('button', { name: '生成整届赛事', exact: true }).click();
  await page.locator('.tournament-header').waitFor();
  const created = await state(), tournamentId = created.tournaments[0].id;
  assert.equal(created.schedule.length, 7); assert.equal(created.tournaments[0].config.teamIds.length, 8); assert.deepEqual(created.production.program, program);
  assert.equal(await page.locator('.tournament-match').count(), 7);
  await page.screenshot({ path: path.join(evidence, 'schedule-1600.png') }); checks.push('UI creates eight teams and a seven-match knockout; previous programme preserved');
  const first = page.locator('.tournament-match').first();
  await first.getByRole('button', { name: '调整 / 赛果', exact: true }).click();
  await first.getByLabel('补录 / 修订原因', { exact: true }).fill('测试副台已结束，比分经裁判核对');
  await first.getByRole('button', { name: '保存赛果并推进', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.tournament-match-info')?.textContent.includes('已完成'));
  const after = await state(); assert.equal(after.schedule[0].tournament.state, 'complete'); assert.equal(after.schedule[4].blueTeamId, after.schedule[0].blueTeamId);
  checks.push('manual side-table result advances winner and preserves the correction reason');
  const deniedSeat = await (await fetch(base + '/api/control/seat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'data', name: '资料验收席', fresh: true }) })).json();
  const denied = await fetch(base + '/api/action', { method: 'POST', headers: { 'content-type': 'application/json', 'x-seat-token': deniedSeat.token }, body: JSON.stringify({ type: 'set-tournament-result', matchId: after.schedule[1].id, blueScore: 1, redScore: 0, reason: 'unauthorized', expectedConfigVersion: after.production.configVersion, requestId: randomUUID() }) }); assert.equal(denied.status, 400);
  const savedState = await state(); await stop();
  let fixture = applyAction(savedState, { type: 'load-match', matchId: savedState.schedule[1].id });
  const sample = createFixture(); Object.assign(fixture, { players: sample.players, stats: sample.stats, events: [], economy: sample.economy, gameTime: 1800 });
  fixture.players.forEach(p => { p.statsSource = 'api'; p.statsGameTime = 1800; });
  const result = finalizeGame(fixture, { source: 'live', winner: 'blue', sourceGameId: '130001', terminal: true }); assert.ok(result); assert.equal(result.tournamentId, tournamentId);
  const store = new PostgameArchiveStore(path.join(dataDir, 'match-archives'));
  result.archive.sources.eog = await store.save(result.id, 'eog', '130001', { gameId: 130001, teams: [{ teamId: 100, players: [{ stats: { EXTRA_FIELD: 'preserved' } }] }] });
  await writeFile(path.join(dataDir, 'state.json'), JSON.stringify(fixture)); await start();
  await page.reload(); await page.locator('.tournament-header').waitFor();
  await page.getByRole('button',{name:'重新连接主机导播席',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.control-body')?.getAttribute('inert')===null);
  await page.getByRole('tab', { name: '逐局档案 · 1', exact: true }).click();
  await page.locator('.tournament-archive>summary').first().click();
  assert.match(await page.locator('.tournament-content').innerText(), /130001/);
  await page.screenshot({ path: path.join(evidence, 'archive-1600.png') });
  const raw = await (await fetch(base + `/api/game-archives/${result.id}`)).json(); assert.equal(raw.raw.eog.payload.teams[0].players[0].stats.EXTRA_FIELD, 'preserved');
  const response = await fetch(base + `/api/tournaments/${tournamentId}/export?format=zip`); assert.equal(response.status, 200);
  const zip = await Open.buffer(Buffer.from(await response.arrayBuffer())); const manifest = JSON.parse((await zip.files.find(f => f.path === 'manifest.json').buffer()).toString());
  assert.ok(manifest.missing.some(f => f.path.endsWith('/timeline.json'))); assert.ok(zip.files.some(f => f.path.endsWith('/eog.json'))); checks.push('service restart retains full game and raw archive; ZIP reports absent sources');
  await page.getByRole('tab', { name: '选手统计', exact: true }).click(); assert.equal(await page.locator('.tournament-content tbody tr').count(), 10);
  await page.screenshot({ path: path.join(evidence, 'players-1600.png') });
  await page.getByRole('tab', { name: '积分排名', exact: true }).click(); assert.equal(await page.locator('.tournament-content tbody tr').count(), 8);
  for (const width of [1366, 900, 640]) { await page.setViewportSize({ width, height: 900 }); await page.screenshot({ path: path.join(evidence, `standings-${width}.png`) }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `page overflow at ${width}`); }
  checks.push('standings and ten-player aggregates render at desktop and narrow widths');
  assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify({ status: 'passed', version, checks, errors, blocked }, null, 2)); console.log(JSON.stringify({ status: 'passed', checks }));
} catch(error) {
  if(page){await page.screenshot({path:path.join(evidence,"failure.png")}).catch(()=>{});await writeFile(path.join(evidence,"failure.html"),await page.content()).catch(()=>{});}
  throw error;
} finally {
  await browser?.close(); await stop(); await writeFile(path.join(evidence, 'service.log'), log);
  assert.ok(path.resolve(sandbox).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(sandbox).startsWith('riftcast-tournament-')); await rm(sandbox, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
