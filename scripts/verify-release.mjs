import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:net';
import os from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const option = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
let executable = option('--executable') || process.env.RIFTCAST_RELEASE_EXECUTABLE;
const evidence = path.join(root, 'verification-output', `release-${pkg.version}`);
await mkdir(evidence, { recursive: true });
const sandbox = await mkdtemp(path.join(evidence, 'smoke-'));
if (!executable) {
  // Place the application outside the repository tree so module resolution
  // cannot accidentally use development node_modules from an ancestor.
  const isolatedApp = await mkdtemp(path.join(os.tmpdir(), `RiftCast-${pkg.version}-smoke-`));
  await cp(path.join(root, 'release', pkg.version, 'win-unpacked'), isolatedApp, { recursive: true });
  executable = path.join(isolatedApp, 'RiftCast.exe');
}
const checks = [], errors = [], cameraSamples = {};
let virtualCameraFrameVerified = false;
let companionAudioUnavailableVerified = false;
let application, page;
const playwrightModule = option('--playwright') || process.env.RIFTCAST_PLAYWRIGHT_MODULE;
const { _electron } = await import(playwrightModule ? pathToFileURL(playwrightModule).href : 'playwright');
const runFile = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function until(work, label, timeout = 30000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await work()) return; await new Promise(r => setTimeout(r, 150)); } throw new Error(label); }
const portServer = createServer(); await new Promise(r => portServer.listen(0, '127.0.0.1', r));
const port = portServer.address().port; await new Promise(r => portServer.close(r));
const base = `http://127.0.0.1:${port}`;
async function api(route, body, allowFailure = false) {
  if (route === '/api/action' && body) {
    const state = await api('/api/state');
    body = { ...body, expectedConfigVersion: state.production.configVersion, requestId: randomUUID() };
  }
  const token = body && page && !page.isClosed() ? await page.evaluate(() => sessionStorage.getItem('riftcast-seat-token')) : undefined;
  const response = await fetch(base + route, { ...(body ? { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-seat-token': token } : {}) }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  const value = await response.json(); if (!response.ok && !allowFailure) throw new Error(value.error || route); return value;
}
const userData = path.join(sandbox, 'user-data');
const source = path.join(sandbox, 'legacy-project');
await mkdir(path.join(source, 'data/uploads'), { recursive: true });
await mkdir(path.join(source, 'runtime/obs-studio/config'), { recursive: true });
const { createSeed } = await tsImport('../server/state.ts', import.meta.url);
const seed = createSeed(); seed.match.title = 'Release 迁移验证'; seed.demoPaused = true;
const sourceState = JSON.stringify(seed, null, 2);
await writeFile(path.join(source, 'data/state.json'), sourceState);
await writeFile(path.join(source, 'data/uploads/preserved.txt'), 'preserved fixture');
await writeFile(path.join(source, 'runtime/obs-studio/config/preserved.txt'), 'preserved OBS fixture');
const env = { ...process.env, PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot};${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0`, PORT: String(port), RIFTCAST_USER_DATA_DIR: userData, RIFTCAST_IMPORT_FROM: source, RIFTCAST_OBS_AUTOSTART: '1', RIFTCAST_AUTO_CONNECT: '0', RIFTCAST_OFFLINE: '1' };
for (const key of ['ELECTRON_RUN_AS_NODE', 'RIFTCAST_DATA_DIR', 'RIFTCAST_OBS_RUNTIME_DIR', 'RIFTCAST_DEV']) delete env[key];
const report = () => ({ status: errors.length ? 'failed' : 'passed', version: pkg.version, executable, runAt: new Date().toISOString(), sandbox, checks, errors, virtualCameraFrameVerified, cameraSamples, companionAudioVerified: false, companionAudioUnavailableVerified, liveGameVerified: false, liveStreamVerified: false });
try {
  assert.ok(fs.existsSync(executable));
  assert.ok(!path.resolve(executable).toLowerCase().startsWith(root.toLowerCase() + path.sep), 'Release verification must run outside the source tree');
  application = await _electron.launch({ executablePath: executable, args: [], env, timeout: 45000 });
  page = await application.firstWindow({ timeout: 45000 });
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForLoadState('domcontentloaded');
  await until(async () => { try { return (await api('/api/health')).version === pkg.version; } catch { return false; } }, 'Release service ready');
  const metadata = await application.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion(), userData: app.getPath('userData') }));
  assert.equal(metadata.packaged, true); assert.equal(metadata.version, pkg.version); assert.equal(metadata.userData, userData);
  assert.equal((await api('/api/state')).match.title, 'Release 迁移验证');
  assert.equal(hash(await readFile(path.join(source, 'data/state.json'))), hash(sourceState));
  assert.equal(await readFile(path.join(userData, 'data/uploads/preserved.txt'), 'utf8'), 'preserved fixture');
  assert.equal(await readFile(path.join(userData, 'runtime/obs-studio/config/preserved.txt'), 'utf8'), 'preserved OBS fixture');
  checks.push('packaged EXE starts with no Node/npm/compiler on PATH; version and migration match; original data retained');
  await until(async () => (await api('/api/obs/engine')).connected, 'Bundled real OBS connects', 45000);
  const status = await api('/api/obs/engine');
  assert.equal(status.version, '32.2.2'); assert.equal(status.streamActive, false); assert.equal(status.recordActive, false);
  checks.push('bundled OBS 32.2.2 runs from independent user directory; real WebSocket connected; stream and record off');
  await page.getByRole('button', { name: '新建自定义场景', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建自定义场景' });
  await dialog.getByLabel('场景名称', { exact: true }).fill('Release 场景验证');
  const image = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#184f92' } }).png().toBuffer();
  await dialog.getByLabel('上传场景图片').setInputFiles({ name: 'release-background.png', mimeType: 'image/png', buffer: image });
  await until(async () => (await api('/api/state')).assets.length === 1, 'Release upload persisted');
  await dialog.getByRole('button', { name: '保存场景', exact: true }).click();
  await until(async () => (await api('/api/state')).customScenes.some(scene => scene.name === 'Release 场景验证'), 'Custom scene saved');
  checks.push('latest custom scene editor, real image upload and saved scene work in packaged renderer');
  await page.locator('.native-preview[data-kind="program"].phase-live').waitFor({ timeout: 30000 });
  const projector = await api('/api/obs/engine/monitor', { kind: 'program', open: false });
  const helper = path.join(path.dirname(executable), 'resources/app/scripts/bin/obs-projector-window.exe');
  const windows = JSON.parse((await runFile(helper, ['list', '--pid', String(projector.obsProcessId)], { windowsHide: true, encoding: 'utf8' })).stdout).windows;
  assert.ok(windows.some(window => window.kind === 'program' && window.visible && (window.style & 0x40000000) !== 0 && window.width > 0 && window.height > 0));
  checks.push('prebuilt native helper embeds a visible program projector from the owned real OBS process');
  await page.screenshot({ path: path.join(evidence, 'release-desktop.png') });
  const musicBytes=Buffer.alloc(44+48000*4); musicBytes.write('RIFF'); musicBytes.writeUInt32LE(musicBytes.length-8,4); musicBytes.write('WAVEfmt ',8); musicBytes.writeUInt32LE(16,16); musicBytes.writeUInt16LE(1,20); musicBytes.writeUInt16LE(2,22); musicBytes.writeUInt32LE(48000,24); musicBytes.writeUInt32LE(192000,28); musicBytes.writeUInt16LE(4,32); musicBytes.writeUInt16LE(16,34); musicBytes.write('data',36); musicBytes.writeUInt32LE(48000*4,40);
  for(let i=0;i<48000;i++){ const sample=Math.round(Math.sin(i*2*Math.PI*880/48000)*3276); musicBytes.writeInt16LE(sample,44+i*4); musicBytes.writeInt16LE(sample,46+i*4); }
  const musicInput=page.getByLabel('节目音乐文件',{exact:true}); await musicInput.setInputFiles({name:'release-music.wav',mimeType:'audio/wav',buffer:musicBytes});
  await until(async()=> (await api('/api/obs/production')).music?.available,'Music upload configures real managed OBS input');
  assert.equal((await api('/api/obs/production')).music.playing,false);
  await page.getByRole('button',{name:'播放音乐',exact:true}).click(); await until(async()=> (await api('/api/obs/production')).music.playing,'Music playback confirmed');
  await page.getByRole('button',{name:'暂停音乐',exact:true}).click(); await until(async()=> !(await api('/api/obs/production')).music.playing,'Music pause confirmed');
  checks.push('Packaged UI imports a real WAV, creates the managed music bus, and verifies default pause plus play/pause against actual OBS');
  const blueScene = (await api('/api/state')).customScenes.find(scene => scene.name === 'Release 场景验证');
  await api('/api/action', { type: 'take', scene: blueScene.id });
  await page.evaluate(() => { location.hash = 'settings'; });
  await page.getByRole('tab', { name: '输出', exact: true }).click();
  const outputPanel = page.getByRole('region', { name: 'OBS 连接与输出配置' });
  await outputPanel.getByLabel('直播输出方式', { exact: true }).selectOption('douyin');
  await until(async () => (await api('/api/obs/engine')).destination === 'douyin', 'Companion destination saved');
  await outputPanel.locator('.companion-output-guide').waitFor({ state: 'visible' });
  assert.equal(await outputPanel.getByLabel('RTMP 服务器', { exact: true }).count(), 0);
  assert.equal((await api('/api/obs/engine')).virtualCamera.driver.installed, true, 'OBS Virtual Camera must be registered on the acceptance host');
  // Existing valid registrations are reused; this call must not need a UAC prompt.
  await api('/api/obs/engine/virtual-camera/install', {});
  const audioReady = (await api('/api/obs/engine')).companionAudio?.ready;
  if (audioReady) {
  await outputPanel.getByRole('button', { name: '启动伴侣音画', exact: true }).click();
  await until(async () => (await api('/api/obs/engine')).virtualCamActive === true, 'Real virtual camera starts');
  let cameraStatus = await api('/api/obs/engine');
  assert.equal(cameraStatus.streamActive, false); assert.equal(cameraStatus.recordActive, false);
  const refuseChange = async (route, body) => until(async () => {
    const response = await api(route, body, true);
    if (/正在处理/.test(response.error)) return false;
    assert.match(response.error || '', /停止伴侣/, route + ' must preserve the active camera');
    return true;
  }, 'Active companion output protects ' + route);
  await refuseChange('/api/obs/engine/setup', {});
  await refuseChange('/api/obs/engine/destination', { destination: 'rtmp' });
  checks.push('companion UI omits RTMP keys, starts real OBS Virtual Camera, and protects active sources and destination');

  // Grant video permission only in this isolated acceptance process; production renderer permissions stay unchanged.
  await application.evaluate(({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows()[0].webContents.session;
    target.setPermissionCheckHandler((_contents, permission, _origin, details) => permission === 'clipboard-sanitized-write' || permission === 'media' && details.mediaType !== 'audio');
    target.setPermissionRequestHandler((_contents, permission, callback, details) => callback(permission === 'clipboard-sanitized-write' || permission === 'media' && !details.mediaTypes?.includes('audio')));
  });
  cameraSamples.device = await page.evaluate(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const device = devices.find(item => item.kind === 'videoinput' && /OBS Virtual Camera/i.test(item.label));
    if (!device) throw new Error('OBS Virtual Camera is absent from the Windows video device list');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: device.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    const video = document.createElement('video'); video.muted = true; video.playsInline = true;
    video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none';
    document.body.append(video); video.srcObject = stream; await video.play();
    const viewer = { video, stream, frames: 0 };
    window.__riftcastCameraAcceptance = viewer;
    const count = () => { viewer.frames++; if (video.srcObject) video.requestVideoFrameCallback(count); };
    video.requestVideoFrameCallback(count);
    return { label: device.label, settings: stream.getVideoTracks()[0].getSettings() };
  });
  const cameraPixel = () => page.evaluate(() => {
    const viewer = window.__riftcastCameraAcceptance;
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 36;
    const context = canvas.getContext('2d'); context.drawImage(viewer.video, 0, 0, 64, 36);
    return { pixel: [...context.getImageData(32, 18, 1, 1).data], frames: viewer.frames, width: viewer.video.videoWidth, height: viewer.video.videoHeight };
  });
  await until(async () => { const sample = await cameraPixel(); return sample.frames >= 12 && sample.pixel[2] > sample.pixel[0] + 50; }, 'Virtual camera receives real blue Program pixels', 20000);
  cameraSamples.blueProgram = await cameraPixel();
  const pendingScene = { id: 'custom:release-camera-preview', name: 'Release 红色待播', background: '#ba1c28', sources: [] };
  await api('/api/action', { type: 'save-custom-scene', scene: pendingScene });
  await api('/api/action', { type: 'preview-scene', scene: pendingScene.id });
  await new Promise(resolve => setTimeout(resolve, 800));
  cameraSamples.pendingPreview = await cameraPixel();
  assert.ok(cameraSamples.pendingPreview.pixel[2] > cameraSamples.pendingPreview.pixel[0] + 50, 'Preview stays off the camera output');
  await api('/api/action', { type: 'take', scene: pendingScene.id });
  await until(async () => { const sample = await cameraPixel(); return sample.pixel[0] > sample.pixel[2] + 80; }, 'TAKE changes actual camera output to red Program');
  cameraSamples.redProgram = await cameraPixel();
  assert.ok(cameraSamples.redProgram.frames > cameraSamples.blueProgram.frames);
  assert.equal(cameraSamples.redProgram.width, 1920); assert.equal(cameraSamples.redProgram.height, 1080);
  const cameraPng = await page.evaluate(() => {
    const video = window.__riftcastCameraAcceptance.video, canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0); return canvas.toDataURL('image/png').split(',')[1];
  });
  await writeFile(path.join(evidence, 'virtual-camera-program.png'), Buffer.from(cameraPng, 'base64'));
  virtualCameraFrameVerified = true;
  checks.push('Windows video device receives 1920x1080 Program frames, ignores pending Preview, and follows an actual TAKE');
  await outputPanel.getByRole('button', { name: '开始录制', exact: true }).click();
  await until(async () => (await api('/api/obs/engine')).recordActive, 'Recording coexists with virtual camera');
  assert.equal((await api('/api/obs/engine')).virtualCamActive, true);
  await outputPanel.getByRole('button', { name: '停止录制', exact: true }).click();
  await until(async () => !(await api('/api/obs/engine')).recordActive, 'Recording stops independently');
  assert.equal((await api('/api/obs/engine')).virtualCamActive, true);
  checks.push('real local recording starts and stops while the companion video output continues');
  const exitWarning = await application.evaluate(({ BrowserWindow, dialog }) => new Promise(resolve => {
    const original = dialog.showMessageBox;
    dialog.showMessageBox = async (_window, options) => { dialog.showMessageBox = original; resolve(options.message); return { response: 0, checkboxChecked: false }; };
    BrowserWindow.getAllWindows()[0].close();
  }));
  assert.match(exitWarning, /伴侣音画输出/);
  assert.match(exitWarning, /直播间/);
  assert.equal((await api('/api/obs/engine')).virtualCamActive, true);
  checks.push('closing an active companion output warns about loss of video and retains output when cancelled');
  await page.screenshot({ path: path.join(evidence, 'douyin-output.png'), fullPage: true });
  await page.getByRole('tab', { name: '外观', exact: true }).click();
  await page.locator('input[name="ui-theme"][value="light"]').check();
  await page.getByRole('tab', { name: '输出', exact: true }).click();
  await page.screenshot({ path: path.join(evidence, 'douyin-output-light.png'), fullPage:true, animations:'disabled' });
  assert.ok((await cameraPixel()).pixel[0] > (await cameraPixel()).pixel[2] + 80, 'console theme leaves camera Program unchanged');
  await page.getByRole('tab', { name: '外观', exact: true }).click();
  await page.locator('input[name="ui-theme"][value="dark"]').check();
  await page.getByRole('tab', { name: '输出', exact: true }).click();
  checks.push('companion guide renders in both console themes while Program video retains its broadcast colors');
  await page.evaluate(() => { const viewer = window.__riftcastCameraAcceptance; viewer.stream.getTracks().forEach(track => track.stop()); viewer.video.srcObject = null; viewer.video.remove(); });
  const stopCamera = outputPanel.getByRole('button', { name: '按住停止伴侣音画', exact: true });
  await stopCamera.hover(); await page.mouse.down(); await new Promise(resolve => setTimeout(resolve, 1200)); await page.mouse.up();
  await until(async () => (await api('/api/obs/engine')).virtualCamActive === false, 'Real camera stops');
  } else {
    const engineState = await api('/api/obs/engine'); assert.equal(engineState.companionAudio.available, true, 'Bundled native mix component must load even when remote desktop hides the cable');
    assert.equal(await outputPanel.getByRole('button', { name: '启动伴侣音画', exact: true }).isDisabled(), true);
    const refused=await api('/api/obs/engine/output',{action:'start-virtual-camera'},true); assert.match(refused.error || '', /VB-CABLE|音频|驱动|重启/);
    const safe=await api('/api/obs/engine'); assert.equal(safe.virtualCamActive,false); assert.equal(safe.companionAudio.active,false);
    companionAudioUnavailableVerified=true; checks.push('Native final-mix library loads in packaged OBS; inaccessible audio endpoint rejects start and preserves both outputs stopped');
    await outputPanel.getByRole('button',{name:'开始录制',exact:true}).click(); await until(async()=> (await api('/api/obs/engine')).recordActive,'Independent local recording');
    await outputPanel.getByRole('button',{name:'停止录制',exact:true}).click(); await until(async()=> !(await api('/api/obs/engine')).recordActive,'Recording stops');
    checks.push('Local recording remains available when companion audio is unavailable');
    await page.screenshot({path:path.join(evidence,'douyin-output.png'),fullPage:true});
    await page.getByRole('tab',{name:'外观',exact:true}).click(); await page.locator('input[name=ui-theme][value=light]').check(); await page.getByRole('tab',{name:'输出',exact:true}).click();
    await page.screenshot({path:path.join(evidence,'douyin-output-light.png'),fullPage:true,animations:'disabled'});
    await page.getByRole('tab',{name:'外观',exact:true}).click(); await page.locator('input[name=ui-theme][value=dark]').check(); await page.getByRole('tab',{name:'输出',exact:true}).click();
    checks.push('Full-mix preparation and device guidance render in both console themes');
  }
  await outputPanel.getByLabel('直播输出方式', { exact: true }).selectOption('rtmp');
  await until(async () => (await api('/api/obs/engine')).destination === 'rtmp', 'RTMP mode remains available');
  await outputPanel.getByLabel('RTMP 服务器', { exact: true }).waitFor();
  await outputPanel.getByLabel('直播输出方式', { exact: true }).selectOption('douyin');
  await until(async () => (await api('/api/obs/engine')).destination === 'douyin', 'Persist companion mode for restart');
  checks.push(audioReady ? 'Hold-to-stop confirms real companion output off; RTMP configuration returns; companion choice is saved' : 'Both companion outputs remain stopped; RTMP configuration returns; companion choice is saved');
  const duplicate = spawn(executable, [], { env, windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => { duplicate.kill(); reject(new Error('Duplicate launch did not exit')); }, 10000); duplicate.once('error', reject); duplicate.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Duplicate launch exit ${code}`)); }); });
  assert.equal((await api('/api/health')).version, pkg.version);
  checks.push('duplicate EXE launch exits cleanly and preserves the existing director instance');
  await application.close(); application = undefined;
  await until(async () => { try { await api('/api/health'); return false; } catch { return true; } }, 'Service shuts down', 15000);
  await until(() => {
    try { process.kill(projector.obsProcessId, 0); return false; }
    catch (error) { if (error.code === 'ESRCH') return true; throw error; }
  }, 'Owned OBS process exits', 15000);
  checks.push('normal window close saves data and closes owned service/projector');
  // A newer legacy file must never overwrite data that this Release has already saved.
  seed.match.title = '旧项目后续变化'; await writeFile(path.join(source, 'data/state.json'), JSON.stringify(seed));
  application = await _electron.launch({ executablePath: executable, args: [], env, timeout: 45000 });
  page = await application.firstWindow({ timeout: 45000 });
  page.on('pageerror', error => errors.push(error.message));
  await until(async () => { try { return (await api('/api/health')).version === pkg.version; } catch { return false; } }, 'Restart ready');
  assert.equal((await api('/api/state')).match.title, 'Release 迁移验证');
  assert.ok((await api('/api/state')).customScenes.some(scene => scene.name === 'Release 场景验证'));
  await until(async () => { const status = await api('/api/obs/engine'); return status.connected && status.virtualCamActive === false && status.inputs.length > 0; }, 'OBS reconnects and confirms outputs after restart');
  const resumed = await api('/api/obs/engine');
  assert.equal(resumed.destination, 'douyin'); assert.equal(resumed.virtualCamActive, false);
  assert.equal(resumed.streamActive, false); assert.equal(resumed.recordActive, false);
  checks.push('restart remembers companion destination while all outputs remain stopped');
  checks.push('restart preserves custom scenes and never overwrites existing Release data from the old project');
  assert.deepEqual(errors, []);
  await application.close(); application = undefined;
  await writeFile(path.join(evidence, 'smoke-report.json'), JSON.stringify(report(), null, 2) + '\n');
  console.log(JSON.stringify(report(), null, 2));
} catch (error) {
  errors.push(error.message);
  await page?.screenshot({ path: path.join(evidence, 'release-failure.png') }).catch(() => {});
  await writeFile(path.join(evidence, 'smoke-report.json'), JSON.stringify(report(), null, 2) + '\n');
  throw error;
} finally {
  if (application) {
    // Cleanup is confined to this isolated test instance, including failures during asynchronous startup.
    await application.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); }).catch(() => {});
    await api('/api/obs/engine/output', { action: 'stop-virtual-camera' }, true).catch(() => {});
    await api('/api/obs/engine/output', { action: 'stop-record' }, true).catch(() => {});
    await application.evaluate(({ app }) => app.quit()).catch(() => {});
    await application.close().catch(() => {});
  }
}
