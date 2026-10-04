// Isolated real React component verification with a sampled clock; no game or output controls.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tsImport } from 'tsx/esm/api';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createSeed, applyAction } = await tsImport('../server/state.ts', import.meta.url);
const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
const initial = applyAction(createSeed(), { type: 'set-mode', mode: 'live' });
initial.phase = 'live'; initial.settings.pollInterval = 1500;
initial.connections.live.status = 'connected'; initial.connections.replay.status = 'connected';
const entryPath = path.join(root, '_clock-fixture.tsx').replaceAll('\\', '/');
const entry = `import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
import {GameTime,GameClockConnectionProvider} from '/src/components/GameTime.tsx';import {gameClockMatchKey} from '/shared/game-clock.ts';
let state=${JSON.stringify(initial)},connected=true,baseTime=241.8,baseAt=performance.now(),speed=1,paused=false,source='live',epoch=0;const listeners=new Set();
const actual=()=>baseTime+(paused?0:(performance.now()-baseAt)/1000*speed);
function publish(){state={...state,gameTime:actual(),gameClock:{source,gameTime:actual(),sampledAt:new Date().toISOString(),speed,paused,sessionId:'browser-clock-fixture',discontinuity:epoch,matchKey:gameClockMatchKey(state),validForMs:4500}};for(const update of listeners)update();}
function control(change){baseTime=actual();baseAt=performance.now();if(change.time!==undefined){baseTime=change.time;epoch++;}if(change.speed!==undefined){speed=change.speed;source='replay';}if(change.paused!==undefined)paused=change.paused;if(change.connected!==undefined)connected=change.connected;if(change.newMatch){state={...state,match:{...state.match,game:state.match.game+1}};baseTime=0;epoch++;}if(change.mode){state={...state,mode:change.mode,paused};}publish();}
publish();setInterval(publish,1500);window.fixture={control};
function App(){const [value,setValue]=useState(state),[transport,setTransport]=useState(connected);useEffect(()=>{const update=()=>{setValue(state);setTransport(connected);};listeners.add(update);return()=>listeners.delete(update);},[]);return <GameClockConnectionProvider value={transport}><main><h1>1500 ms 实采时钟验证</h1><strong data-testid="clock"><GameTime state={value}/></strong><p>API 实采值：<output data-testid="raw">{value.gameTime.toFixed(3)}</output> 秒</p></main></GameClockConnectionProvider>;}
createRoot(document.getElementById('root')).render(<App/>);`;
const vite = await createServer({ root, configFile: false, plugins: [react(), { name: 'clock-fixture', resolveId: id => id === '/_clock-fixture.tsx' ? entryPath : undefined, load: id => id === entryPath ? entry : undefined }], server: { middlewareMode: true }, appType: 'custom' });
const server = http.createServer(async (req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml('/', '<!doctype html><html><head><style>body{background:#0c151f;color:#caeaff;font:20px system-ui;margin:80px}strong{font-size:100px;font-variant-numeric:tabular-nums}h1{font-size:28px;font-weight:500}p{color:#8ca5b8}</style></head><body><div id="root"></div><script type="module" src="/_clock-fixture.tsx"></script></body></html>'));
    return;
  }
  vite.middlewares(req, res, () => { res.statusCode = 404; res.end(); });
});
const evidence = path.resolve(process.env.RIFTCAST_CLOCK_VERIFY_DIR || path.join(root, 'verification-output/clock'));
await mkdir(evidence, { recursive: true });
let browser;
const parseTime = value => value.split(':').map(Number).reduce((total, part) => total * 60 + part, 0);
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.getByTestId('clock').waitFor();
  await page.evaluate(() => window.fixture.control({ time: 241.8 }));
  const normal = await page.evaluate(async () => {
    const readings = [], started = performance.now();
    while (performance.now() - started < 6200) {
      readings.push({ at: performance.now() - started, display: document.querySelector('[data-testid="clock"]').textContent, raw: Number(document.querySelector('[data-testid="raw"]').textContent) });
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return readings;
  });
  const sequence = normal.map(value => value.display).filter((value, index, all) => index === 0 || value !== all[index - 1]);
  assert.ok(sequence.includes('04:02'), '04:02 renders despite 1500 ms API updates');
  for (let index = 1; index < sequence.length; index++) assert.equal(parseTime(sequence[index]) - parseTime(sequence[index - 1]), 1, 'Normal display visits every second in order');
  assert.ok(normal.some((value, index) => index > 0 && value.raw === normal[index - 1].raw && value.display !== normal[index - 1].display), 'Display advances while the actual sampled value is unchanged');
  await page.screenshot({ path: path.join(evidence, 'clock-running.png') });

  await page.evaluate(() => window.fixture.control({ paused: true }));
  await page.waitForTimeout(100); const paused = await page.getByTestId('clock').textContent();
  await page.waitForTimeout(1100); assert.equal(await page.getByTestId('clock').textContent(), paused, 'Replay pause freezes between samples');
  await page.evaluate(() => window.fixture.control({ speed: 4, paused: false }));
  await page.waitForTimeout(100); const acceleratedStart = parseTime(await page.getByTestId('clock').textContent());
  await page.waitForTimeout(1000); const acceleratedEnd = parseTime(await page.getByTestId('clock').textContent());
  assert.ok(acceleratedEnd - acceleratedStart >= 3 && acceleratedEnd - acceleratedStart <= 5, 'Playback advances at confirmed 4x speed');

  await page.evaluate(() => window.fixture.control({ time: 120, paused: true }));
  await page.waitForTimeout(100); assert.equal(await page.getByTestId('clock').textContent(), '02:00', 'Seek re-anchors immediately');
  await page.evaluate(() => window.fixture.control({ speed: 1, paused: false }));
  await page.waitForTimeout(300); await page.evaluate(() => window.fixture.control({ connected: false }));
  await page.waitForTimeout(100); const disconnected = await page.getByTestId('clock').textContent();
  await page.waitForTimeout(1700); assert.equal(await page.getByTestId('clock').textContent(), disconnected, 'WebSocket loss freezes even if a local fixture continues sending samples');
  await page.evaluate(() => window.fixture.control({ connected: true })); await page.waitForTimeout(100);
  const reconnected = parseTime(await page.getByTestId('clock').textContent()); assert.ok(reconnected > parseTime(disconnected), 'Reconnect adopts the fresh sample');
  await page.evaluate(() => window.fixture.control({ newMatch: true, paused: true })); await page.waitForTimeout(100);
  assert.equal(await page.getByTestId('clock').textContent(), '00:00', 'A new game clears the previous display anchor');
  await page.evaluate(() => window.fixture.control({ mode: 'demo', time: 42, paused: true })); await page.waitForTimeout(100);
  assert.equal(await page.getByTestId('clock').textContent(), '00:42', 'Mode switch adopts demo state without old Replay metadata');
  assert.deepEqual(errors, []);
  const report = { verifiedAt: new Date().toISOString(), boundary: 'Isolated Vite/React browser fixture using the production GameTime component. No live game timing claim.', pollIntervalMs: 1500, normalSequence: sequence, unchangedRawBetweenDisplayTicks: true, pause: paused, speed4xAdvance: acceleratedEnd - acceleratedStart, seek: '02:00', disconnectFreeze: disconnected, reconnect: reconnected, newGame: '00:00', demo: '00:42', pageErrors: errors, result: 'PASS' };
  await writeFile(path.join(evidence, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close(); await vite.close(); await new Promise(resolve => server.close(resolve));
}
