const { createFixture: createSeed } = await tsImport('../server/test-support/fixture.ts', import.meta.url);
// Focused browser regressions for the independent 35893d9 findings.
// Real isolated HTTP + renderer; only the notification case uses a labelled engine stub.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--short', '--', 'src', 'shared', 'server', 'scripts', 'package.json'], { cwd: root, encoding: 'utf8' }).trim();
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (process.env.RIFTCAST_EXPECT_SOURCE) {
  assert.equal(source, process.env.RIFTCAST_EXPECT_SOURCE);
  assert.equal(dirty, '', 'acceptance must run against a clean implementation SHA');
}
const evidence = path.join(root, 'verification-output', `frontend-safety-${source.slice(0, 7)}`);
await mkdir(evidence, { recursive: true });
const work = await mkdtemp(path.join(tmpdir(), 'riftcast-frontend-safety-'));
const { captureProgram } = await tsImport('../shared/production.ts', import.meta.url);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [], errors = [], services = [], requests = [];
let browser;

async function until(check, label) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await delay(100); }
  throw new Error(label);
}
async function freePort() {
  const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve)); return port;
}
async function start({ previous, mock = false } = {}) {
  const dir = previous?.dir || await mkdtemp(path.join(work, mock ? 'synthetic-' : 'http-'));
  if (!previous) {
    const seed = createSeed(); seed.paused = true; seed.phase = 'draft'; seed.overlay.nativeHud = 'off';
    seed.programScene = seed.previewScene = 'draft'; seed.production.rules.mode = 'standard';
    seed.production.program = captureProgram(seed);
    await writeFile(path.join(dir, 'state.json'), JSON.stringify(seed));
  }
  const port = previous?.port || await freePort(), base = `http://127.0.0.1:${port}`;
  const hook = path.join(work, 'synthetic-engine.mjs');
  if (mock) await writeFile(hook, `import { Adapters } from ${JSON.stringify(pathToFileURL(path.join(root, 'server/adapters.ts')).href)};
Adapters.prototype.initializeObsEngine = async function(){this.commit(s=>{s.paused=true;s.connections.obs={status:'connected',detail:'SYNTHETIC ONLY — no OBS instance'};});};
Adapters.prototype.syncPlayerFeeds = async()=>({applied:false});
for(const method of ['productionApply','obsEngineStart','obsEngineOutput','obsEngineSetup','obsEnginePrepareCompanion','obsEngineInstallVirtualCamera','obsEngineMonitor','obsEngineLiveFrame','obsMusicImport','obsMusicControl'])Adapters.prototype[method]=async()=>{throw Error('Safety fixture forbids physical OBS/device actions');};
`);
  const child = spawn(process.execPath, ['--import', 'tsx', ...(mock ? ['--import', pathToFileURL(hook).href] : []), 'server/index.ts'], {
    cwd: root, windowsHide: true, env: { ...process.env, PORT: String(port), ENABLE_LAN: '0', RIFTCAST_DATA_DIR: dir,
      RIFTCAST_AUTO_CONNECT: '0', RIFTCAST_OBS_AUTOSTART: '0', RIFTCAST_OFFLINE: '1', RIFTCAST_OBS_MODE: 'external' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let log = ''; child.stdout.on('data', b => { log += b; }); child.stderr.on('data', b => { log += b; });
  const service = { child, dir, port, base, mock }; services.push(service);
  await until(async () => {
    if (child.exitCode !== null) throw new Error(`Isolated service exited: ${log}`);
    try { const health = await fetch(base + '/api/health').then(r => r.json()); return health.status === 'ok' && health.version === version; } catch { return false; }
  }, 'Actual isolated HTTP startup failed');
  console.log(`READY ${source}: ${base}, ${mock ? 'labelled synthetic engine' : 'pure HTTP; no OBS'}`);
  return service;
}
async function stop(service) {
  if (service.child.exitCode !== null) return;
  const exited = new Promise(resolve => service.child.once('exit', resolve));
  service.child.send({ type: 'riftcast-shutdown' });
  await Promise.race([exited, delay(4000)]);
  if (service.child.exitCode === null) { service.child.kill('SIGTERM'); await Promise.race([exited, delay(1000)]); }
}
const state = service => fetch(service.base + '/api/state').then(r => r.json());
async function post(service, route, body, token) {
  const r = await fetch(service.base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Seat-Token': token } : {}) }, body: JSON.stringify(body) });
  const data = await r.json(); assert.equal(r.status, 200, data.error); return data;
}
async function action(service, body, token) {
  return post(service, '/api/action', { ...body, expectedConfigVersion: (await state(service)).production.configVersion, requestId: crypto.randomUUID() }, token);
}
async function context(service, viewport = { width: 1366, height: 736 }) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-CN' });
  await ctx.addInitScript(() => {
    const Original = window.WebSocket; window.__safetySockets = [];
    window.WebSocket = class extends Original { constructor(...args) { super(...args); window.__safetySockets.push(this); } };
  });
  await ctx.route('**/*', route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== service.base) return route.abort();
    if (req.method() !== 'GET' && (url.pathname.startsWith('/api/obs/') || url.pathname === '/api/connect')) return route.fulfill({ status: 403, json: { error: 'Safety test blocks actual device/source actions' } });
    return route.continue();
  });
  ctx.on('page', page => {
    page.setDefaultTimeout(7000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', req => {
      if (req.method() !== 'POST') return;
      const url = new URL(req.url());
      const body = req.postDataJSON();
      requests.push({ path: url.pathname, type: body?.type, op: body?.command?.op, fresh: body?.fresh === true });
    });
  });
  return ctx;
}
async function check(id, page, fn) {
  try { const detail = await fn(); results.push({ id, passed: true, detail }); console.log('PASS ' + id); }
  catch (e) { results.push({ id, passed: false, error: e.message }); console.error('FAIL ' + id + ': ' + e.message); process.exitCode = 1; }
  await page.screenshot({ path: path.join(evidence, id + '.png') });
}
async function ready(page) {
  await page.locator('.app-shell,.remote-workbench').waitFor();
  await until(async () => !await page.locator('.seat-recovery').count(), 'Seat must be verified before exercising controls');
}

try {
  const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
  browser = await chromium.launch({ headless: true, ...(process.env.RIFTCAST_CHROMIUM_PATH ? { executablePath: process.env.RIFTCAST_CHROMIUM_PATH } : {}) });
  const service = await start(), ctx = await context(service), page = await ctx.newPage();
  await page.goto(service.base + '/#draft'); await ready(page);
  const owner = await page.evaluate(() => sessionStorage.getItem('riftcast-seat-token'));
  const program = await ctx.newPage(); await program.setViewportSize({ width: 1920, height: 1080 });
  await program.goto(service.base + '/overlay'); await program.locator('.cast-draft-card').first().waitFor();
  for (const search of ['', 'Akali']) await check(`escape-${search ? 'nonempty' : 'empty'}`, page, async () => {
    const count = requests.filter(r => r.type === 'take').length;
    await page.locator('.bp-pick-row').first().click();
    await page.getByRole('searchbox', { name: '搜索英雄', exact: true }).fill(search);
    await page.keyboard.press('Escape');
    await page.locator('dialog.bp-champion-dialog[open]').waitFor({ state: 'hidden' });
    assert.ok(await page.locator('.bp-pick-row').first().evaluate(el => document.activeElement === el));
    assert.equal(requests.filter(r => r.type === 'take').length, count);
  });
  await check('bp-save-only-keeps-rendered-program', program, async () => {
    const before = await state(service), visible = await program.locator('.cast-draft-champion').allTextContents();
    const takes = requests.filter(r => r.type === 'take').length;
    await page.locator('.bp-pick-row').first().click();
    await page.getByRole('searchbox', { name: '搜索英雄', exact: true }).fill('Akali');
    await page.locator('.bp-candidate').first().click();
    await page.getByRole('button', { name: '保存此槽位到待播', exact: true }).click();
    await page.locator('dialog.bp-champion-dialog[open]').waitFor({ state: 'hidden' });
    await delay(250);
    const next = await state(service); assert.equal(next.draft.bluePicks[0], 'Akali');
    assert.deepEqual(next.production.program, before.production.program);
    assert.deepEqual(await program.locator('.cast-draft-champion').allTextContents(), visible);
    assert.equal(requests.filter(r => r.type === 'take').length, takes);
  });
  await check('bp-explicit-same-scene-take-publishes', program, async () => {
    const next = await action(service, { type: 'take', scene: 'draft' }, owner);
    assert.equal(next.production.application.status, 'requested', 'offline API acceptance must never claim OBS success');
    await until(async () => (await program.locator('.cast-draft-champion').allTextContents())[0].includes('离群之刺'), 'explicit re-TAKE did not publish Akali');
    assert.equal(next.programScene, 'draft');
  });
  const invite = await post(service, '/api/control/invite', { name: '安全回归字幕席', role: 'subtitle' }, owner);
  const remoteContext = await context(service, { width: 390, height: 844 }), remote = await remoteContext.newPage();
  await remote.goto(service.base + '/remote?seat=' + encodeURIComponent(invite.token)); await ready(remote);
  const field = remote.getByRole('textbox', { name: '待播字幕', exact: true });
  await field.fill('重连后仍保留的未保存字幕');
  await field.evaluate(el => { window.__draftElement = el; });
  await check('transport-reconnect-validates-before-enabling', remote, async () => {
    const releases = [];
    const handler = async route => {
      const response = await route.fetch();
      await new Promise(resolve => { releases.push(resolve); });
      await route.fulfill({ response });
    };
    await remote.route('**/api/control/seat', handler);
    const disconnect = () => remote.evaluate(() => window.__safetySockets.find(s => new URL(s.url).pathname === '/ws' && s.readyState === WebSocket.OPEN).close());
    try {
      await disconnect();
      await until(() => releases.length === 1, 'reconnect did not perform a read-only seat check');
      assert.ok(await remote.getByRole('button', { name: '保存到待播', exact: true }).isDisabled());
      assert.equal(await field.inputValue(), '重连后仍保留的未保存字幕');
      await disconnect();
      await until(() => releases.length === 2, 'second connection did not start a fresh verification');
      releases[0](); await delay(200);
      assert.ok(await remote.getByRole('button', { name: '保存到待播', exact: true }).isDisabled(), 'late verification from a closed transport cannot enable submissions');
      releases[1](); await ready(remote);
      assert.ok(await remote.getByRole('button', { name: '保存到待播', exact: true }).isEnabled());
    } finally { releases.forEach(release => release()); await remote.unroute('**/api/control/seat', handler); }
  });
  let restarted;
  await check('restart-rejects-old-seat-without-submission', remote, async () => {
    const before = await state(service), count = requests.length;
    await stop(service); restarted = await start({ previous: service });
    await remote.getByRole('region', { name: '恢复操作席位' }).getByText('操作席位需要重新验证', { exact: true }).waitFor();
    assert.ok(await remote.getByRole('button', { name: '保存到待播', exact: true }).isDisabled());
    assert.equal(await field.inputValue(), '重连后仍保留的未保存字幕');
    assert.ok(await field.evaluate(el => window.__draftElement === el), 'draft task must stay mounted');
    assert.deepEqual((await state(restarted)).production.program, before.production.program);
    await page.keyboard.press('Control+Enter'); await page.keyboard.press('Control+Shift+P');
    assert.equal(requests.slice(count).filter(r => r.path === '/api/action' || r.path === '/api/control/seat').length, 0, 'resume cannot create a replacement identity or send a write');
    assert.equal(requests.slice(count).filter(r => r.path.startsWith('/api/obs/')).length, 0, 'unverified hotkeys cannot call direct OBS actions');
  });
  if (restarted) await check('explicit-recovery-keeps-draft-and-does-not-take', remote, async () => {
    const before = await state(restarted), takes = requests.filter(r => r.type === 'take').length;
    await page.getByRole('button', { name: '重新连接主机导播席', exact: true }).click(); await ready(page);
    const freshOwner = await page.evaluate(() => sessionStorage.getItem('riftcast-seat-token'));
    const freshInvite = await post(restarted, '/api/control/invite', { name: '重新邀请的字幕席', role: 'subtitle' }, freshOwner);
    await remote.getByLabel('新席位邀请链接', { exact: true }).fill(service.base + '/remote?seat=' + encodeURIComponent(freshInvite.token));
    await remote.getByRole('button', { name: '使用新邀请恢复', exact: true }).click(); await ready(remote);
    assert.ok(await remote.getByRole('button', { name: '保存到待播', exact: true }).isEnabled());
    assert.equal(await field.inputValue(), '重连后仍保留的未保存字幕');
    assert.ok(await field.evaluate(el => window.__draftElement === el));
    assert.equal(requests.filter(r => r.type === 'take').length, takes);
    assert.deepEqual((await state(restarted)).production.program, before.production.program);
    await remote.getByRole('button', { name: '保存到待播', exact: true }).click();
    await until(async () => (await state(restarted)).overlay.tickerText === '重连后仍保留的未保存字幕', 'fresh verified seat could not save');
    assert.deepEqual((await state(restarted)).production.program, before.production.program);
  });

  const mocked = await start({ mock: true }), toastContext = await context(mocked), toastPage = await toastContext.newPage();
  const message = '合成恢复错误：CABLE Input / CABLE Output 路由恢复尚未完成，请核对音轨、监听、麦克风和端点。'.repeat(12);
  const engine = { mode: 'embedded', available: true, running: true, connected: true, version: 'SYNTHETIC', streamActive: false, recordActive: false, virtualCamActive: true, destination: 'douyin', inputs: [],
    selection: { gameWindow: 'synthetic', desktopDevice: 'synthetic', micDevice: 'synthetic', micEnabled: true, outputFps: 60 },
    virtualCamera: { supported: true, driver: { available: true, installed: true }, requiresRestart: false },
    companionAudio: { supported: true, available: true, installed: true, ready: true, active: true, managing: true, sampleRate: 48000, channels: 2, track: 1 } };
  await toastContext.route('**/api/obs/**', route => {
    const req = route.request(), pathname = new URL(req.url()).pathname;
    if (req.method() === 'GET' && pathname === '/api/obs/engine') return route.fulfill({ json: engine });
    if (req.method() === 'GET' && pathname === '/api/obs/production') return route.fulfill({ json: { audio: [], disk: { detail: '合成状态' }, bufferActive: false, music: { available: false } } });
    if (req.method() === 'POST' && pathname === '/api/obs/engine/output' && req.postDataJSON().action === 'stop-virtual-camera') {
      engine.virtualCamActive = false; engine.companionAudio.active = false; engine.companionAudio.error = message;
      return route.fulfill({ json: engine });
    }
    return route.fulfill({ status: 403, json: { error: 'Synthetic fixture blocks physical device actions' } });
  });
  await toastPage.goto(mocked.base + '/#settings'); await ready(toastPage);
  await toastPage.evaluate(() => {
    const badge = document.createElement('div'); badge.textContent = '合成引擎 / 设备桩 · 非真实音画';
    badge.style.cssText = 'position:fixed;top:1px;right:1px;background:#ffe69c;color:#111;font:11px sans-serif;z-index:10000;pointer-events:none'; document.body.append(badge);
  });
  const stopButton = toastPage.getByRole('button', { name: '按住停止伴侣音画', exact: true });
  const rect = await stopButton.boundingBox(); assert.ok(rect);
  await toastPage.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await toastPage.mouse.down(); await delay(1150); await toastPage.mouse.up();
  await toastPage.locator('.toast.notice-error').waitFor();
  for (const theme of ['dark', 'light']) {
    if (await toastPage.evaluate(() => document.documentElement.dataset.uiTheme) !== theme) await toastPage.locator('.control-theme').click();
    for (const [width, height] of [[1366, 736], [1366, 768], [1440, 868], [1920, 1048]]) await check(`toast-take-hit-${theme}-${width}x${height}`, toastPage, async () => {
      await toastPage.setViewportSize({ width, height });
      const observation = await toastPage.evaluate(() => {
        const take = document.querySelector('.broadcast-status .take-button'), toast = document.querySelector('.toast.notice-error'), footer = document.querySelector('.broadcast-status');
        const t = take.getBoundingClientRect(), n = toast.getBoundingClientRect(), f = footer.getBoundingClientRect();
        const points = [[t.left + 2, t.top + 2], [t.right - 2, t.top + 2], [t.left + 2, t.bottom - 2], [t.right - 2, t.bottom - 2], [t.x + t.width / 2, t.y + t.height / 2]];
        return { enabled: !take.disabled, footerTop: f.top, toastBottom: n.bottom, bottom: t.bottom,
          hits: points.map(([x, y]) => take.contains(document.elementFromPoint(x, y))),
          text: toast.querySelector('span').textContent, scrollable: toast.scrollHeight > toast.clientHeight };
      });
      assert.ok(observation.enabled); assert.ok(observation.hits.every(Boolean)); assert.ok(observation.bottom <= height);
      assert.ok(observation.toastBottom < observation.footerTop); assert.equal(observation.text, message); assert.ok(observation.scrollable);
      const { text, ...geometry } = observation; return geometry;
    });
  }
  assert.deepEqual(errors, [], 'browser exceptions must remain zero');
} catch (e) { results.push({ id: 'harness', passed: false, error: e.stack }); console.error(e.stack); process.exitCode = 1; }
finally {
  await browser?.close(); for (const service of services) await stop(service);
  await writeFile(path.join(evidence, 'result.json'), JSON.stringify({ source, dirty, version, work, results, errors,
    services: services.map(({ base, dir, mock }) => ({ base, dir, mock })),
    limits: 'Linux/browser geometry if run on Linux. No real OBS, stream, devices, Windows/native window or audience acceptance.' }, null, 2));
  console.log(JSON.stringify({ source, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, errors: errors.length, evidence }));
}
