const { createFixture: createSeed } = await tsImport('../server/test-support/fixture.ts', import.meta.url);
// Browser design evidence only. Starts an isolated offline HTTP service, never OBS or output devices.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { tsImport } from 'tsx/esm/api';
import sharp from 'sharp';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(process.env.RIFTCAST_CAPTURE_ROOT || repo);
const label = process.env.RIFTCAST_CAPTURE_LABEL || 'new';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Capture label must be a safe filename');
const evidence = path.resolve(repo, 'docs/evidence/frontend-design-round1');
const dir = await mkdtemp(path.join(tmpdir(), 'riftcast-design-'));
process.env.XDG_CACHE_HOME = path.join(dir, 'cache');
await mkdir(process.env.XDG_CACHE_HOME, { recursive: true });
const seed = createSeed(); seed.paused = true;
// Generated geometry is an explicitly synthetic file, not a window or a real participant.
await mkdir(path.join(dir, 'uploads'), { recursive: true });
await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#101b28"/><path d="M80 190H1840M80 920H1840" stroke="#364b60" stroke-width="2"/><rect x="80" y="96" width="12" height="58" fill="#70d7c2"/><text x="116" y="141" font-family="sans-serif" font-size="40" fill="#eff3f7">RiftCast / DESIGN FIXTURE</text><text x="84" y="985" font-family="sans-serif" font-size="25" fill="#adb8c7">1920 x 1080 / Synthetic composition</text></svg>')).png().toFile(path.join(dir, 'uploads/design-fixture.png'));
seed.assets = [{ id: 'design-fixture', name: '隔离测试背景.png', url: '/uploads/design-fixture.png', type: 'image/png', category: 'other', width: 1920, height: 1080, createdAt: new Date().toISOString() }];
seed.customScenes = [{ id: 'custom:design-checkpoint', name: '采访窗口 · 隔离构图', background: '#101b28', sources: [
  { id: 'background', name: '测试背景', kind: 'image', assetId: 'design-fixture', x: 0, y: 0, width: 1920, height: 1080, fit: 'contain', visible: true },
  { id: 'window', name: '测试窗口占位（非真实设备）', kind: 'window', window: 'design-fixture-window', x: 120, y: 230, width: 1200, height: 650, fit: 'contain', visible: true },
  { id: 'inset', name: '画中画测试素材', kind: 'image', assetId: 'design-fixture', x: 1370, y: 440, width: 430, height: 350, fit: 'cover', visible: true },
] }];
seed.production.program.customScenes = structuredClone(seed.customScenes);
await mkdir(evidence, { recursive: true });
await writeFile(path.join(dir, 'state.json'), JSON.stringify(seed));
const port = await new Promise((resolve, reject) => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const n = probe.address().port; probe.close(e => e ? reject(e) : resolve(n)); }); });
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: root, env: { ...process.env, PORT: String(port), ENABLE_LAN: '0', RIFTCAST_DATA_DIR: dir, RIFTCAST_AUTO_CONNECT: '0', RIFTCAST_OBS_AUTOSTART: '0', RIFTCAST_OFFLINE: '1' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
let browser;
const errors = [], shots = [], geometry = [], interactions = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
try {
  let ready = false;
  for (let n = 0; n < 80; n++) { try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch {} await delay(100); }
  if (!ready) throw new Error('Isolated service did not start');
  const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
  browser = await chromium.launch({ headless: true, executablePath: process.env.RIFTCAST_CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 736 }, locale: 'zh-CN' });
  await context.route('**/api/resources/asset?**', r => r.fulfill({ json: { data: {} } }));
  // Extra guard: this capture routine never configures or starts engine/device/stream actions.
  await context.route('**/api/obs/**', r => r.request().method() === 'GET' ? r.continue() : r.fulfill({ status: 403, json: { error: 'Design capture blocks engine mutations' } }));
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.locator('.app-shell').waitFor(); await delay(700);
  const snap = async name => { await page.screenshot({ path: path.join(evidence, `${label}-${name}.png`), fullPage: false }); shots.push(`${label}-${name}.png`); };
  await snap('studio-disconnected-1366x736');
  const layoutButtons = page.getByRole('button', { name: '查看场景排版', exact: true });
  const count = await layoutButtons.count();
  for (let i = 0; i < count; i++) await layoutButtons.first().click();
  await page.evaluate(() => { document.querySelectorAll('.control-page,.main-content,main').forEach(e => e.scrollTop = 0); window.scrollTo(0, 0); });
  await delay(400); await snap('studio-layout-1366x736');
  for (const [width, height] of [[1440, 900], [1920, 1080]]) { await page.setViewportSize({ width, height }); await delay(250); await snap(`studio-layout-${width}x${height}`); }
  await page.setViewportSize({ width: 1366, height: 736 });
  geometry.push(await page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight }, windows: [...document.querySelectorAll('.monitor-surface')].map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, ratio: r.width / r.height }; }), take: [...document.querySelectorAll('.take-button')].filter(e => e.checkVisibility()).map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, bottom: r.bottom }; }), bodyScroll: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } })));
  if (label !== 'main' && process.env.RIFTCAST_CAPTURE_CORE_ONLY !== '1') {
    await page.getByRole('button', { name: '切换浅色主题' }).click(); await delay(200); await snap('studio-light-1366x736');
    await page.getByRole('button', { name: '切换深色主题' }).click();
    await page.getByRole('button', { name: '新建场景', exact: true }).click(); await page.locator('dialog[open]').waitFor(); await delay(200); await snap('editor-empty-1366x736');
    await page.keyboard.press('Escape'); await delay(100);
    await page.getByRole('tab', { name: '自定义', exact: true }).click();
    await page.getByRole('button', { name: '编辑 采访窗口 · 隔离构图', exact: true }).click();
    await page.locator('dialog[open]').waitFor(); await delay(250); await snap('editor-composition-1366x736');
    await page.getByRole('button', { name: '添加来源', exact: true }).click(); await delay(100); await snap('editor-sources-1366x736');
    await page.getByRole('button', { name: '返回画布', exact: true }).click();
    const position = async () => Object.fromEntries(await Promise.all(['横向位置','纵向位置','宽度','高度'].map(async name => [name, Number(await page.getByRole('spinbutton', { name, exact: true }).inputValue())])));
    const before = await position();
    const artboard = await page.locator('.custom-edit-canvas').boundingBox();
    const selection = await page.locator('.custom-canvas-selection').boundingBox();
    await page.mouse.move(selection.x + selection.width / 2, selection.y + selection.height / 2);
    await page.mouse.down(); await page.mouse.move(selection.x + selection.width / 2 + 20, selection.y + selection.height / 2 + 12, { steps: 5 }); await page.mouse.up();
    await delay(100); const afterDrag = await position();
    await page.locator('.custom-edit-canvas').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
    await delay(100); const afterKeys = await position();
    const handle = await page.getByRole('button', { name: '右下缩放图层', exact: true }).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 16, handle.y + handle.height / 2 + 8, { steps: 5 }); await page.mouse.up();
    await delay(100);
    interactions.push({ kind: 'local canvas design smoke only', artboard, before, dragCssPixels: [20,12], afterDrag, keys: ['ArrowRight','Shift+ArrowDown'], afterKeys, resizeCssPixels: [16,8], afterResize: await position(), saved: false, take: false });
    await snap('editor-local-manipulation-1366x736');
    await page.keyboard.press('Escape'); await delay(100);
    await page.getByRole('button', { name: '放弃修改', exact: true }).click();
    // These routes display actual offline facts; no driver/setup/output button is clicked.
    await page.getByRole('button', { name: '连接与输出', exact: true }).click(); await delay(400);
    await page.getByRole('button', { name: '抖音直播伴侣', exact: true }).click(); await delay(100); await snap('output-offline-1366x736');
    await page.getByRole('button', { name: 'RTMP 推流', exact: true }).click(); await delay(100); await snap('output-rtmp-1366x736');
    await page.getByRole('button', { name: 'BP 与阵容', exact: true }).click(); await delay(300); await snap('bp-1366x736');
    await page.locator('.bp-pick-row').first().click(); await page.locator('dialog.bp-champion-dialog[open]').waitFor(); await delay(100); await snap('bp-hero-picker-1366x736'); await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base + '/remote'); await page.locator('.remote-workbench').waitFor(); await delay(300); await snap('remote-390x844');
  }
  const files = [];
  async function walk(directory) { for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) { const name = path.join(directory, entry.name); if (entry.isDirectory()) await walk(name); else if (entry.isFile()) files.push(name); } }
  for (const directory of ['src','shared','server']) await walk(directory);
  files.push('package.json','package-lock.json'); files.sort();
  const hashes = {};
  for (const name of files) hashes[name] = createHash('sha256').update(await readFile(path.join(root, name))).digest('hex');
  await writeFile(path.join(evidence, `${label}-capture.json`), JSON.stringify({ label, environment: 'Linux / system Chromium / isolated offline HTTP / synthetic seed', sourceRoot: root, viewportTitlebarNote: '1366x736 approximates a 32px Windows titlebar; not a Windows or DPI test', screenshots: shots, errors, geometry, interactions, sourceSha256: hashes, obs: 'not started', output: 'not started' }, null, 2));
  console.log(JSON.stringify({ label, shots, errors, geometry, interactions, dataDir: dir }));
} finally {
  if (browser) await browser.close();
  child.kill('SIGTERM');
  await Promise.race([new Promise(r => child.once('exit', r)), delay(2000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
