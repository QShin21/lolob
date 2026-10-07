import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BroadcastState } from '../shared/types';
import { createSeed } from './state';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '0.0.0.0', resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
async function startService(directory: string) {
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  // Broadcast HTTP does not depend on an external champion-catalog download or its shutdown timing.
  const offlineCatalog = path.join(directory, 'offline-catalog.cjs');
  await writeFile(offlineCatalog, "const originalFetch=globalThis.fetch;globalThis.fetch=(resource,options)=>{const url=typeof resource==='string'?resource:resource?.url??String(resource);return url.startsWith('https://ddragon.leagueoflegends.com/')?Promise.reject(new Error('Offline catalog in isolated broadcast test')):originalFetch(resource,options);};", 'utf8');
  const child = spawn(process.execPath, ['--require', offlineCatalog, '--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, PORT: String(port), ENABLE_LAN: '1', RIFTCAST_DATA_DIR: directory, RIFTCAST_OBS_MODE: 'external', RIFTCAST_OBS_AUTOSTART: '0', RIFTCAST_AUTO_CONNECT: '0' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let diagnostics = '';
  child.stdout?.on('data', value => { diagnostics = (diagnostics + value.toString()).slice(-2000); });
  child.stderr?.on('data', value => { diagnostics = (diagnostics + value.toString()).slice(-2000); });
  try {
    let ready = false;
    for (let index = 0; index < 70; index++) {
      try { if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch { /* Wait for this isolated service only. */ }
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `Isolated broadcast HTTP service must start: ${diagnostics}`);
  } catch (error) { child.kill(); throw error; }
  const post = (route: string, body: unknown, host = base, token?: string) => fetch(host + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'x-control-token': token } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000),
  });
  return { child, base, port, post, diagnostics:()=>diagnostics, state: () => fetch(`${base}/api/state`).then(response => response.json()) as Promise<BroadcastState> };
}
async function stopService(child: ChildProcess, diagnostics:()=>string): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Isolated broadcast service did not finish IPC shutdown')); }, 5000);
    child.once('exit', code => { clearTimeout(timeout); resolve(code); });
  });
  child.send?.({ type: 'riftcast-shutdown' });
  assert.equal(await stopped, 0, diagnostics());
}

test('five-pair controls persist over HTTP, migrate the retired scene, rotate in wall time and remove the telemetry endpoint', { timeout: 20000 }, async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'riftcast-broadcast-http-'));
  let service: Awaited<ReturnType<typeof startService>> | undefined;
  try {
    const saved = createSeed(); saved.paused = true; saved.overlay.nativeHud = 'off';
    (saved as any).previewScene = 'income';
    (saved as any).incomeSnapshots = [{ id: 'retired-data' }];
    await writeFile(path.join(directory, 'state.json'), JSON.stringify(saved));
    service = await startService(directory);
    let current = await service.state();
    assert.equal(current.previewScene, 'gold-ranking');
    assert.equal(Object.hasOwn(current, 'incomeSnapshots'), false);
    assert.equal((await service.post('/api/player-income/telemetry', {})).status, 404);
    const pairs = current.overlay.playerFeedPairs!;
    pairs.forEach((pair, index) => { pair.blue.label = `BLUE ${index}`; pair.red.label = `RED ${index}`; });
    const response = await service.post('/api/action', { type: 'set-overlay', patch: { playerFeedPairs: pairs } });
    assert.equal(response.status, 200);
    assert.equal((await service.post('/api/action', { type: 'set-player-feed-control', mode: 'auto', activeIndex: 0 })).status, 200);
    assert.equal((await service.post('/api/action', { type: 'preview-scene', scene:'live' })).status, 200);
    assert.equal((await service.post('/api/action', { type: 'take' })).status, 200);
    const start = Date.now();
    while (Date.now() - start < 8000) {
      current = await service.state();
      if (current.overlay.playerFeedControl!.activeIndex === 1) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(current.overlay.playerFeedControl!.activeIndex, 1, service.diagnostics());
    assert.ok(Date.now() - start >= 4750, 'Rotation must retain the first pair for five seconds');
    assert.equal(current.gameTime, saved.gameTime, 'Paused game time does not pause the on-air rotation');
    assert.equal((await service.post('/api/action', { type: 'set-player-feed-control', mode: 'manual', activeIndex: 4 })).status, 200);
    const exported = await fetch(`${service.base}/api/export`).then(response => response.json());
    assert.equal(Object.hasOwn(exported, 'incomeSnapshots'), false);
    const catalog = await fetch(`${service.base}/api/champions`).then(response => response.json());
    assert.equal(catalog.champions.length, 173);
    assert.ok(catalog.champions.every((champion: any) => champion.image.startsWith('/champion-art/')));
    await stopService(service.child, service.diagnostics); service = undefined;
    const persisted = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
    assert.deepEqual(persisted.overlay.playerFeedPairs, pairs);
    assert.deepEqual(persisted.overlay.playerFeedControl, { mode: 'manual', activeIndex: 4 });
    service = await startService(directory);
    current = await service.state();
    assert.deepEqual(current.overlay.playerFeedPairs, pairs);
    assert.deepEqual(current.overlay.playerFeedControl, { mode: 'manual', activeIndex: 4 });
  } finally {
    if (service) await stopService(service.child, service.diagnostics);
    const absolute = path.resolve(directory);
    assert.ok(absolute.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(absolute).startsWith('riftcast-broadcast-http-'));
    await rm(absolute, { recursive: true, force: true });
  }
});
