// Capture the built application with isolated data and without native device access.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { tsImport } from 'tsx/esm/api';
import { browserExecutable } from './browser-executable.mjs';
import { isolatedNativeEnvironment, nativeRequestGuard } from './verify-native-safety.mjs';
import { createSyntheticAdaptersHook } from './ui-测试辅助.mjs';

const version = '2.0.0';
const out = path.resolve('docs', `user-manual-${version}`, 'images');
const evidence = path.resolve('verification-output', `user-manual-${version}`);
const modulePath = process.env.RIFTCAST_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const { createFixture } = await tsImport('../server/test-support/fixture.ts', import.meta.url);
const { captureProgram } = await tsImport('../shared/production.ts', import.meta.url);
const { BUILTIN_RUNTIME_STYLES } = await tsImport('../shared/style-packs.ts', import.meta.url);
const signature = BUILTIN_RUNTIME_STYLES.find(pack => pack.id === 'rift-signature');
assert.ok(signature);

await Promise.all([mkdir(out, { recursive: true }), mkdir(evidence, { recursive: true })]);
const sandbox = await mkdtemp(path.join(tmpdir(), 'riftcast-manual-200-'));
const ports = createServer().listen(0, '127.0.0.1');
await once(ports, 'listening');
const { port } = ports.address();
await new Promise(resolve => ports.close(resolve));
const base = `http://127.0.0.1:${port}`;
const errors = [], blocked = [], captures = [];
let browser, service;

async function start(seed, name, withTelemetry = false) {
  const data = path.join(sandbox, name);
  await mkdir(data);
  await writeFile(path.join(data, 'state.json'), JSON.stringify(seed));
  const fixture = withTelemetry
    ? await createSyntheticAdaptersHook({ root: process.cwd(), work: sandbox, dataDir: data, fixture: seed })
    : undefined;
  service = spawn(process.execPath, ['--import', 'tsx', ...(fixture?.importArgs ?? []), 'server/index.ts'], {
    windowsHide: true,
    env: {
      ...await isolatedNativeEnvironment(sandbox),
      ...fixture?.env,
      PORT: String(port),
      RIFTCAST_DATA_DIR: data,
      RIFTCAST_OBS_AUTOSTART: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let log = '';
  service.stdout.on('data', bytes => log += bytes);
  service.stderr.on('data', bytes => log += bytes);
  for (let attempt = 0; attempt < 120; attempt++) {
    const health = await fetch(`${base}/api/health`).catch(() => null);
    if (health?.ok) {
      assert.equal((await health.json()).version, version);
      return;
    }
    if (service.exitCode !== null) break;
    await delay(200);
  }
  throw new Error(`Manual capture service did not start:\n${log}`);
}

async function stop() {
  if (!service || service.exitCode !== null) return;
  const closed = once(service, 'exit');
  service.send('riftcast-shutdown');
  await Promise.race([closed, delay(5000, undefined, { ref: false })]);
  if (service.exitCode === null) {
    service.kill();
    await closed;
  }
}

async function shot(page, name, target = page) {
  await page.evaluate(() => document.fonts.ready);
  const visibleText = await (target === page ? page.locator('body') : target).innerText();
  assert.doesNotMatch(visibleText, /riftcast/i, name);
  assert.doesNotMatch(await page.title(), /riftcast/i, name);
  await target.screenshot({ path: path.join(out, `${name}.png`), animations: 'disabled' });
  await writeFile(path.join(evidence, `${name}.txt`), visibleText);
  captures.push(name);
  console.log('Captured', name);
}

try {
  const seed = createFixture();
  seed.paused = true;
  await start(seed, 'console');
  browser = await chromium.launch({ headless: true, ...browserExecutable({ channel: 'msedge' }) });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN', deviceScaleFactor: 1.5 });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.fallback() : route.abort());
  await nativeRequestGuard(blocked).attach(context);
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage();
  await page.goto(base);
  await page.locator('.control-main:not([inert])').waitFor();
  await page.getByRole('button', { name: '风格包', exact: true }).waitFor();

  const navigation = page.getByRole('navigation', { name: '主导航' });
  const nav = async name => {
    await navigation.getByRole('button', { name, exact: true }).click();
    await page.locator('.control-main > .control-page:visible').waitFor();
  };
  const tab = label => page.getByRole('tab', { name: new RegExp(`^${label}(?: ·|$)`) });
  async function captureTabs(section, tabs) {
    await nav(section);
    for (const [label, name] of tabs) {
      await tab(label).click();
      await shot(page, name);
    }
  }

  await shot(page, 'studio');
  await page.setViewportSize({ width: 1600, height: 1240 });
  await page.getByRole('button', { name: '风格包', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '风格包', exact: true });
  await dialog.locator('.style-pack-choice').filter({ hasText: signature.name }).click();
  await dialog.getByLabel('风格包预览节目').selectOption('lineup');
  await dialog.locator('[data-style-pack="rift-signature"][data-style-status="ready"]').waitFor();
  const prepare = await dialog.getByRole('button', { name: '准备到预监', exact: true }).boundingBox();
  const frame = await dialog.boundingBox();
  assert.ok(prepare && frame && prepare.y + prepare.height <= frame.y + frame.height, 'The style dialog footer must be in the capture');
  // Show the preview and prepare action. The pack list carries immutable author credits.
  await shot(page, 'style-manager', dialog.locator('.style-pack-detail'));
  await dialog.getByRole('button', { name: '关闭风格包', exact: true }).click();
  await page.setViewportSize({ width: 1600, height: 1000 });

  for (const [section, name] of [
    ['BP 与阵容', 'draft'], ['连接与输出', 'settings'], ['赛后收尾', 'wrap'],
  ]) {
    await nav(section);
    await shot(page, name);
  }
  await nav('使用指南');
  await page.getByRole('button', { name: '当前快捷键', exact: true }).click();
  await page.getByRole('heading', { name: '当前快捷键', exact: true }).waitFor();
  await shot(page, 'help');

  await nav('赛事与素材');
  await tab('独立对阵').click();
  await page.getByRole('button', { name: '新增比赛', exact: true }).click();
  await shot(page, 'manage');
  await captureTabs('赛事与素材', [
    ['战队与选手', 'teams'], ['图片素材', 'assets'], ['比赛记录', 'records'], ['赛事中心', 'tournament'],
  ]);
  await captureTabs('实时数据', [['来源与校准', 'data-health']]);
  await captureTabs('连接与输出', [
    ['数据连接', 'connections'], ['画面', 'video'], ['声音', 'audio'],
    ['输出', 'output'], ['节目包装', 'graphics'], ['协作', 'team-connect'],
    ['诊断', 'diagnostics'], ['镜头制作', 'camera'], ['数据集成', 'integration'],
    ['工作台外观', 'appearance'],
  ]);
  await page.getByRole('radio', { name: /浅色风格/ }).check();
  assert.equal(await page.locator('html').getAttribute('data-ui-theme'), 'light');
  await shot(page, 'appearance-light', page.locator('.appearance-panel'));
  await page.close();
  await stop();

  await start(createFixture(), 'telemetry', true);
  const telemetry = await context.newPage();
  await telemetry.goto(`${base}/#data`);
  await telemetry.getByText('10 人', { exact: true }).waitFor();
  await shot(telemetry, 'data');
  await telemetry.close();
  await stop();

  // Feed the real programme route a saved on-air lineup with the new pack.
  const programme = createFixture();
  programme.paused = true;
  programme.programScene = 'lineup';
  programme.overlay.stylePack = { id: signature.id, revision: signature.revision, name: signature.name };
  programme.production.program = captureProgram(programme);
  await start(programme, 'programme');
  const output = await context.newPage();
  await output.setViewportSize({ width: 1920, height: 1080 });
  await output.goto(`${base}/overlay`);
  await output.locator('[data-style-pack="rift-signature"][data-style-status="ready"]').waitFor();
  await output.locator('.rl-card').nth(9).waitFor();
  await output.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
  await shot(output, 'scene-rift-signature');
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  await writeFile(path.join(evidence, 'capture.json'), JSON.stringify({ version, captures, errors, blocked }, null, 2) + '\n');
} finally {
  await browser?.close();
  await stop();
  await rm(sandbox, { recursive: true, force: true, maxRetries: 5 });
}
