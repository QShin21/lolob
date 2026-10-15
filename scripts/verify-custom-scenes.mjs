// Isolated browser + real OBS integration. Never reads or mutates the operator's data/config.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, readdir, link } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { tsImport } from 'tsx/esm/api';
import sharp from 'sharp';
import { isolatedNativeEnvironment, applyRunnerEnvironment, nativeRequestGuard } from './verify-native-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = path.join(root, 'verification-output', 'custom-scenes');
await mkdir(evidenceRoot, { recursive: true });
const evidence = await mkdtemp(path.join(evidenceRoot, 'run-'));
const sandbox = path.join(evidence, 'isolated-fixture');
await mkdir(sandbox);
const checks = [], errors = [], failures = [];
const blockedRequests = [], guard = nativeRequestGuard(blockedRequests);
const playwrightModule = process.env.RIFTCAST_PLAYWRIGHT_MODULE;
const chromiumExecutable = process.env.RIFTCAST_CHROMIUM_EXECUTABLE;
const runnerEnv = { ...await isolatedNativeEnvironment(sandbox), RIFTCAST_OBS_MODE: 'embedded', RIFTCAST_OBS_RUNTIME_DIR: path.join(sandbox, 'runtime', 'obs-studio'), RIFTCAST_USER_DATA_DIR: path.join(sandbox, 'user-data') };
applyRunnerEnvironment(runnerEnv);
let engine, service, browser, fixtureBrowser, page;
const { ObsClient } = await tsImport('../server/obs-client.ts', import.meta.url);
const { ObsEngine } = await tsImport('../server/obs-engine.ts', import.meta.url);
const obs = new ObsClient();
const { chromium } = await import(playwrightModule ? pathToFileURL(playwrightModule).href : 'playwright');
const until = async (fn, label, count = 100) => { for (let i = 0; i < count; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(label); };
async function freePort() { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r)); return port; }
const port = await freePort(), base = `http://127.0.0.1:${port}`;
async function api(route, body) { guard.assertAllowed(body ? 'POST' : 'GET', route, body); const response = await fetch(base + route, { ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; }
async function linkTree(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isDirectory()) await linkTree(from, to); else if (entry.isFile()) await link(from, to);
  }
}
try {
  const runtime = path.join(sandbox, 'runtime', 'obs-studio');
  for (const folder of ['bin', 'data', 'obs-plugins']) await linkTree(path.join(root, 'runtime', 'obs-studio', folder), path.join(runtime, folder));
  await writeFile(path.join(runtime, '.riftcast-runtime.json'), JSON.stringify({ version: '32.2.2' }));
  const engineData = path.join(sandbox, 'engine-data'), serviceData = path.join(sandbox, 'service-data');
  await mkdir(engineData); await mkdir(serviceData);
  await writeFile(path.join(engineData, 'obs-engine.json'), JSON.stringify({ mode: 'embedded', selection: { gameWindow: 'RiftCast test:fixture:nonexistent.exe', desktopDevice: 'default', micDevice: 'default', micEnabled: false, outputFps: 30 } }));
  service = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: root, windowsHide: true,
    env: { ...runnerEnv, PORT: String(port), RIFTCAST_DATA_DIR: serviceData, RIFTCAST_OBS_MODE: 'external', RIFTCAST_OBS_AUTOSTART: '0' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  await until(async () => { try { return (await fetch(base + '/api/health')).ok; } catch { return false; } }, 'service ready');
  await api('/api/action', { type: 'demo-pause', paused: true });
  engine = new ObsEngine(obs, { root: sandbox, dataDir: engineData, overlayUrl: base + '/overlay', onConnection() {} });
  await engine.initialize(); await engine.start();
  const credentials = JSON.parse(await readFile(path.join(runtime, 'config/obs-studio/plugin_config/obs-websocket/config.json'), 'utf8'));
  await api('/api/action', { type: 'set-settings', patch: { obsUrl: `ws://127.0.0.1:${credentials.server_port}`, obsPassword: credentials.server_password } });
  await api('/api/connect', { target: 'obs' });
  assert.equal((await obs.call('GetStreamStatus')).outputActive, false);
  assert.equal((await obs.call('GetRecordStatus')).outputActive, false);
  const originalProgram = (await obs.call('GetCurrentProgramScene')).sceneName;
  checks.push('isolated real OBS connected with streaming and recording off');
  // A dedicated test window provides known pixels for actual Windows capture.
  fixtureBrowser = await chromium.launch({ executablePath: chromiumExecutable, env: runnerEnv, headless: false, args: ['--window-position=30,30', '--window-size=720,480'] });
  const fixture = await fixtureBrowser.newPage({ viewport: { width: 640, height: 360 } });
  await fixture.setContent('<title>RiftCast Custom Scene Test</title><body style="margin:0;background:#12bc68;color:white;font:36px sans-serif"><h1>RiftCast window fixture</h1><p>Custom scene capture</p></body>');
  await fixture.bringToFront();
  let choices;
  await until(async () => { choices = await api('/api/obs/custom-sources'); return choices.windows.some(w => w.name.includes('RiftCast Custom Scene Test')); }, 'fixture window is discoverable');
  const windowChoice = choices.windows.find(w => w.name.includes('RiftCast Custom Scene Test'));
  checks.push('actual Windows application window enumerated through OBS');
  browser = await chromium.launch({ executablePath: chromiumExecutable, env: runnerEnv, headless: true, args: ['--disable-gpu'] });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' });
  await guard.attach(page.context());
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/resources/asset**', route => route.fulfill({ contentType: 'application/json', body: '{"data":{}}' }));
  await page.goto(base);
  await page.getByRole('button', { name: '新建场景', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建自定义场景' });
  await dialog.getByLabel('场景名称', { exact: true }).fill('自定义演播室');
  const image = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#184f92' } }).png().toBuffer();
  await dialog.getByLabel('上传场景图片').setInputFiles({ name: 'studio-background.png', mimeType: 'image/png', buffer: image });
  await until(async () => (await api('/api/state')).assets.length === 1, 'upload persisted');
  await dialog.getByRole('button', { name: '添加来源', exact: true }).click();
  const picker = dialog.getByRole('region', { name: '添加来源', exact: true });
  await picker.getByRole('button', { name: '应用窗口', exact: true }).click();
  await picker.getByRole('button', { name: '刷新主机来源', exact: true }).click();
  await picker.getByRole('group', { name: '应用窗口列表', exact: true }).getByRole('button').filter({ has: page.getByText(windowChoice.name, { exact: true }) }).click();
  await picker.getByRole('button', { name: '添加窗口', exact: true }).click();
  await dialog.getByLabel('宽度', { exact: true }).fill('960');
  await dialog.getByLabel('高度', { exact: true }).fill('540');
  await dialog.getByLabel('横向位置', { exact: true }).fill('480');
  await dialog.getByLabel('纵向位置', { exact: true }).fill('270');
  await dialog.getByRole('button', { name: '上移', exact: true }).isDisabled().then(value => assert.ok(value));
  await page.screenshot({ path: path.join(evidence, 'editor-dark.png') });
  await page.evaluate(() => { document.documentElement.dataset.uiTheme = 'light'; });
  await page.waitForTimeout(200);
  const layout = dialog.getByRole('group', { name: '场景画布，方向键微调所选图层', exact: true }).locator('.custom-scene-layout');
  const lightPixels = await layout.screenshot();
  const { data: lightData, info: lightInfo } = await sharp(lightPixels).raw().toBuffer({ resolveWithObject: true });
  const sampleIndex = (Math.floor(lightInfo.height * 0.3) * lightInfo.width + Math.floor(lightInfo.width * 0.3)) * lightInfo.channels;
  assert.ok(lightData[sampleIndex + 2] < 100, 'window placeholder remains visible in light theme');
  await page.screenshot({ path: path.join(evidence, 'editor-light.png') });
  await page.evaluate(() => { document.documentElement.dataset.uiTheme = 'dark'; });
  await page.setViewportSize({width:1366,height:768});
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'dialog fits 1366px viewport');
  await dialog.getByRole('button',{name:'保存到待播',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(evidence,'editor-1366.png')});
  await page.setViewportSize({width:1600,height:1000});
  await dialog.getByRole('button', { name: '保存到待播', exact: true }).click();
  await until(async () => (await api('/api/state')).customScenes?.length === 1, 'scene saved');
  const saved = (await api('/api/state')).customScenes[0];
  assert.equal(saved.sources.length, 2);
  assert.equal((await obs.call('GetCurrentProgramScene')).sceneName, originalProgram);
  checks.push('UI uploads image and saves layered application window without changing program');
  await page.getByRole('button', { name: '自定义演播室 · 选择预监', exact: true }).click();
  await until(async () => (await obs.call('GetCurrentPreviewScene').catch(() => ({}))).sceneName?.startsWith('RiftCast 自定义 preview'), 'custom preview activated');
  assert.equal((await obs.call('GetCurrentProgramScene')).sceneName, originalProgram);
  const previewName = (await obs.call('GetCurrentPreviewScene')).sceneName;
  let pixels, blue, green;
  await fixture.bringToFront();
  for(let attempt=0;attempt<30;attempt++){
    const screenshot = await obs.call('GetSourceScreenshot', { sourceName: previewName, imageFormat: 'png', imageWidth: 960 });
    pixels = Buffer.from(screenshot.imageData.split(',')[1], 'base64');
    const { data, info } = await sharp(pixels).raw().toBuffer({ resolveWithObject: true });
    const rgb = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    blue=rgb(100,100);green=rgb(500,300);
    if(blue[2]>blue[0]+50&&blue[2]>blue[1]+30&&green[1]>green[0]+50&&green[1]>green[2]+30)break;
    await new Promise(r=>setTimeout(r,300));
  }
  await writeFile(path.join(evidence, 'obs-preview.png'), pixels);
  const sceneItems=(await obs.call('GetSceneItemList',{sceneName:previewName})).sceneItems;
  await writeFile(path.join(evidence,'obs-items.json'),JSON.stringify(sceneItems,null,2));
  const captureItem=sceneItems.find(i=>i.inputKind==='window_capture');
  await writeFile(path.join(evidence,'window-diagnostics.json'),JSON.stringify({active:await obs.call('GetSourceActive',{sourceName:captureItem.sourceName}),settings:await obs.call('GetInputSettings',{inputName:captureItem.sourceName}),selectedWindowListed:(await obs.call('GetInputPropertiesListPropertyItems',{inputName:captureItem.sourceName,propertyName:'window'})).propertyItems.some(w=>w.itemValue===windowChoice.value),stats:await obs.call('GetStats')},null,2));
  assert.ok(blue[2] > blue[0] + 50 && blue[2] > blue[1] + 30, `image background pixels ${blue}`);
  checks.push('real OBS screenshot contains uploaded image pixels');
  if (green[1] > green[0] + 50 && green[1] > green[2] + 30) checks.push('real OBS screenshot contains captured fixture window pixels');
  else failures.push(`Application window has no verified capture pixels: ${green}. Check that the Windows desktop session is connected and the fixture window is visible.`);
  await page.getByRole('button', { name: '自定义演播室 · 选择预监', exact: true }).press('Enter');
  await until(async () => (await api('/api/state')).programScene === saved.id, 'TAKE published');
  assert.ok((await obs.call('GetCurrentProgramScene')).sceneName.startsWith('RiftCast 自定义 program'));
  checks.push('Enter TAKE switches actual OBS program to custom composition');
  await page.getByRole('button', { name: '编辑 自定义演播室', exact: true }).click();
  await page.getByRole('dialog').getByLabel('场景名称', { exact: true }).fill('修改后待播');
  await page.getByRole('dialog').getByRole('button', { name: '保存到待播', exact: true }).click();
  await until(async () => (await api('/api/state')).customScenes[0].name === '修改后待播', 'edit saved');
  const staged = await api('/api/state');
  assert.equal(staged.production.program.customScenes[0].name, '自定义演播室');
  await page.reload();
  await page.getByRole('button', { name: /修改后待播 · 选择预监/ }).waitFor();
  assert.ok(JSON.parse(await readFile(path.join(serviceData, 'state.json'), 'utf8')).customScenes.some(s => s.name === '修改后待播'));
  checks.push('edit remains staged, persists to disk and survives browser reload');
  // The scene library now explains references in its confirmation row.
  // Preserve the guard assertion at the actual commit button, not the entry button.
  await page.getByRole('button',{name:'删除 修改后待播',exact:true}).click();
  const deletePrompt = page.getByRole('alert').filter({ has: page.getByRole('button', { name: '确认删除', exact: true }) });
  assert.match(await deletePrompt.innerText(), /节目/);
  assert.ok(await deletePrompt.getByRole('button',{name:'确认删除',exact:true}).isDisabled(),'on-air scene deletion disabled');
  await deletePrompt.getByRole('button',{name:'取消',exact:true}).click();
  const beforeFailure=(await obs.call('GetCurrentProgramScene')).sceneName;
  await fixtureBrowser.close();fixtureBrowser=undefined;
  await page.getByRole('button',{name:/修改后待播 · 选择预监/}).press('Enter');
  await until(async()=>(await api('/api/state')).production.application.status==='failed','closed window blocks TAKE');
  assert.equal((await obs.call('GetCurrentProgramScene')).sceneName,beforeFailure);
  assert.equal((await api('/api/state')).production.program.customScenes[0].name,'自定义演播室');
  checks.push('closed application window blocks TAKE and retains previous program configuration');

  await page.getByRole('button', { name: /赛前倒计时 · 选择预监/ }).first().click();
  await until(async () => (await obs.call('GetCurrentPreviewScene')).sceneName === originalProgram, 'builtin preview restored');
  await page.getByRole('button', { name: /赛前倒计时 · 选择预监/ }).first().press('Enter');
  await until(async () => (await api('/api/state')).programScene === 'standby', 'builtin TAKE');
  assert.equal((await obs.call('GetCurrentProgramScene')).sceneName, originalProgram);
  await page.getByRole('button', { name: '删除 修改后待播', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await until(async () => (await api('/api/state')).customScenes.length === 0, 'delete saved');
  assert.equal((await api('/api/state')).assets.length, 1);
  checks.push('return to builtin program and delete custom scene while keeping uploaded asset');
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, [], 'No device preparation or platform-output request may be attempted');
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify({ runAt: new Date().toISOString(), status: failures.length ? 'failed' : 'passed', sandbox, blockedRequests, checks, failures, errors, obsVersion: (await obs.call('GetVersion')).obsVersion, pixelSamples: { blue, green }, liveStreamTested: false }, null, 2));
  assert.deepEqual(failures, [], 'Window capture must supply real pixels for this integration to pass');
  console.log(`Custom scenes: ${checks.length} checks passed, ${errors.length} browser errors. ${evidence}`);
} catch (error) {
  const logs=path.join(sandbox,'runtime/obs-studio/config/obs-studio/logs');
  const latest=(await readdir(logs).catch(()=>[])).filter(f=>f.endsWith('.txt')).sort().at(-1);
  if(latest){const log=await readFile(path.join(logs,latest),'utf8');await writeFile(path.join(evidence,'capture-diagnostics.log'),log.split(/\r?\n/).filter((line,index,lines)=>/capture|window|winrt|custom|自定义|failed|error|scene.*switch/i.test(line)||lines.slice(Math.max(0,index-9),index).some(l=>l.includes('update settings:'))).join('\n'));}
  await writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, sandbox, blockedRequests, checks, errors }, null, 2));
  await page?.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser?.close(); await fixtureBrowser?.close();
  if (service?.exitCode === null) { service.send({ type: 'riftcast-shutdown' }); await new Promise(resolve => { const t = setTimeout(() => { service.kill(); resolve(); }, 5000); service.once('exit', () => { clearTimeout(t); resolve(); }); }); }
  await engine?.close();
  // Retain this run's fixture/config/logs and every earlier run for diagnosis.
}
