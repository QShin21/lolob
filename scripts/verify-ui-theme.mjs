// Browser verification uses an isolated demo service and never opens operator data or OBS.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const evidence = path.join(root, 'verification-output', `ui-theme-${version}`);
await mkdir(evidence, { recursive: true });
const { createSeed, scenes } = await tsImport('../server/state.ts', import.meta.url);
const seed = createSeed();
seed.paused = true;
seed.previewScene = seed.programScene = 'standby';
const dir = await mkdtemp(path.join(tmpdir(), 'riftcast-ui-theme-'));
await writeFile(path.join(dir, 'state.json'), JSON.stringify(seed));
const port = 52000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  cwd: root, windowsHide: true,
  env: { ...process.env, PORT: String(port), ENABLE_LAN: '0', RIFTCAST_DATA_DIR: dir,
    RIFTCAST_AUTO_CONNECT: '0', RIFTCAST_OBS_AUTOSTART: '0', RIFTCAST_OFFLINE: '1' },
  stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
});
let browser, page;
const tests = [], errors = [], comparisons = [];
const until = async (check, label) => {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(label);
};
const theme = page => page.locator('html').getAttribute('data-ui-theme');
const ready = async page => {
  await page.getByRole('region', { name: '固定播出与应急控制' }).waitFor();
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
};
const appearance = async page => {
  await page.locator('.sidebar').getByRole('button', { name: '连接与输出', exact: true }).click();
  await page.getByRole('tab', { name: '外观', exact: true }).click();
  await page.getByRole('heading', { name: '系统外观', exact: true }).waitFor();
};
const selectTheme = async (page, value) => {
  await page.getByRole('radio', { name: value === 'light' ? /浅色风格/ : /深色风格/ }).check();
  await until(async () => await theme(page) === value, `${value} theme applied`);
};
const canvasStyles = page => page.locator('.broadcast-canvas').evaluateAll(canvases => {
  const properties = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color',
    'border-bottom-color', 'border-left-color', 'fill', 'stroke', 'box-shadow', 'outline-color'];
  return canvases.map(canvas => [canvas, ...canvas.querySelectorAll('*')].map(element => ({
    tag: element.tagName, class: element.getAttribute('class'),
    styles: [null, '::before', '::after'].map(pseudo => {
      const style = getComputedStyle(element, pseudo);
      return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));
    }),
  })));
});

try {
  await until(async () => { try { return (await fetch(base + '/api/health')).ok; } catch { return false; } }, 'service ready');
  assert.equal((await fetch(base + '/api/health').then(r => r.json())).version, version);
  tests.push('health version matches package version');
  const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
  browser = await chromium.launch({ headless: true });
  const createContext = async () => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'zh-CN' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname === '/api/resources/asset') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{}}' });
      return route.continue();
    });
    context.on('page', tab => tab.on('pageerror', error => errors.push(error.message)));
    return context;
  };
  const context = await createContext();
  page = await context.newPage();
  await page.goto(base);
  await ready(page);
  assert.equal(await theme(page), 'dark');
  await until(() => page.evaluate(() => !!sessionStorage.getItem('riftcast-seat-token')), 'seat established');
  await appearance(page);
  let actions = 0;
  context.on('request', request => { if (new URL(request.url()).pathname === '/api/action') actions++; });
  const darkBackground = await page.locator('.app-shell').evaluate(el => getComputedStyle(el).backgroundColor);
  await selectTheme(page, 'light');
  const lightBackground = await page.locator('.app-shell').evaluate(el => getComputedStyle(el).backgroundColor);
  assert.notEqual(lightBackground, darkBackground, 'console background changes');
  assert.equal(await page.evaluate(() => localStorage.getItem('riftcast-ui-theme')), 'light');
  await page.screenshot({ path: path.join(evidence, 'appearance-light.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: path.join(evidence, 'appearance-light-1366.png'), fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.reload();
  await ready(page);
  assert.equal(await theme(page), 'light');
  await appearance(page);
  const studio = await context.newPage();
  await studio.goto(base);
  await ready(studio);
  assert.equal(await theme(studio), 'light');
  await selectTheme(page, 'dark');
  await until(async () => await theme(studio) === 'dark', 'same-origin dark sync');
  await selectTheme(page, 'light');
  await until(async () => await theme(studio) === 'light', 'same-origin light sync');
  assert.equal(actions, 0, 'theme changes do not dispatch broadcast actions');
  tests.push('default dark, immediate light/dark changes, reload persistence, same-origin tab sync, zero broadcast actions');

  const action = body => page.evaluate(async body => {
    const state = await fetch('/api/state').then(r => r.json());
    const response = await fetch('/api/action', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-seat-token': sessionStorage.getItem('riftcast-seat-token') },
      body: JSON.stringify({ ...body, requestId: crypto.randomUUID(), expectedConfigVersion: state.production.configVersion }) });
    if (!response.ok) throw new Error((await response.json()).error);
    return response.json();
  }, body);
  for (const kind of ['program', 'preview']) await studio.locator(`.monitor-pane.${kind}`).getByRole('button', { name: '查看 HUD 排版', exact: true }).click();
  const overlay = await context.newPage();
  await overlay.goto(base + '/overlay');
  await overlay.locator('.broadcast-canvas').waitFor();
  await overlay.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  assert.equal(await theme(overlay), 'dark');
  for (const scene of scenes) {
    await action({ type: 'preview-scene', scene });
    await action({ type: 'take' });
    await overlay.locator(`.cast-scene-${scene}`).waitFor();
    await studio.locator(`.monitor-pane.preview .cast-scene-${scene}`).waitFor();
    await studio.locator(`.monitor-pane.program .cast-scene-${scene}`).waitFor();
    await selectTheme(page, 'dark');
    await until(async () => await theme(studio) === 'dark', 'studio dark sync');
    const dark = { studio: await canvasStyles(studio), overlay: await canvasStyles(overlay) };
    await selectTheme(page, 'light');
    await until(async () => await theme(studio) === 'light', 'studio light sync');
    const light = { studio: await canvasStyles(studio), overlay: await canvasStyles(overlay) };
    await writeFile(path.join(evidence, `styles-${scene}.json`), JSON.stringify({ dark, light }));
    assert.deepEqual(light, dark, `${scene}: all canvas descendants and pseudo-elements retain broadcast colors`);
    assert.equal(await theme(overlay), 'dark');
    comparisons.push({ scene, studioElements: dark.studio.reduce((n, c) => n + c.length, 0), outputElements: dark.overlay.reduce((n, c) => n + c.length, 0) });
    if (['standby', 'draft', 'live', 'postgame'].includes(scene)) await overlay.screenshot({ path: path.join(evidence, `overlay-${scene}.png`) });
  }
  tests.push(`all ${scenes.length} scenes preserve every canvas descendant and pseudo-element color, background, border, fill and stroke across themes`);

  for (const [name, label] of [['studio', '导播工作台'], ['draft', 'BP 与阵容'], ['data', '实时数据'], ['manage', '赛事与素材'], ['settings', '连接与输出'], ['help', '使用指南']]) {
    await studio.locator('.sidebar').getByRole('button', { name: label, exact: true }).click();
    await studio.getByText('正在载入页面…', { exact: true }).waitFor({ state: 'hidden' });
    for (const width of [1920, 1366, 1080]) {
      await studio.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
      assert.equal(await studio.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${name} fits ${width}px`);
      if (width === 1366 || name === 'studio') await studio.screenshot({ path: path.join(evidence, `${name}-light-${width}.png`), fullPage: true });
    }
  }
  tests.push('six main pages fit 1920, 1366 and 1080 pixel viewports in light theme');
  const remote = await context.newPage();
  await remote.setViewportSize({ width: 390, height: 844 });
  await remote.goto(base + '/remote');
  await remote.locator('.remote-page').waitFor();
  assert.equal(await theme(remote), 'light');
  assert.equal(await remote.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, 'remote fits 390px');
  const dismiss = remote.getByRole('button', { name: '关闭通知', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await remote.screenshot({ path: path.join(evidence, 'remote-light-390.png'), fullPage: true });
  tests.push('remote console restores light theme and fits a 390 pixel viewport');
  const invalid = await createContext();
  await invalid.addInitScript(() => { if (location.protocol === 'http:') localStorage.setItem('riftcast-ui-theme', 'invalid-theme'); });
  const invalidPage = await invalid.newPage();
  await invalidPage.goto(base);
  await ready(invalidPage);
  assert.equal(await theme(invalidPage), 'dark');
  await invalid.close();
  tests.push('invalid stored theme falls back to dark');
  const blocked = await createContext();
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage disabled', 'SecurityError'); } }));
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(base);
  await ready(blockedPage);
  await appearance(blockedPage);
  await blockedPage.getByText('当前风格已应用。浏览器存储不可用，重新打开后需再次选择。', { exact: true }).waitFor();
  await selectTheme(blockedPage, 'light');
  await blockedPage.getByText('当前风格已应用。浏览器存储不可用，重新打开后需再次选择。', { exact: true }).waitFor();
  await selectTheme(blockedPage, 'dark');
  await blocked.close();
  tests.push('blocked storage is disclosed on first load and both themes remain switchable');
  assert.deepEqual(errors, []);
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify({ version, tests, errors, comparisons,
    boundary: 'Built Chromium UI with an isolated paused demo service and offline resources. No operator data, OBS, Riot game, physical media, streaming platform or live production was exercised.' }, null, 2));
  await rm(path.join(evidence, 'failure.json'), { force: true });
  await rm(path.join(evidence, 'failure.png'), { force: true });
  console.log(`UI theme: ${tests.length} checks passed. Evidence: ${evidence}`);
} catch (error) {
  await writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, tests, errors }, null, 2));
  await page?.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    child.send({ type: 'riftcast-shutdown' });
    await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill(); resolve(); }, 4000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
  const absolute = path.resolve(dir);
  assert.ok(absolute.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(absolute).startsWith('riftcast-ui-theme-'));
  await rm(absolute, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
