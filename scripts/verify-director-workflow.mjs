// Full console UI fixture: uses fresh in-memory state, an ephemeral local port,
// mock OBS replies and a mock desktop bridge. Never loads persisted state or starts OBS.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tsImport } from 'tsx/esm/api';
import { WebSocketServer, WebSocket } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createSeed, applyAction, fallbackChampions } = await tsImport('../server/state.ts', import.meta.url);
const { ObsPreviewStream } = await tsImport('../server/obs-preview-stream.ts', import.meta.url);
const { finalizeGame } = await tsImport('../server/game-results.ts', import.meta.url);
const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
const evidence = path.resolve(process.env.RIFTCAST_WORKFLOW_VERIFY_DIR || path.join(root, 'verification-output/workflow'));
await mkdir(evidence, { recursive: true });

let state = createSeed();
state.connections.obs = { status: 'connected', detail: 'Isolated OBS fixture' };
const baseline = structuredClone(state);
let champions = fallbackChampions();
try { champions = JSON.parse(await readFile(path.join(root, 'data/champions.json'), 'utf8')).champions; } catch {}
const engine = {
  mode: 'embedded', available: true, running: true, connected: true, version: 'UI fixture',
  streamActive: false, recordActive: false, sceneName: 'RiftCast 节目',
  inputs: [{ inputName: 'Fixture game', inputKind: 'game_capture' }],
  selection: { gameWindow: '', desktopDevice: 'default', micDevice: 'default', micEnabled: false, outputFps: 60 },
  capabilities: { gameWindows: [], audioOutputs: [], audioInputs: [] },
  performance: {
    available: true, configuredFps: 60, encoder: 'nvenc', hardwareEncoding: true, activeFps: 60,
    cpuUsage: 0, renderTimeMs: 1, sampleSeconds: 2,
    rendering: { frames: 0, percent: 0 }, encoding: { frames: 0, percent: 0 },
    network: { frames: 0, percent: 0, congestion: 0, bitrateKbps: 0, reconnecting: false }, issues: [],
  },
};
const actions = [];
const outputRequests = [];
let destinationApplications = 0;
const previewConnections = [];
const errors = [];
const layout = [];
const tests = [];
const entryPath = path.join(root, '_director-workflow-fixture.tsx').replaceAll('\\', '/');
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import App from '/src/App.tsx';
import '/src/styles.css';import '/src/director.css';import '/src/pages/management.css';import '/src/responsive.css';import '/src/studio-workflow.css';
createRoot(document.getElementById('root')).render(<App/>);`;
let vite;
const stateWss = new WebSocketServer({ noServer: true });
const previewWss = new WebSocketServer({ noServer: true });
// A tiny opaque raster is enough to exercise browser decode/acknowledgement.
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const previewStream = new ObsPreviewStream(async () => pixel);
const broadcast = () => {
  for (const socket of stateWss.clients) if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(state));
};
const json = (res, value, status = 200) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const readBody = async () => { let body = ''; for await (const chunk of req) body += chunk; return JSON.parse(body || '{}'); };
  try {
    if (url.pathname === '/api/action') {
      const action = await readBody(); actions.push(action); state = applyAction(state, action); broadcast(); json(res, state); return;
    }
    if (url.pathname === '/api/state') { json(res, state); return; }
    if (url.pathname === '/api/champions') { json(res, { version: '16.19.1', champions }); return; }
    if (url.pathname === '/api/obs/engine/output') {
      const body = await readBody(); outputRequests.push(body);
      if (body.action === 'start-stream' || body.action === 'stop-stream') engine.streamActive = body.action === 'start-stream';
      if (body.action === 'start-record' || body.action === 'stop-record') engine.recordActive = body.action === 'start-record';
      json(res, engine); return;
    }
    if (url.pathname === '/api/obs/engine/setup') { Object.assign(engine.selection, await readBody()); json(res, engine); return; }
    if (url.pathname === '/api/obs/stream/settings') {
      const body = await readBody(); destinationApplications++;
      // This is a fixture destination only; discard the form's test key immediately.
      json(res, { applied: true, server: body.server }); return;
    }
    if (url.pathname === '/api/obs/engine' || url.pathname === '/api/obs/engine/start') { json(res, engine); return; }
    if (url.pathname === '/api/obs/scenes') { json(res, { scenes: [{ sceneName: 'RiftCast 节目' }], currentProgramSceneName: 'RiftCast 节目' }); return; }
    if (url.pathname === '/api/obs/stream/status') {
      json(res, { outputActive: engine.streamActive, outputReconnecting: false, outputTimecode: '00:00:00', outputDuration: 0, outputBytes: 0, outputSkippedFrames: 0, outputTotalFrames: 0 }); return;
    }
    if (url.pathname === '/api/replay/diagnostics') { json(res, { status: 'waiting', detail: 'Isolated UI fixture', restartRequired: false, lastProbeAt: new Date().toISOString(), endpoints: [] }); return; }
    if (url.pathname === '/api/network') { json(res, { enabled: false, urls: [] }); return; }
    if (url.pathname === '/api/obs/cameras') { json(res, { devices: [] }); return; }
    if (url.pathname === '/api/replay/hud') { json(res, {}); return; }
    if (url.pathname.startsWith('/api/')) { json(res, { error: `Unimplemented isolated fixture: ${url.pathname}` }, 404); return; }
    if (url.pathname === '/' || url.pathname.startsWith('/overlay')) {
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/', '<!doctype html><html><head><meta charset="utf-8"/></head><body><div id="root"></div><script type="module" src="/_director-workflow-fixture.tsx"></script></body></html>')); return;
    }
    vite.middlewares(req, res, () => { res.statusCode = 404; res.end(); });
  } catch (error) { json(res, { error: error.message }, 400); }
});
server.on('upgrade', (req, socket, head) => {
  if (req.headers['sec-websocket-protocol'] === 'vite-hmr') return;
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/ws') {
    stateWss.handleUpgrade(req, socket, head, ws => ws.send(JSON.stringify(state))); return;
  }
  if (url.pathname === '/ws/obs-preview') {
    previewWss.handleUpgrade(req, socket, head, ws => {
      const record = { kind: url.searchParams.get('kind'), fps: 1, openedAt: Date.now(), closedAt: null, sentAt: [], acknowledged: 0 };
      previewConnections.push(record);
      const send = ws.send.bind(ws);
      ws.send = (...args) => { if (Buffer.isBuffer(args[0])) record.sentAt.push(Date.now()); return send(...args); };
      ws.on('message', message => { if (message.toString() === 'next') record.acknowledged++; });
      ws.on('close', () => { record.closedAt = Date.now(); });
      previewStream.attach(ws, record.kind);
    }); return;
  }
  socket.destroy();
});
// Keep Vite's development socket on this fixture's ephemeral HTTP server.
// It must not contend for the shared 24678 port used by other local fixtures.
vite = await createServer({
  root, configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: { server } },
  plugins: [react(), {
    name: 'director-workflow-fixture',
    resolveId: id => id === '/_director-workflow-fixture.tsx' ? entryPath : undefined,
    load: id => id === entryPath ? entry : undefined,
  }],
});

let browser;
let origin;
async function createPage(native = true) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.route('**/*', route => {
    if (route.request().url().startsWith(origin)) return route.continue();
    // Keep fixtures deterministic and avoid contacting Data Dragon or other sites.
    return route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
  });
  page.on('pageerror', error => errors.push(error.message));
  if (native) await page.addInitScript(() => {
    window.__nativeCalls = [];
    window.riftcastPreview = {
      embed: async (kind, bounds) => { window.__nativeCalls.push({ method: 'embed', kind, bounds }); return { fps: 60, transport: 'native' }; },
      release: async kind => { window.__nativeCalls.push({ method: 'release', kind }); },
      position: async (kind, bounds) => { window.__nativeCalls.push({ method: 'position', kind, bounds }); },
    };
  });
  await page.goto(origin);
  await page.locator('.monitor-pane.program').waitFor();
  await page.locator('.monitor-pane.program .obs-live-preview.phase-live').waitFor();
  await page.locator('.monitor-pane.preview .obs-live-preview.phase-live').waitFor();
  return page;
}
async function navigate(page, name) {
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(120);
}
async function assertNoHotkeyAction(page, name) {
  const before = actions.length;
  await page.locator('.page-heading h1').click();
  await page.keyboard.press('1'); await page.keyboard.press('t'); await page.keyboard.press('Enter');
  await page.waitForTimeout(160);
  assert.equal(actions.length, before, `Global scene shortcuts are inactive on ${name}`);
}
async function assertScreen(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(220);
  const bounds = await page.evaluate(() => {
    const measure = selector => {
      const e = document.querySelector(selector), r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth,
      program: measure('.monitor-pane.program'), preview: measure('.monitor-pane.preview'),
      shelf: measure('.studio-scene-shelf'), stage: measure('.studio-stage'),
      cards: [...document.querySelectorAll('.scene-card')].map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; }),
    };
  });
  layout.push(bounds);
  await page.screenshot({ path: path.join(evidence, `studio-${width}x${height}.png`) });
  assert.equal(bounds.cards.length, 11, 'All eleven scenes are available in one studio screen');
  assert.equal(await page.locator('.quick-scenes .scene-card').count(), 4);
  assert.equal(await page.locator('.studio-scene-shelf .scene-card').count(), 7);
  assert.ok(bounds.scrollWidth <= width + 1, `No horizontal overflow at ${width} × ${height}`);
  assert.ok(bounds.program.width > bounds.preview.width * 2, 'Program gets the largest frame');
  assert.ok(bounds.preview.width > Math.max(...bounds.cards.map(card => card.width)) * 1.3, 'Preview is larger than scene thumbnails');
  assert.ok(bounds.program.x < bounds.preview.x, 'Program is to the left of the preview');
  for (const [name, rect] of [['program', bounds.program], ['preview', bounds.preview], ['shelf', bounds.shelf], ...bounds.cards.map((card, i) => [`scene ${i + 1}`, card])]) {
    assert.ok(rect.width > 0 && rect.height > 0, `${name} is visible`);
    assert.ok(rect.x >= -1 && rect.right <= width + 1 && rect.y >= -1 && rect.bottom <= height + 1,
      `${name} fits ${width} × ${height}: ${JSON.stringify(rect)}`);
  }
}

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await createPage();
  await page.getByRole('navigation', { name: '转播流程' }).waitFor();
  assert.equal(await page.locator('[data-workflow-step]').count(), 4);
  assert.equal(outputRequests.length, 0, 'Opening the app does not start any output');
  const nativeCalls = await page.evaluate(() => window.__nativeCalls);
  assert.deepEqual(nativeCalls.filter(call => call.method === 'embed').map(call => call.kind), ['program'], 'Only program uses the native desktop projection');
  assert.ok(previewConnections.some(connection => connection.kind === 'preview' && connection.fps === 1), 'Preview requests one image per second');
  assert.equal(await page.locator('.monitor-pane.preview .obs-live-preview').getAttribute('data-cadence-ms'), '1000');
  tests.push('one native program surface; one-fps preview subscription; no startup output');
  const screenFailures = [];
  for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768]]) {
    try { await assertScreen(page, width, height); } catch (error) { screenFailures.push(error.message); }
  }
  await writeFile(path.join(evidence, 'layout.json'), JSON.stringify({ layout, screenFailures }, null, 2));
  assert.deepEqual(screenFailures, [], 'Studio frames all fit a single screen');
  tests.push('largest program left, medium preview right, four quick scenes right and seven scenes below fit 1920×1080 / 1440×900 / 1366×768');
  await page.keyboard.press('t');
  await page.waitForFunction(() => document.querySelector('.monitor-pane.preview .monitor-label').textContent.includes('团战视图'));
  assert.equal(state.previewScene, 'teamfight'); assert.equal(state.programScene, baseline.programScene);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.monitor-pane.program .monitor-label').textContent.includes('团战视图'));
  assert.equal(state.programScene, 'teamfight');
  await page.keyboard.press('2'); await page.waitForTimeout(100);
  assert.equal(state.previewScene, 'draft'); assert.equal(state.programScene, 'teamfight');
  await page.locator('.take-button').click(); await page.waitForTimeout(100);
  assert.equal(state.programScene, 'draft');
  tests.push('T / numbers select preview only; Enter and explicit take update program');

  const liveCard=page.locator('.scene-card').filter({has:page.locator('.scene-thumbnail kbd').filter({hasText:/^4$/})});
  await liveCard.click(); await page.waitForTimeout(100);
  assert.equal(state.previewScene,'live');
  assert.equal(await liveCard.evaluate(e=>e===document.activeElement),true);
  let takes=actions.filter(action=>action.type==='take').length;
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  assert.equal(state.programScene,'live');
  assert.equal(actions.filter(action=>action.type==='take').length,takes+1,'Focused card Enter takes exactly once');
  await page.keyboard.press('t'); await page.waitForTimeout(100);
  takes=actions.filter(action=>action.type==='take').length;
  await page.keyboard.press('NumpadEnter'); await page.waitForTimeout(100);
  assert.equal(state.programScene,'teamfight','Focused old card takes current preview after keyboard selection');
  assert.equal(state.previewScene,'teamfight','Enter does not reactivate the old focused card');
  assert.equal(actions.filter(action=>action.type==='take').length,takes+1);
  takes=actions.filter(action=>action.type==='take').length;
  await page.keyboard.down('Enter');await page.waitForTimeout(80);
  await page.keyboard.down('Enter');await page.waitForTimeout(80);
  await page.keyboard.up('Enter');await page.waitForTimeout(80);
  assert.equal(state.previewScene,'teamfight','Repeated Enter does not activate the old focused scene card');
  assert.equal(actions.filter(action=>action.type==='take').length,takes+1,'Held Enter does not send repeated takes');
  await page.keyboard.press('2'); await page.waitForTimeout(100);
  await page.locator('.take-button').focus();
  takes=actions.filter(action=>action.type==='take').length;
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  assert.equal(state.programScene,'draft');
  assert.equal(actions.filter(action=>action.type==='take').length,takes+1,'Take button Enter invokes one native click');
  tests.push('Enter and NumpadEnter take from a focused scene card; current preview is taken after another hotkey; held Enter and take button do not duplicate');

  await page.locator('[data-workflow-step="manage"]').click();
  await page.locator('.management-page').waitFor();
  await assertNoHotkeyAction(page, 'management');
  await page.getByRole('button', { name: '新增比赛', exact: true }).click();
  await page.getByLabel('赛事 / 比赛名称', { exact: true }).fill('隔离工作流验收赛事');
  await page.getByRole('button', { name: '保存比赛', exact: true }).click();
  await page.waitForTimeout(100);
  const match = state.schedule.find(match => match.title === '隔离工作流验收赛事');
  assert.ok(match, 'New competition is saved to in-memory schedule');
  const matchRow = page.locator('.schedule-table-row').filter({ hasText: '隔离工作流验收赛事' });
  await matchRow.getByRole('button', { name: /载入/ }).click(); await page.waitForTimeout(120);
  assert.equal(state.match.title, match.title);
  tests.push('create competition, save schedule and load current match using only fresh in-memory state');

  await page.locator('[data-workflow-step="settings"]').click();
  await page.locator('.settings-page').waitFor();
  await page.locator('.embedded-obs-preview .obs-live-preview.phase-live').waitFor();
  await assertNoHotkeyAction(page, 'settings');
  assert.equal(await page.locator('.native-preview').count(), 0, 'Settings owns no native projection');
  assert.ok(previewConnections.some(connection => connection.kind === 'program' && connection.fps === 1), 'Settings requests one program image per second');
  const released = await page.evaluate(() => window.__nativeCalls);
  assert.ok(released.some(call => call.method === 'release' && call.kind === 'program'), 'Leaving studio releases its native projection');
  await page.screenshot({ path: path.join(evidence, 'settings-snapshot.png') });
  tests.push('settings uses one-fps snapshot and releases studio native surface');
  await page.getByLabel('RTMP 服务器', { exact: true }).fill('rtmp://127.0.0.1:9/fixture');
  await page.getByLabel('推流码', { exact: true }).fill('isolated-fixture-key');
  await page.getByRole('button', { name: '应用推流配置', exact: true }).click();
  await page.getByText('本次推流地址已应用', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('推流码', { exact: true }).inputValue(), '', 'Applied stream key is cleared from the UI');
  assert.equal(destinationApplications, 1);
  tests.push('mock destination applies and clears its temporary form key');

  for (const name of ['BP 与阵容', '实时数据', '使用指南']) { await navigate(page, name); await assertNoHotkeyAction(page, name); }
  tests.push('scene and take keyboard shortcuts do not mutate state on management/settings/draft/data/help pages');
  await page.locator('[data-workflow-step="studio"]').click();
  await page.locator('.monitor-pane.program .obs-live-preview.phase-live').waitFor();
  await page.locator('.studio-output-dock').waitFor();
  const beforeOutputs = outputRequests.length;
  await page.locator('.studio-output-dock').getByRole('button', { name: '开始推流', exact: true }).click();
  await page.locator('.studio-output-dock').getByRole('button', { name: '停止推流', exact: true }).waitFor();
  await page.locator('.studio-output-dock').getByRole('button', { name: '停止推流', exact: true }).click();
  await page.locator('.studio-output-dock').getByRole('button', { name: '开始推流', exact: true }).waitFor();
  await page.locator('.studio-output-dock').getByRole('button', { name: '开始录制', exact: true }).click();
  await page.locator('.studio-output-dock').getByRole('button', { name: '停止录制', exact: true }).waitFor();
  await page.locator('.studio-output-dock').getByRole('button', { name: '停止录制', exact: true }).click();
  await page.locator('.studio-output-dock').getByRole('button', { name: '开始录制', exact: true }).waitFor();
  assert.deepEqual(outputRequests.slice(beforeOutputs).map(request => request.action), ['start-stream', 'stop-stream', 'start-record', 'stop-record']);
  assert.equal(engine.streamActive, false); assert.equal(engine.recordActive, false);
  tests.push('applied destination remains ready after page navigation; studio stream/record controls react to mocked confirmed engine state');
  engine.connected = false;
  state.connections.obs = { status: 'disconnected', detail: 'Fixture disconnect' }; state.revision++; broadcast();
  await page.locator('.studio-output-dock').getByRole('button', { name: '配置推流', exact: true }).waitFor();
  engine.connected = true;
  state.connections.obs = { status: 'connected', detail: 'Fixture reconnected' }; state.revision++; broadcast();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.studio-output-dock').getByRole('button', { name: '开始推流', exact: true }).count(), 0, 'Reconnect requires reapplying the destination');
  tests.push('engine disconnect invalidates stream readiness; reconnect does not restore stale destination confirmation');
  await page.locator('[data-workflow-step="wrap"]').click();
  await page.getByRole('button', { name: '另存当前快照', exact: true }).waitFor();
  await page.getByRole('button', { name: '另存当前快照', exact: true }).click(); await page.waitForTimeout(120);
  await page.getByRole('tab', { name: /比赛记录/ }).waitFor();
  assert.equal(state.recordings.length, baseline.recordings.length + 1);
  tests.push('wrap-up opens match records and saves a fresh fixture snapshot');

  // Confirmed end is applied only to fresh in-memory fixture state.
  const previousRevision=state.revision;state=createSeed();state.revision=previousRevision+1;state.match.seriesId='demo:schedule:m1';state.match.game=1;state.match.blueScore=0;state.match.redScore=0;
  state.match.format='BO3';state.phase='live';state.selectedPlayerId=state.players[0].id;
  state.connections.obs={status:'connected',detail:'Isolated fixture'};state.programScene='ranking';
  const result=finalizeGame(state,{source:'live',winner:'blue'});state.revision++;broadcast();
  await navigate(page,'导播工作台');await page.locator('.match-lifecycle').waitFor();
  assert.equal(state.recordings.length,1);assert.equal(state.match.blueScore,1);
  const endLayoutFailures=[];
  for(const [width,height] of [[1920,1080],[1440,900],[1366,768]]){
    try{await assertScreen(page,width,height);await page.screenshot({path:path.join(evidence,`studio-game-ended-${width}x${height}.png`)});}catch(error){endLayoutFailures.push(error.message);}
  }
  assert.deepEqual(endLayoutFailures,[],'Ended-game controls and all three frame sizes still fit the screen');
  const frozen=await browser.newPage({viewport:{width:1920,height:1080}});frozen.on('pageerror',error=>errors.push(error.message));
  await frozen.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.fulfill({status:200,contentType:'image/png',body:pixel}));
  await frozen.goto(`${origin}/overlay`);await frozen.locator('.pb-focus-stats').waitFor();
  const finalStats=await frozen.locator('.pb-focus-stats').innerText();
  state.players=[];state.gameTime=0;state.stats.blue.kills=99;state.connections.live={status:'disconnected',detail:'Fixture client closed'};state.revision++;broadcast();
  await frozen.waitForTimeout(100);assert.equal(await frozen.locator('.pb-focus-stats').innerText(),finalStats,'Focused player data survives loss of mutable live players');
  await frozen.screenshot({path:path.join(evidence,'frozen-player-data.png')});
  state.programScene='postgame';state.revision++;broadcast();await frozen.locator('.cast-report-teams').waitFor();
  const finalReport=await frozen.locator('.cast-postgame').innerText();assert.ok(finalReport.includes('第 1 局'));await frozen.screenshot({path:path.join(evidence,'frozen-postgame.png')});
  state.programScene='ranking';state.revision++;broadcast();await frozen.locator('.pb-focus-stats').waitFor();
  const programBefore=state.programScene;await page.locator('.match-lifecycle').getByRole('button',{name:'下一局 · GAME 2',exact:true}).click();
  await page.locator('.draft-workspace').waitFor();
  assert.equal(state.match.game,2);assert.equal(state.phase,'pregame');assert.equal(state.gameTime,0);assert.equal(state.match.blueScore,1);
  assert.equal(state.previewScene,'draft');assert.equal(state.programScene,programBefore);assert.equal(state.gameResults.length,1);assert.equal(state.recordings.length,1);
  assert.ok(state.players.every(player=>!player.championId&&player.gold===null));
  await frozen.waitForTimeout(100);assert.equal(await frozen.locator('.pb-focus-stats').innerText(),finalStats,'Next preserves the previous focused player report on air');
  state.programScene='postgame';state.revision++;broadcast();await frozen.locator('.cast-report-teams').waitFor();assert.equal(await frozen.locator('.cast-postgame').innerText(),finalReport,'Next preserves the previous postgame report on air');
  await frozen.close();
  await navigate(page,'赛事与素材');await page.getByRole('tab',{name:/比赛记录/}).click();
  await page.getByRole('button',{name:'查看赛后报告',exact:true}).click();await page.locator('.archived-game-preview').waitFor();
  assert.ok((await page.locator('.archived-game-preview').innerText()).includes('第 1 局最终数据'));
  await page.locator('.archived-game-preview-head').getByRole('button',{name:'选手数据',exact:true}).click();
  assert.equal(await page.locator('.archived-game-preview .cast-performance-row').count(),10);await page.screenshot({path:path.join(evidence,'previous-game-archive.png'),fullPage:true});
  assert.equal(state.gameResults[0].id,result.id);tests.push('Confirmed end archives once and freezes both reports; next previews BP, keeps prior focused report on air, preserves BO score and retains archived ten-player data');
  await page.close();

  state = structuredClone(baseline);
  const compatible = await createPage(false);
  assert.equal(await compatible.locator('.native-preview').count(), 0);
  for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768]]) {
    await compatible.setViewportSize({ width, height }); await compatible.waitForTimeout(100);
    await compatible.screenshot({ path: path.join(evidence, `studio-browser-${width}x${height}.png`) });
  }
  const current = previewConnections.filter(connection => connection.closedAt === null);
  assert.ok(current.some(connection => connection.kind === 'program'));
  assert.ok(current.some(connection => connection.kind === 'preview' && connection.fps === 1));
  tests.push('browser compatibility keeps one-fps preview and has no desktop native bridge');
  await compatible.close();
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(previewConnections.every(connection => connection.closedAt !== null), 'Navigation and page close release every preview subscription');
  assert.ok(previewConnections.some(connection => connection.kind === 'preview' && connection.acknowledged >= 2), 'Preview raster decodes across multiple one-second updates');
  assert.ok(previewConnections.some(connection => connection.kind === 'program' && connection.acknowledged >= 1), 'Settings or fallback program raster decodes');
  for (const connection of previewConnections.filter(connection => connection.fps === 1)) {
    for (let index = 1; index < connection.sentAt.length; index++) assert.ok(connection.sentAt[index] - connection.sentAt[index - 1] >= 970, 'Snapshot fixture sends no faster than one fps');
  }
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(), tests, layout, errors,
    nativeBridge: 'mock embed/release/position calls only; no Windows native projection or screen-rate measurement',
    previewConnections, outputRequests: outputRequests.map(request => request.action), destinationApplications,
    persistedStateLoaded: false, productionServiceContacted: false, startedObs: false,
    boundary: 'Fresh in-memory state, Vite on an ephemeral loopback port, opaque raster snapshots and mocked desktop/OBS API. Validates UI layout, subscription requests, routing and actions. No game capture, real native FPS, production writes, platform streaming or recording.',
  };
  await writeFile(path.join(evidence, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(`PASS: director workflow and three-level screen layout. Isolated evidence: ${evidence}`);
} finally {
  await browser?.close();
  previewStream.close();
  for (const socket of [...stateWss.clients, ...previewWss.clients]) socket.terminate();
  stateWss.close(); previewWss.close();
  await vite.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
