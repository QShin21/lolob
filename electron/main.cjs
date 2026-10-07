const { app, BrowserWindow, Menu, dialog, shell, ipcMain, screen } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const projectRoot = path.resolve(__dirname, '..');
const dev = process.env.RIFTCAST_DEV === '1';
const port = Number(process.env.PORT || 3888);
const serviceOrigin = `http://127.0.0.1:${port}`;
const rendererOrigin = dev ? 'http://127.0.0.1:5173' : serviceOrigin;
let mainWindow;
let serviceProcess;
let ownsService = false;
let quitting = false;
let stoppingService = false;
let logPath;
let exitApproved = false;
const nativePreviewSources = new Map();
const nativePositionRequests = new Map();
const closingProjectors = new Map();
let previewOperations = Promise.resolve();
let projectorHelperPromise;

function previewOperation(operation) {
  const pending = previewOperations.then(operation);
  previewOperations = pending.catch(() => {});
  return pending;
}

function rendererOriginMatches(value) {
  try { return new URL(value).origin === rendererOrigin; } catch { return false; }
}

function trustedRenderer(contents, frame) {
  if (!mainWindow || mainWindow.isDestroyed() || contents !== mainWindow.webContents) return false;
  if (frame && frame !== contents.mainFrame) return false;
  return rendererOriginMatches(frame ? frame.url : contents.getURL());
}

function monitorRequest(kind, open) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ kind, open });
    const req = http.request(`${serviceOrigin}/api/obs/engine/monitor`, {
      method: 'POST', timeout: 12000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let response = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        response += chunk;
        if (response.length > 8192) req.destroy(new Error('OBS 实时显示响应过大'));
      });
      res.on('end', () => {
        try {
          const data = JSON.parse(response);
          if (res.statusCode !== 200 || typeof data.projectorTitle !== 'string' || !data.projectorTitle || data.projectorTitle.length > 200) {
            reject(new Error('OBS 实时显示尚未就绪')); return;
          }
          resolve(data);
        } catch { reject(new Error('OBS 实时显示响应无效')); }
      });
      res.on('error', () => reject(new Error('OBS 实时显示连接失败')));
    });
    req.on('timeout', () => req.destroy(new Error('OBS 实时显示准备超时')));
    req.on('error', () => reject(new Error('OBS 实时显示连接失败')));
    req.end(body);
  });
}

async function projectorCommand(command, args) {
  projectorHelperPromise ??= require('../scripts/build-obs-projector-helper.cjs').ensureProjectorHelper();
  const executable = await projectorHelperPromise;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [command, ...args.map(String)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errorOutput = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('OBS 显示窗口管理超时')); }, 5000);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 65536) child.kill(); });
    child.stderr.on('data', chunk => { if (errorOutput.length < 4096) errorOutput += chunk; });
    child.once('error', () => { clearTimeout(timer); reject(new Error('OBS 显示窗口管理不可用')); });
    // A short native process can exit before Windows finishes draining stdout.
    // Wait for close so the complete JSON response has arrived.
    child.once('close', code => {
      clearTimeout(timer);
      try { if (code !== 0) throw new Error(); resolve(JSON.parse(output)); }
      catch {
        let reason = 'invalid_response';
        try {
          const value = JSON.parse(errorOutput || output).error;
          if (typeof value === 'string' && /^[a-z0-9_-]{1,100}$/.test(value)) reason = value;
        } catch {}
        log(`OBS 显示窗口管理失败：${command}，返回码 ${code ?? 'unknown'}，原因 ${reason}`);
        reject(new Error('OBS 显示窗口管理失败'));
      }
    });
  });
}

function nativeHostHandle() {
  const handle = mainWindow.getNativeWindowHandle();
  return String(handle.length === 8 ? handle.readBigUInt64LE() : handle.readUInt32LE());
}

function nativePreviewBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') throw new Error('OBS 显示区域无效');
  const values = ['x', 'y', 'width', 'height'].map(key => bounds[key]);
  if (!values.every(value => typeof value === 'number' && Number.isFinite(value)) ||
      bounds.x < 0 || bounds.y < 0 || bounds.width < 32 || bounds.height < 18) throw new Error('OBS 显示区域无效');
  const viewport = [bounds.viewportWidth, bounds.viewportHeight, bounds.devicePixelRatio];
  if (!viewport.every(value => typeof value === 'number' && Number.isFinite(value) && value > 0) ||
      bounds.viewportWidth > 16384 || bounds.viewportHeight > 16384) throw new Error('OBS 工作台尺寸无效');
  const zoom = mainWindow.webContents.getZoomFactor();
  const content = mainWindow.getContentBounds();
  if (bounds.viewportWidth > content.width / zoom + 1 || bounds.viewportHeight > content.height / zoom + 1 ||
      bounds.x + bounds.width > bounds.viewportWidth + 1 || bounds.y + bounds.height > bounds.viewportHeight + 1) throw new Error('OBS 显示区域超出工作台');
  const scale = screen.getDisplayMatching(mainWindow.getBounds()).scaleFactor * zoom;
  if (Math.abs(bounds.devicePixelRatio - scale) > 0.05) throw new Error('工作台显示缩放正在更新，请稍后重试');
  return { x: Math.round(bounds.x * scale), y: Math.round(bounds.y * scale), width: Math.round(bounds.width * scale), height: Math.round(bounds.height * scale),
    viewportWidth: Math.round(bounds.viewportWidth * scale), viewportHeight: Math.round(bounds.viewportHeight * scale) };
}

async function embedProjector(prepared, bounds) {
  const area = nativePreviewBounds(bounds);
  return projectorCommand('embed', ['--pid', prepared.obsProcessId, '--kind', prepared.kind, '--hwnd', prepared.hwnd,
    '--host-hwnd', nativeHostHandle(), '--host-pid', process.pid,
    '--x', area.x, '--y', area.y, '--width', area.width, '--height', area.height,
    '--viewport-width', area.viewportWidth, '--viewport-height', area.viewportHeight]);
}

async function closeProjector(prepared) {
  closingProjectors.set(prepared.kind, prepared);
  const deadline = Date.now() + 3000;
  try {
    while (Date.now() < deadline) {
      const result = await projectorCommand('close', ['--pid', prepared.obsProcessId, '--kind', prepared.kind, '--hwnd', prepared.hwnd]);
      if (result.closed) {
        if (closingProjectors.get(prepared.kind) === prepared) closingProjectors.delete(prepared.kind);
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } catch { /* A disconnected OBS may already have closed the projector. */ }
  return false;
}

function installPreviewBridge() {
  // Only the two projector windows owned by the embedded OBS can enter this host.
  ipcMain.handle('riftcast:choose-path', async (event, kind) => {
    if (!trustedRenderer(event.sender, event.senderFrame) || !['game','lockfile'].includes(kind)) throw new Error('无效的路径选择请求');
    const result = await dialog.showOpenDialog(mainWindow, {title:kind==='game'?'选择英雄联盟安装目录':'选择客户端 lockfile',properties:[kind==='game'?'openDirectory':'openFile']});
    return result.canceled ? null : result.filePaths[0] || null;
  });
  ipcMain.handle('riftcast:open-logs', async event => {
    if (!trustedRenderer(event.sender,event.senderFrame)) throw new Error('无效的日志请求');
    return shell.openPath(logPath);
  });
  ipcMain.handle('riftcast-preview:release', (event, kind) => {
    if (!trustedRenderer(event.sender, event.senderFrame) || !['preview', 'program'].includes(kind)) return;
    // Cancel queued layout updates before waiting for the native operation queue.
    nativePositionRequests.delete(kind);
    return previewOperation(async () => {
      const prepared = nativePreviewSources.get(kind);
      nativePreviewSources.delete(kind);
      if (prepared) await closeProjector(prepared);
    });
  });
  ipcMain.handle('riftcast-preview:embed', (event, kind, bounds) => previewOperation(async () => {
    if (!trustedRenderer(event.sender, event.senderFrame) || !['preview', 'program'].includes(kind)) throw new Error('OBS 显示请求无效');
    nativePreviewBounds(bounds);
    const metadata = await monitorRequest(kind, false);
    if (!Number.isInteger(metadata.obsProcessId) || metadata.obsProcessId < 1) throw new Error('原生实时显示需要内置 OBS 引擎');
    const closing = closingProjectors.get(kind);
    if (closing?.obsProcessId === metadata.obsProcessId && !await closeProjector(closing)) throw new Error('OBS 显示窗口正在关闭，请稍后重试');
    if (closing && closing.obsProcessId !== metadata.obsProcessId) closingProjectors.delete(kind);
    const tracked = nativePreviewSources.get(kind);
    if (tracked?.obsProcessId === metadata.obsProcessId) {
      if (!trustedRenderer(event.sender, event.senderFrame) || quitting) throw new Error('工作台已关闭');
      try { await embedProjector(tracked, bounds); }
      catch (error) {
        // An OBS projector can disappear without changing the process id.
        // Discard its stale handle so the next acquisition can open a display.
        if (nativePreviewSources.get(kind) === tracked) {
          nativePreviewSources.delete(kind);
          await closeProjector(tracked);
        }
        throw error;
      }
      tracked.bounds = { ...bounds };
      return { fps: metadata.fps, transport: 'native' };
    }
    if (tracked) { nativePreviewSources.delete(kind); await closeProjector(tracked); }
    const titles = Array.isArray(metadata.projectorTitles) ? metadata.projectorTitles : [metadata.projectorTitle];
    const find = () => projectorCommand('find', ['--pid', metadata.obsProcessId, '--kind', kind]);
    const existingWindows = (await find()).windows;
    const previousHandles = new Set(existingWindows.map(candidate => String(candidate.hwnd)));
    const matches = candidate => candidate.kind === kind && titles.includes(candidate.title);
    const prepare = candidate => ({ kind, obsProcessId: metadata.obsProcessId, hwnd: String(candidate.hwnd), bounds: { ...bounds }, transport: 'native' });
    let projector = existingWindows.find(matches);
    let opened = false;
    let prepared;
    const restoreFocus = mainWindow.isFocused();
    try {
      if (!projector) {
        // The renderer can leave while OBS creates the window. Keep the
        // pre-open inventory so cancellation can reclaim only this new display.
        opened = true;
        await monitorRequest(kind, true);
      }
      const deadline = Date.now() + 6000;
      while (!projector && Date.now() < deadline) {
        if (!trustedRenderer(event.sender, event.senderFrame) || quitting) throw new Error('工作台已关闭');
        projector = (await find()).windows.find(matches);
        if (!projector) await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!projector) throw new Error('OBS 原生显示尚未就绪');
      prepared = prepare(projector);
      if (!trustedRenderer(event.sender, event.senderFrame) || quitting) throw new Error('工作台已关闭');
      await embedProjector(prepared, bounds);
      nativePreviewSources.set(kind, prepared);
      if (restoreFocus) mainWindow.focus();
      return { fps: metadata.fps, transport: 'native' };
    } catch (error) {
      if (prepared) await closeProjector(prepared);
      else if (opened) {
        // No handle was registered yet. A queued OBS UI operation may finish
        // shortly after cancellation; do not leave its top-level window behind.
        const cleanupDeadline = Date.now() + 1500;
        try {
          while (Date.now() < cleanupDeadline) {
            const candidate = (await find()).windows.find(value => matches(value) && !previousHandles.has(String(value.hwnd)) &&
              ![...nativePreviewSources.values()].some(source => source.obsProcessId === metadata.obsProcessId && source.hwnd === String(value.hwnd)));
            if (candidate) { await closeProjector(prepare(candidate)); break; }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch { /* An exited owned OBS has already reclaimed its windows. */ }
      }
      throw error;
    }
  }));
  ipcMain.handle('riftcast-preview:position', (event, kind, bounds) => {
    if (!trustedRenderer(event.sender, event.senderFrame) || !['preview', 'program'].includes(kind)) throw new Error('OBS 显示请求无效');
    const prepared = nativePreviewSources.get(kind);
    if (!prepared) return;
    const pending = nativePositionRequests.get(kind);
    if (pending?.prepared === prepared) {
      pending.event = event;
      pending.bounds = { ...bounds };
      pending.dirty = true;
      return pending.promise;
    }
    const request = { event, prepared, bounds: { ...bounds }, dirty: true };
    nativePositionRequests.set(kind, request);
    request.promise = previewOperation(async () => {
      try {
        // Window resizing can publish many rectangles while one helper runs.
        // Keep only the latest rectangle, with one operation per monitor.
        while (nativePositionRequests.get(kind) === request && nativePreviewSources.get(kind) === prepared && request.dirty) {
          if (!trustedRenderer(request.event.sender, request.event.senderFrame) || quitting) break;
          const nextBounds = request.bounds;
          request.dirty = false;
          await embedProjector(prepared, nextBounds);
          if (nativePositionRequests.get(kind) === request && nativePreviewSources.get(kind) === prepared &&
              trustedRenderer(request.event.sender, request.event.senderFrame)) prepared.bounds = nextBounds;
        }
      } catch (error) {
        if (nativePreviewSources.get(kind) === prepared && nativePositionRequests.get(kind) === request) {
          // A native child must never remain at stale coordinates over another UI.
          nativePreviewSources.delete(kind);
          nativePositionRequests.delete(kind);
          await closeProjector(prepared);
        }
        throw error;
      } finally {
        if (nativePositionRequests.get(kind) === request) nativePositionRequests.delete(kind);
      }
    });
    return request.promise;
  });
  mainWindow.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (!isMainFrame || isInPlace) return;
    nativePositionRequests.clear();
    void previewOperation(async () => {
      const projectors = [...nativePreviewSources.values()];
      nativePreviewSources.clear();
      for (const projector of projectors) await closeProjector(projector);
    });
  });
}

function engineStatus() {
  return new Promise((resolve) => {
    const req = http.get(`${serviceOrigin}/api/obs/engine`, { timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; if (body.length > 65536) req.destroy(); });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

function redact(value) {
  return String(value)
    .replace(/(["'](?:password|token|secret|authorization|obsPassword)["']\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[已隐藏]"')
    .replace(/(authorization\s*[:=]\s*)(?:Basic|Bearer)\s+\S+/gi, '$1[已隐藏]')
    .replace(/((?:password|token|secret|authorization|obsPassword)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[已隐藏]')
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[已隐藏]@');
}

function log(message) {
  const entry = `[${new Date().toISOString()}] ${redact(message)}\n`;
  try { if (logPath) fs.appendFileSync(logPath, entry, 'utf8'); } catch { /* Logging must not prevent shutdown. */ }
  process.stdout.write(entry);
}

function health() {
  return new Promise((resolve) => {
    const req = http.get(`${serviceOrigin}/api/health`, { timeout: 900 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 8192) { req.destroy(); resolve({ available: true, ours: false }); }
      });
      res.on('end', () => {
        try {
          const payload = JSON.parse(body);
          resolve({ available: true, ours: res.statusCode === 200 &&
            (payload.service === 'riftcast-director' || payload.app === 'riftcast-director'),
            lanEnabled: payload.lanEnabled === true });
        } catch { resolve({ available: true, ours: false }); }
      });
      res.on('error', () => resolve({ available: true, ours: false }));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ available: false, ours: false }));
  });
}

async function ensureService() {
  const existing = await health();
  if (existing.ours) {
    if (process.env.ENABLE_LAN === '1' && !existing.lanEnabled) {
      throw new Error('已有 RiftCast 服务仅允许本机访问。请先关闭原服务，再用 -Lan 重新启动以开启局域网。');
    }
    log('复用已运行的 RiftCast 服务；关闭桌面窗口会保留该服务。');
    return;
  }
  if (existing.available) throw new Error(`端口 ${port} 已被其他服务占用，请先释放端口或用 PORT 指定其他端口。`);
  if (!fs.existsSync(path.join(projectRoot, 'node_modules', 'tsx'))) {
    throw new Error('缺少项目依赖。请在项目目录运行 npm install。');
  }
  // Electron becomes a Node runtime only with ELECTRON_RUN_AS_NODE=1.
  serviceProcess = spawn(process.execPath, ['--import', 'tsx', path.join(projectRoot, 'server', 'index.ts')], {
    cwd: projectRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production', PORT: String(port), RIFTCAST_OBS_AUTOSTART: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  ownsService = true;
  let startupError;
  let exited = false;
  serviceProcess.stdout.on('data', (chunk) => log(`服务: ${chunk.toString().trimEnd()}`));
  serviceProcess.stderr.on('data', (chunk) => log(`服务: ${chunk.toString().trimEnd()}`));
  serviceProcess.on('error', (error) => { startupError = error; log(`服务启动失败: ${error.message}`); });
  serviceProcess.on('exit', (code) => {
    exited = true;
    log(`本窗口启动的服务已退出，代码 ${code ?? 'unknown'}。`);
    if (!quitting && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'error', title: 'RiftCast 服务已停止',
        message: '本地数据服务已停止，请关闭窗口后重新启动。',
        detail: `日志位置：${logPath}`, buttons: ['知道了'],
      });
    }
  });
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (exited) throw new Error('本地数据服务启动后立即退出。');
    if ((await health()).ours) { log('本地数据服务已就绪。'); return; }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error('等待本地数据服务超时，请查看日志。');
}

function stopOwnedService() {
  if (!ownsService || !serviceProcess || serviceProcess.exitCode !== null || serviceProcess.killed) return Promise.resolve();
  const ownedProcess = serviceProcess;
  log('正在保存数据并停止本窗口启动的本地数据服务。');
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve();
    };
    const terminate = () => {
      if (!ownedProcess.killed) ownedProcess.kill('SIGTERM');
      finish();
    };
    const timeout = setTimeout(() => {
      log('服务关闭等待超时，正在结束本窗口启动的服务进程。');
      terminate();
    }, 55000);
    ownedProcess.once('exit', finish);
    if (ownedProcess.connected) {
      try { ownedProcess.send({ type: 'riftcast-shutdown' }, (error) => { if (error) terminate(); }); }
      catch { terminate(); }
    } else terminate();
  });
}

function openExternal(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    if (parsed.username || parsed.password) return;
    shell.openExternal(parsed.href).catch((error) => log(`打开链接失败: ${error.message}`));
  } catch { /* Ignore malformed or unsupported URLs. */ }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600, height: 1000, minWidth: 1080, minHeight: 720,
    title: 'RiftCast · 英雄联盟赛事导播', backgroundColor: '#080c12', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  installPreviewBridge();
  mainWindow.webContents.session.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
    if (!trustedRenderer(contents) || !details.isMainFrame) return false;
    return permission === 'clipboard-sanitized-write' && rendererOriginMatches(requestingOrigin);
  });
  mainWindow.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(trustedRenderer(contents) && details.isMainFrame !== false &&
      (!details.securityOrigin || rendererOriginMatches(details.securityOrigin)) &&
      (!details.requestingUrl || rendererOriginMatches(details.requestingUrl)) &&
      permission === 'clipboard-sanitized-write');
  });
  mainWindow.webContents.once('did-finish-load', () => log(`导播界面已载入：${rendererOrigin}`));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin === rendererOrigin) return;
    } catch { /* Navigation is blocked below. */ }
    event.preventDefault();
    openExternal(url);
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3 || quitting) return;
    log(`界面载入失败，错误代码 ${code}。`);
    dialog.showMessageBox(mainWindow, { type: 'error', title: '界面载入失败',
      message: dev ? '请先运行 npm run dev，确保 5173 界面服务正在运行。' : '请运行 npm run build 后重新启动。',
      detail: `日志位置：${logPath}`, buttons: ['知道了'] });
    mainWindow.show();
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // A Windows launcher with SW_HIDE can suppress the process's first show.
    // Repeat on the next task so the desktop host is actually available to OBS.
    setImmediate(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show(); });
  });
  mainWindow.on('close', (event) => {
    if (exitApproved || quitting || !ownsService) return;
    event.preventDefault();
    void engineStatus().then(async (status) => {
      if (!status || (status.mode === 'embedded' && (status.streamActive || status.recordActive || (status.running && !status.connected)))) {
        const answer = await dialog.showMessageBox(mainWindow, {
          type: 'question', title: '确认退出导播', message: status?.connected ? '退出导播软件会停止当前推流和录制。' : '引擎状态暂时无法确认。退出会关闭本软件启动的 OBS 并停止其输出。',
          buttons: ['返回导播', '停止输出并退出'], defaultId: 0, cancelId: 0,
        });
        if (answer.response !== 1) return;
      }
      exitApproved = true;
      app.quit();
    });
  });
  mainWindow.on('closed', () => {
    const projectors = [...nativePreviewSources.values()];
    nativePositionRequests.clear();
    nativePreviewSources.clear();
    mainWindow = undefined;
    void previewOperation(async () => { for (const projector of projectors) await closeProjector(projector); });
  });
  const menu = Menu.buildFromTemplate([
    { label: '导播', submenu: [
      { label: '在浏览器打开控制台', click: () => openExternal(rendererOrigin) },
      { label: '打开输出画面', click: () => openExternal(`${serviceOrigin}/overlay`) },
      { type: 'separator' }, { role: 'quit', label: '退出' },
    ] },
    { label: '视图', submenu: [
      { role: 'reload', label: '刷新' }, { role: 'togglefullscreen', label: '全屏' },
      ...(dev ? [{ role: 'toggleDevTools', label: '开发者工具' }] : []),
    ] },
    { label: '帮助', submenu: [
      { label: 'RiftCast 0.4.0 · 使用指南与快捷键', click: () => mainWindow.webContents.executeJavaScript("location.hash='help'") },
      { label: '显示模式说明', click: () => dialog.showMessageBox(mainWindow,{type:'info',title:'节目与预监显示',message:'节目使用 OBS 原生投影；普通监视使用每秒快照。',detail:'原生动态预监在制作台镜头设置中启用。HUD 排版示意用于检查文字布局。'}) },
      { label: '打开启动日志', click: () => shell.openPath(logPath).catch((error) => log(error.message)) },
      { label: 'Riot 接口文档', click: () => openExternal('https://developer.riotgames.com/docs/lol') },
      { label: 'OBS 开源许可与来源', click: () => shell.openPath(path.join(projectRoot, 'THIRD_PARTY_OBS.md')).catch((error) => log(error.message)) },
    ] },
  ]);
  Menu.setApplicationMenu(menu);
  mainWindow.loadURL(rendererOrigin).catch((error) => log(`界面载入失败: ${error.message}`));
}

const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  });
  app.on('before-quit', (event) => {
    if (!exitApproved && ownsService && mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault();
      mainWindow.close();
      return;
    }
    quitting = true;
    if (ownsService && serviceProcess && serviceProcess.exitCode === null) {
      event.preventDefault();
      if (stoppingService) return;
      stoppingService = true;
      stopOwnedService().finally(() => { ownsService = false; app.quit(); });
    }
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    app.setAppUserModelId('cn.riftcast.director');
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    logPath = path.join(logDir, 'director.log');
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 3 * 1024 * 1024) {
      fs.copyFileSync(logPath, `${logPath}.previous`);
      fs.writeFileSync(logPath, '', 'utf8');
    }
    try {
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 需要是 1 至 65535 的整数。');
      if (!dev && !fs.existsSync(path.join(projectRoot, 'dist', 'index.html'))) {
        throw new Error('缺少已构建的界面，请先在项目目录运行 npm run build。');
      }
      await require('../scripts/ensure-obs.cjs').ensureObs({ onProgress: log });
      await ensureService();
      createWindow();
    } catch (error) {
      log(`启动失败: ${error.message}`);
      dialog.showErrorBox('RiftCast 启动失败', `${error.message}\n\n日志位置：${logPath}`);
      app.quit();
    }
  }).catch((error) => { dialog.showErrorBox('RiftCast 启动失败', redact(error.message)); app.quit(); });
}
