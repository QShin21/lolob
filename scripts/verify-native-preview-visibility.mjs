// Isolated UI regression; --desktop additionally exercises owned OBS HWNDs
// through the production Electron bridge. No operator state or output is used.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, link, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tsImport } from 'tsx/esm/api';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = process.argv.includes('--desktop');
const baseline = process.argv.includes('--baseline');
const evidence = path.join(root, 'verification-output', 'native-preview-visibility', baseline ? 'baseline' : desktop ? 'desktop' : 'browser');
await mkdir(evidence, { recursive: true });
const sandbox = await mkdtemp(path.join(evidence, 'isolated-'));
const { chromium, _electron } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
const { createSeed } = await tsImport('../server/state.ts', import.meta.url);
const state = createSeed();
state.connections.obs.status = 'connected';
const checks = [], errors = [];
let browser, electron, page, engine, obs, vite, obsProcessId;
const runFile = promisify(execFile);
const helper = path.join(root, 'scripts/bin/obs-projector-window.exe');
const until = async (fn, label, timeout = 12000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(label);
};
const json = (res, data, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};
const entryPath = path.join(root, '_native-preview-visibility-fixture.tsx').replaceAll('\\', '/');
const entry = `
import React, {useState} from 'react';import {createRoot} from 'react-dom/client';
import {ObsLivePreview} from '/src/components/ObsLivePreview.tsx';
import {CustomSceneEditor} from '/src/components/CustomSceneEditor.tsx';
import '/src/styles.css';import '/src/ui-theme.css';
const state=${JSON.stringify(state)};
function Fixture(){
  const [enabled,setEnabled]=useState(true),[editor,setEditor]=useState(false),[dynamic,setDynamic]=useState(false);
  return <><nav style={{position:'fixed',top:8,right:16,zIndex:10,display:'flex',gap:12}}>
    <button onClick={()=>setEditor(true)}>新建自定义场景</button>
    <button onClick={()=>setEnabled(e=>!e)}>切换预览</button>
    <button onClick={()=>setDynamic(e=>!e)}>切换动态预监</button>
  </nav><div id="preview-host" style={{width:640,marginLeft:40,marginTop:120}}>
    <ObsLivePreview kind="program" purpose="program" connected enabled={enabled}/>
  </div>{dynamic&&<div id="dynamic-host" style={{position:'absolute',width:360,left:740,top:150}}>
    <ObsLivePreview kind="preview" purpose="dynamic" connected/>
  </div>}{editor&&<CustomSceneEditor state={state} send={async()=>{}} notify={()=>{}} onClose={()=>setEditor(false)}/>}</>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (url.pathname === '/api/health') return json(res, { service: 'riftcast-director' });
    if (url.pathname === '/api/obs/engine') return json(res, engine ? await engine.status() : { mode: 'embedded', connected: true, performance: { activeFps: 60 } });
    if (url.pathname === '/api/obs/engine/monitor' && engine) {
      let body = ''; for await (const chunk of req) body += chunk;
      return json(res, await engine.monitor(JSON.parse(body)));
    }
    if (url.pathname === '/api/obs/custom-sources') return json(res, { windows: [], inputs: [] });
    if (url.pathname === '/overlay') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<html><body style="margin:0;background:#123942;color:#b1ffe5;font:72px sans-serif"><p>RiftCast native preview fixture</p></body></html>');
    }
    if (url.pathname === '/') {
      res.setHeader('content-type', 'text/html');
      return res.end(await vite.transformIndexHtml('/', '<html><head><meta charset="utf-8"/></head><body style="margin:0;min-height:2400px"><div id="root"></div><script type="module" src="/_native-preview-visibility-fixture.tsx"></script></body></html>'));
    }
    vite.middlewares(req, res, () => { res.statusCode = 404; res.end(); });
  } catch (error) { json(res, { error: error.message }, 500); }
});
const connections = new Set();
server.on('connection', socket => { connections.add(socket); socket.once('close', () => connections.delete(socket)); });
async function linkTree(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const file of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, file.name), to = path.join(destination, file.name);
    if (file.isDirectory()) await linkTree(from, to); else if (file.isFile()) await link(from, to);
  }
}
async function projectors() {
  const { stdout } = await runFile(helper, ['list', '--pid', String(obsProcessId)], { windowsHide: true, encoding: 'utf8' });
  return JSON.parse(stdout).windows;
}
async function active(kind = 'program') {
  if (desktop) return (await projectors()).filter(window => window.kind === kind && window.visible);
  return page.evaluate(kind => window.__native.active[kind] ? [window.__native.active[kind]] : [], kind);
}
async function absent(kind = 'program') { await until(async () => !(await active(kind)).length, `${kind} projector released`); }
async function present(kind = 'program') {
  await until(async () => (await active(kind)).length === 1, `${kind} projector restored`);
  await page.locator(`.native-preview[data-kind="${kind}"].phase-live`).waitFor();
}
async function openEditor() { await page.getByRole('button', { name: '新建自定义场景', exact: true }).click(); await page.getByRole('dialog').waitFor(); }
async function closeEditor() { await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'detached' }); }

try {
  const oldPreview = baseline ? execFileSync('git', ['show', 'HEAD:src/components/ObsLivePreview.tsx'], { cwd: root, encoding: 'utf8' }) : undefined;
  vite = await createServer({ root, configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: { server }, watch: { ignored: ['**/verification-output/**', '**/runtime/**', '**/data/**'] } }, plugins: [react(), {
    name: 'native-preview-visibility-fixture',
    resolveId: id => id === '/_native-preview-visibility-fixture.tsx' ? entryPath : undefined,
    load: id => id === entryPath ? entry : oldPreview && id === path.join(root, 'src/components/ObsLivePreview.tsx').replaceAll('\\', '/') ? oldPreview : undefined,
  }] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  if (desktop) {
    const runtime = path.join(sandbox, 'runtime/obs-studio'), dataDir = path.join(sandbox, 'engine-data');
    for (const folder of ['bin', 'data', 'obs-plugins']) await linkTree(path.join(root, 'runtime/obs-studio', folder), path.join(runtime, folder));
    await writeFile(path.join(runtime, '.riftcast-runtime.json'), JSON.stringify({ version: '32.2.2' }));
    await mkdir(dataDir);
    await writeFile(path.join(dataDir, 'obs-engine.json'), JSON.stringify({ mode: 'embedded', selection: { gameWindow: 'RiftCast fixture:fixture:nonexistent.exe', desktopDevice: 'default', micDevice: 'default', micEnabled: false, outputFps: 30 } }));
    const { ObsClient } = await tsImport('../server/obs-client.ts', import.meta.url);
    const { ObsEngine } = await tsImport('../server/obs-engine.ts', import.meta.url);
    obs = new ObsClient();
    engine = new ObsEngine(obs, { root: sandbox, dataDir, overlayUrl: origin + '/overlay', onConnection() {} });
    await engine.initialize(); await engine.start();
    obsProcessId = (await engine.monitor({ kind: 'program', open: false })).obsProcessId;
    const desktopEntry = path.join(sandbox, 'desktop-fixture.cjs');
    await mkdir(path.join(sandbox, 'electron-data'));
    await writeFile(desktopEntry, `const {app}=require('electron');app.setPath('userData',${JSON.stringify(path.join(sandbox, 'electron-data'))});require(${JSON.stringify(path.join(root, 'electron/main.cjs'))});`);
    electron = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'), args: [desktopEntry], env: { ...process.env, PORT: String(server.address().port), RIFTCAST_DEV: '0' }, timeout: 30000 });
    page = await electron.firstWindow();
  } else {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.addInitScript(() => {
      window.__native = { active: {}, calls: [], delay: null, pending: null };
      window.riftcastPreview = {
        embed: async (kind, bounds) => {
          window.__native.calls.push({ method: 'embed', kind, bounds });
          if (window.__native.delay === 'embed') { window.__native.delay = null; await new Promise(resolve => window.__native.pending = resolve); window.__native.pending = null; }
          window.__native.active[kind] = bounds;
          return { fps: 60, transport: 'native' };
        },
        position: async (kind, bounds) => {
          window.__native.calls.push({ method: 'position', kind, bounds });
          if (window.__native.delay === 'position') { window.__native.delay = null; await new Promise(resolve => window.__native.pending = resolve); window.__native.pending = null; }
          window.__native.active[kind] = bounds;
        },
        release: async kind => { window.__native.calls.push({ method: 'release', kind }); delete window.__native.active[kind]; },
      };
    });
    await page.goto(origin);
  }
  page.on('pageerror', error => errors.push(error.message));
  await present();
  checks.push('fully visible program acquires exactly one projector');
  await openEditor();
  await absent();
  await page.getByRole('dialog').evaluate(dialog => dialog.scrollTop = 350);
  await page.waitForTimeout(650);
  assert.equal((await active()).length, 0, 'dialog scroll must not restore program');
  await page.screenshot({ path: path.join(evidence, 'custom-scene-dialog.png') });
  await closeEditor(); await present();
  checks.push('actual CustomSceneEditor opening/scrolling releases program; closing restores it');

  for (const scroll of [200, 1100]) {
    await page.evaluate(y => window.scrollTo(0, y), scroll); await absent();
    await page.waitForTimeout(450);
    assert.equal((await active()).length, 0, 'partly/fully clipped program stays released');
    await page.evaluate(() => window.scrollTo(0, 0)); await present();
  }
  checks.push('partial and complete page scroll release without squeezing; scrolling back restores');
  await page.locator('#preview-host').evaluate(host => { host.style.height = '160px'; host.style.overflow = 'hidden'; });
  await absent();
  await page.locator('#preview-host').evaluate(host => { host.style.height = ''; host.style.overflow = ''; });
  await present();
  checks.push('clipping ancestor releases native surface');
  await page.evaluate(() => {
    const rect = document.querySelector('.obs-native-surface').getBoundingClientRect();
    const cover = document.createElement('div'); cover.id = 'test-cover';
    Object.assign(cover.style, { position: 'fixed', left: `${rect.x + rect.width / 2 - 20}px`, top: `${rect.y + rect.height / 2 - 20}px`, width: '40px', height: '40px', background: 'red', zIndex: 99999 });
    document.body.append(cover);
  });
  await absent(); await page.locator('#test-cover').evaluate(cover => cover.remove()); await present();
  checks.push('occluding control releases native surface and removal restores it');
  await page.locator('#preview-host').evaluate(host => host.hidden = true); await absent();
  await page.locator('#preview-host').evaluate(host => host.hidden = false); await present();
  checks.push('preserved hidden page releases and restores projector');
  await page.getByRole('button', { name: '切换预览', exact: true }).click(); await absent();
  await page.getByRole('button', { name: '切换预览', exact: true }).click(); await present();
  checks.push('explicit pause releases and resume restores projector');
  await page.getByRole('button', { name: '切换动态预监', exact: true }).click(); await present('preview');
  await openEditor(); await absent(); await absent('preview');
  await closeEditor(); await present(); await present('preview');
  await page.getByRole('button', { name: '切换动态预监', exact: true }).click(); await absent('preview');
  checks.push('modal also suspends and restores optional native dynamic preview');
  if (!desktop) {
    await page.locator('#preview-host').evaluate(host => host.style.marginTop = '180px');
    await until(async () => Math.abs((await active())[0]?.y - 214) < 1, 'layout shift repositions native display');
    const positionCount = await page.evaluate(() => window.__native.calls.filter(call => call.method === 'position').length);
    await page.waitForTimeout(650);
    assert.equal(await page.evaluate(() => window.__native.calls.filter(call => call.method === 'position').length), positionCount, 'unchanged layout must not issue native positioning work');
    checks.push('ancestor layout shifts reposition, unchanged geometry avoids redundant IPC');
    for (const method of ['embed', 'position']) {
      if (method === 'embed') { await page.getByRole('button', { name: '切换预览', exact: true }).click(); await absent(); }
      await page.evaluate(method => window.__native.delay = method, method);
      if (method === 'embed') await page.getByRole('button', { name: '切换预览', exact: true }).click();
      else await page.locator('#preview-host').evaluate(host => host.style.marginTop = '220px');
      await until(() => page.evaluate(() => !!window.__native.pending), `delayed ${method} started`);
      await openEditor(); await page.evaluate(() => window.__native.pending()); await absent();
      await page.waitForTimeout(650); assert.equal((await active()).length, 0, 'late IPC must not leave a projector over dialog');
      await closeEditor(); await present();
      checks.push(`dialog during pending ${method} releases late window and restores after close`);
    }
  } else {
    const owned = (await active())[0];
    assert.ok((owned.style & 0x40000000) !== 0, 'program is an embedded native child');
    assert.ok((owned.exStyle & 0x8) === 0, 'program is not topmost');
    assert.equal((await obs.call('GetStreamStatus')).outputActive, false);
    assert.equal((await obs.call('GetRecordStatus')).outputActive, false);
    checks.push('real HWND child styles verified; actual OBS streaming/recording remained off');
    // Renderer destruction must reclaim the HWND independently of visibility.
    await page.evaluate(() => document.getElementById('root').remove()); await absent();
    checks.push('detached renderer surface releases actual native window');
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify({ status: 'passed', runAt: new Date().toISOString(), desktop, checks, errors, obsVersion: desktop ? (await obs.call('GetVersion')).obsVersion : null, boundary: desktop ? 'Real isolated OBS/Electron/projector HWND lifecycle with actual preview/editor components and production sandbox settings. No operator data, real game, RTMP or recording.' : 'Browser component regression with mocked desktop IPC, including delayed embed/position. No OBS or native pixels.' }, null, 2));
  await rm(path.join(evidence, 'failure.json'), { force: true }); await rm(path.join(evidence, 'failure.png'), { force: true });
  console.log(`Native preview visibility: ${checks.length} checks passed. ${evidence}`);
} catch (error) {
  await writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ message: error.message, checks, errors, desktop }, null, 2));
  await page?.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser?.close(); await electron?.close(); await engine?.close();
  await vite?.close();
  for (const socket of connections) socket.destroy();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  const absolute = path.resolve(sandbox);
  assert.ok(absolute.startsWith(evidence + path.sep) && path.basename(absolute).startsWith('isolated-'));
  await rm(absolute, { recursive: true, force: true });
}
