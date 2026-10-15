// Independent Windows acceptance. Product source is never edited by this harness.
// Synthetic adapters block physical OBS, capture devices, drivers and platform output.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const root = process.env.SOL_QA_ROOT || 'E:\\codexdata\\lolob-release-20261014';
export const evidence = path.dirname(fileURLToPath(import.meta.url));
export const source = 'e3828b807774af2ee7ae9af18f383c8fb8b66f12';
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), source);
const require = createRequire(path.join(root, 'package.json'));
export const sharp = require('sharp');
export const { tsImport } = await import(pathToFileURL(require.resolve('tsx/esm/api')).href);
export const { createSeed } = await tsImport(path.join(root, 'server/state.ts'), import.meta.url);
export const { captureProgram, programState } = await tsImport(path.join(root, 'shared/production.ts'), import.meta.url);
const playwright = process.env.RIFTCAST_PLAYWRIGHT_MODULE || 'C:\\Users\\Administrator\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright\\index.mjs';
export const { chromium } = await import(pathToFileURL(playwright).href);
export const browserOptions = { headless: true, executablePath: process.env.RIFTCAST_CHROMIUM_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' };
export const delay = ms => new Promise(r => setTimeout(r, ms));
export async function until(fn, label, timeout = 12000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await delay(80); } throw Error(label); }
const freePort = async () => { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r)); return port; };
export async function manifest(name) {
  const tracked = execFileSync('git', ['ls-files', '-z', 'src', 'shared', 'server', 'scripts', 'electron', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'electron-builder.cjs'], { cwd: root }).toString().split('\0').filter(Boolean);
  const hashes = {}; for (const file of tracked) hashes[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
  const report = { source, platform: process.platform, arch: process.arch, node: process.version, files: hashes, dirty: execFileSync('git', ['status', '--short', '--', 'src', 'shared', 'server', 'scripts', 'electron', 'package.json', 'package-lock.json'], { cwd: root, encoding: 'utf8' }).trim() };
  assert.equal(report.dirty, ''); await writeFile(path.join(evidence, name + '.json'), JSON.stringify(report, null, 2)); return report;
}
export async function start(name, seed) {
  const folder = path.join(root, 'verification-output', 'sol-e3828b8-windows'); await mkdir(folder, { recursive: true });
  const work = await mkdtemp(path.join(folder, name + '-'));
  const data = path.join(work, 'data'); await mkdir(path.join(data, 'uploads'), { recursive: true });
  await writeFile(path.join(data, 'state.json'), JSON.stringify(seed));
  const hook = path.join(work, 'physical-block.mjs');
  await writeFile(hook, `import { Adapters } from ${JSON.stringify(pathToFileURL(path.join(root, 'server/adapters.ts')).href)};
Adapters.prototype.initializeObsEngine=async function(){this.commit(s=>{s.paused=true;s.connections.obs={status:'connected',detail:'SOL SYNTHETIC ACCEPTANCE; no physical OBS'};});process.on('message',m=>{if(m?.type==='sol-patch'){this.commit(s=>{Object.assign(s,m.fields||{});});process.send?.({type:'sol-patch-ack',id:m.id});}});};
Adapters.prototype.productionApply=async()=>{};Adapters.prototype.syncPlayerFeeds=async()=>({applied:false});
Adapters.prototype.customSourceChoices=async()=>({windows:[{name:'SOL Synthetic Window',value:'sol-fixture:window:never-capture.exe'}],inputs:[{name:'SOL Synthetic Shared Input',kind:'image_source'}]});
for(const method of ['obsEngineStart','obsEngineOutput','obsEngineSetup','obsEnginePrepareCompanion','obsEngineInstallVirtualCamera','obsEngineMonitor','obsEngineLiveFrame','obsMusicImport','obsMusicControl','obsConnect'])Adapters.prototype[method]=async()=>{throw Error('SOL physical integration is unauthorized');};`);
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', '--import', pathToFileURL(hook).href, 'server/index.ts'], { cwd: root, windowsHide: true, env: { ...process.env, PORT: String(port), ENABLE_LAN: '0', RIFTCAST_DATA_DIR: data, RIFTCAST_AUTO_CONNECT: '0', RIFTCAST_OBS_AUTOSTART: '0', RIFTCAST_OFFLINE: '1', RIFTCAST_OBS_MODE: 'external' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let log = ''; child.stdout.on('data', b => { log += b; }); child.stderr.on('data', b => { log += b; });
  const service = { child, base, work, data, port, log: () => log };
  await until(async () => { if (child.exitCode !== null) throw Error('Isolated service exited: ' + log); try { return (await fetch(base + '/api/health')).ok; } catch { return false; } }, 'isolated service ready');
  return service;
}
export const read = service => fetch(service.base + '/api/state').then(r => r.json());
export async function post(service, route, body, token) {
  const r = await fetch(service.base + route, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-seat-token': token } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  return { status: r.status, data: await r.json() };
}
export async function action(service, body, token) { const s = await read(service); const reply = await post(service, '/api/action', { ...body, expectedConfigVersion: s.production.configVersion, requestId: randomUUID() }, token); assert.equal(reply.status, 200, reply.data.error); return reply.data; }
export async function patch(service, fields) { const id = randomUUID(); await new Promise((resolve, reject) => { const timer = setTimeout(() => { service.child.off('message', listener); reject(Error('Fixture patch acknowledgement')); }, 5000); const listener = m => { if (m?.type === 'sol-patch-ack' && m.id === id) { clearTimeout(timer); service.child.off('message', listener); resolve(); } }; service.child.on('message', listener); service.child.send({ type: 'sol-patch', fields, id }); }); }
export async function stop(service) { if (!service) return; if (service.child.exitCode === null) { const end = new Promise(r => service.child.once('exit', r)); service.child.send({ type: 'riftcast-shutdown' }); await Promise.race([end, delay(2500)]); if (service.child.exitCode === null) { service.child.kill(); await Promise.race([end, delay(1000)]); } } await writeFile(path.join(service.work, 'service-log.txt'), service.log()); }
export async function safeContext(browser, service, token, viewport = { width: 1600, height: 1000 }) {
  const context = await browser.newContext({ viewport, locale: 'zh-CN' });
  await context.addInitScript(t => { if (t && location.protocol === 'http:') sessionStorage.setItem('riftcast-seat-token', t); const W = window.WebSocket; window.solSockets = []; window.WebSocket = class extends W { constructor(...args) { super(...args); window.solSockets.push(this); } }; }, token);
  await context.route('**/*', route => { const req = route.request(), u = new URL(req.url()); if (u.origin !== service.base) return route.abort(); if (req.method() !== 'GET' && (u.pathname.startsWith('/api/obs/') || u.pathname === '/api/connect' || u.pathname.startsWith('/api/economy/'))) return route.fulfill({ status: 403, json: { error: 'SOL blocks physical device operations' } }); return route.continue(); });
  return context;
}
