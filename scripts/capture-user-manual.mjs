const { createFixture: createSeed } = await tsImport('../server/test-support/fixture.ts', import.meta.url);
// Capture the real 1.0.2 web UI using disposable demo data, with native writes blocked.
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { isolatedNativeEnvironment } from './verify-native-safety.mjs';

const modulePath = process.env.RIFTCAST_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const { reportFixture } = await import('./report-093-fixture.mjs');
const out = path.resolve('docs/user-manual-1.0.2/images');
const evidence = path.resolve('verification-output/user-manual-1.0.2');
await mkdir(out, { recursive: true }); await mkdir(evidence, { recursive: true });
const sandbox = await mkdtemp(path.join(os.tmpdir(), 'riftcast-manual-'));
const listener = createServer();
await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const base = `http://127.0.0.1:${port}`;
let child, browser;
const errors = [], captures = [];
async function launch(seed) {
  await writeFile(path.join(sandbox, 'state.json'), JSON.stringify(seed));
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    windowsHide: true,
    env: { ...await isolatedNativeEnvironment(sandbox), PORT: String(port), RIFTCAST_DATA_DIR: sandbox, RIFTCAST_OBS_AUTOSTART: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; child.stdout.on('data', b => log += b); child.stderr.on('data', b => log += b);
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
    if (child.exitCode !== null) throw new Error(log);
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Manual capture service failed: ' + log);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}
try {
  const seed = createSeed(); seed.paused = true;
  seed.previewScene = 'lineup'; seed.programScene = 'standby';
  await launch(seed);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN', deviceScaleFactor: 1 });
  // UI reading and isolated document edits only. Never issue native write operations.
  await context.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (!['GET', 'HEAD'].includes(req.method()) && /^\/api\/(obs|economy|replay|connect)/.test(url.pathname)) {
      return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: '手册截图环境未启动真实设备' }) });
    }
    await route.continue();
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.waitForFunction(() => !!sessionStorage.getItem('riftcast-seat-token'));
  const shot = async (name, locator) => {
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(600);
    await (locator ?? page).screenshot({ path: path.join(out, `${name}.png`), animations: 'disabled' });
    await writeFile(path.join(evidence, `${name}.txt`), await page.locator('body').innerText());
    captures.push(name); console.log('Captured', name);
  };
  const nav = async name => { await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).click(); await page.waitForTimeout(400); };
  const tab = async name => { await page.getByRole('tab', { name: new RegExp('^' + name + '(?: ·|$)') }).click({ timeout: 8000 }); };
  await shot('01-studio');
  await page.getByRole('button', { name: '风格包', exact: true }).click();
  await page.getByRole('dialog').locator('.style-pack-choice').nth(4).waitFor();
  await shot('02-style-packs', page.getByRole('dialog'));
  await page.locator('.style-pack-choice').filter({ hasText: '曜金典藏' }).click();
  await page.getByRole('button', { name: '删除风格包', exact: true }).click();
  await shot('03-style-delete', page.locator('.style-pack-delete'));
  await page.getByRole('button', { name: '取消删除', exact: true }).click();
  await page.getByRole('button', { name: '关闭风格包', exact: true }).click();
  await page.getByRole('button', { name: '新建场景', exact: true }).click();
  await shot('04-custom-scene', page.getByRole('dialog'));
  await page.keyboard.press('Escape');
  await nav('赛事与素材'); await shot('05-schedule');
  console.log('Manage tabs', await page.getByRole('tab').allTextContents());
  await tab('战队与选手');
  await page.getByRole('button', { name: '编辑战队资料', exact: true }).click();
  await shot('06-teams');
  await tab('图片素材'); await shot('07-assets');
  await tab('比赛记录'); await shot('08-records');
  await nav('BP 与阵容'); await shot('09-draft');
  await nav('实时数据'); await shot('10-data');
  await tab('来源与校准'); await shot('11-data-health');
  await nav('连接与输出');
  console.log('Settings tabs', await page.getByRole('tab').allTextContents());
  for (const [label, name] of [['数据连接','12-connections'],['画面','13-video'],['声音','14-audio'],['输出','15-output'],['节目包装','16-graphics'],['诊断','17-diagnostics'],['协作','18-collaboration'],['工作台外观','19-appearance']]) {
    await tab(label); await shot(name);
  }
  await nav('赛后收尾'); await shot('20-wrap');
  await nav('使用指南'); await page.getByRole('button', { name: '当前快捷键', exact: true }).click(); await shot('21-help');
  const overlay = await context.newPage(); await overlay.setViewportSize({ width: 1920, height: 1080 });
  await overlay.goto(base + '/overlay?preview=1');
  // Set preview scene through the normal isolated service, without publishing to OBS.
  for (const scene of ['lineup','draft','live','gold-ranking','economy']) {
    await page.evaluate(async scene => {
      const s = await fetch('/api/state').then(r => r.json());
      const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-seat-token': sessionStorage.getItem('riftcast-seat-token') }, body: JSON.stringify({ type: 'preview-scene', scene, expectedConfigVersion: s.production.configVersion, requestId: crypto.randomUUID() }) });
      if (!r.ok) throw new Error(await r.text());
    }, scene);
    await overlay.waitForTimeout(800); await overlay.screenshot({ path: path.join(out, `scene-${scene}.png`), animations: 'disabled' }); captures.push(`scene-${scene}`);
  }
  await context.close(); await stop();
  const report = reportFixture(); await launch(report);
  const reportPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await reportPage.goto(base + '/overlay?preview=1'); await reportPage.waitForTimeout(1200);
  await reportPage.screenshot({ path: path.join(out, 'scene-postgame-1.png'), animations: 'disabled' }); captures.push('scene-postgame-1');
  await reportPage.close(); await stop();
  report.overlay.postgamePage = 2; await launch(report);
  const reportPage2 = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await reportPage2.goto(base + '/overlay?preview=1'); await reportPage2.waitForTimeout(1000);
  await reportPage2.screenshot({ path: path.join(out, 'scene-postgame-2.png'), animations: 'disabled' }); captures.push('scene-postgame-2');
  await writeFile(path.join(evidence, 'capture.json'), JSON.stringify({ version: JSON.parse(await readFile('package.json')).version, sandbox, captures, errors, source: 'Real built web UI; demo and synthetic postgame data; no OBS or platform output' }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser?.close(); await stop(); }
