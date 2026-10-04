import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BroadcastState } from '../shared/types';
import { applyAction, createSeed } from './state';
import { currentIncomeSnapshot, updateIncomeSnapshots } from './player-income';
import { lanAddresses } from './security';

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
  // Income HTTP does not depend on an external champion-catalog download or its shutdown timing.
  const offlineCatalog = path.join(directory, 'offline-catalog.cjs');
  await writeFile(offlineCatalog, "const originalFetch=globalThis.fetch;globalThis.fetch=(resource,options)=>{const url=typeof resource==='string'?resource:resource?.url??String(resource);return url.startsWith('https://ddragon.leagueoflegends.com/')?Promise.reject(new Error('Offline catalog in isolated income test')):originalFetch(resource,options);};", 'utf8');
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
    assert.ok(ready, `Isolated income HTTP service must start: ${diagnostics}`);
  } catch (error) { child.kill(); throw error; }
  const post = (route: string, body: unknown, host = base, token?: string) => fetch(host + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'x-control-token': token } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000),
  });
  return { child, base, port, post, diagnostics:()=>diagnostics, state: () => fetch(`${base}/api/state`).then(response => response.json()) as Promise<BroadcastState> };
}
async function stopService(child: ChildProcess, diagnostics:()=>string): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Isolated income service did not finish IPC shutdown')); }, 5000);
    child.once('exit', code => { clearTimeout(timeout); resolve(code); });
  });
  child.send?.({ type: 'riftcast-shutdown' });
  assert.equal(await stopped, 0, diagnostics());
}

async function waitForDisabledEconomy(service: { state: () => Promise<BroadcastState> }): Promise<BroadcastState> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const state = await service.state();
    if (state.economyFeed?.status === 'disabled' && state.economyFeed.players?.status === 'disabled') return state;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail('The isolated economy heartbeat must publish its disabled status before an atomicity baseline');
}

test('income bridge survives runtime reset, rejects cross-game changes atomically, exports and persists, and denies paired LAN writes', { timeout: 25000 }, async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'riftcast-income-http-'));
  const children: ChildProcess[] = [];
  try {
    const saved = applyAction(createSeed(), { type: 'set-mode', mode: 'live' });
    saved.programScene = 'standby';
    saved.overlay.nativeHud = 'off';
    saved.phase = 'live';
    saved.gameTime = 600;
    saved.players = createSeed().players.map((player, index) => ({ ...player, id: `live-income-test-${index}`, gold: 5000, ...(index === 0 ? { income: { kills: 300, minions: 1800 } } : {}) }));
    saved.incomeSnapshots = [];
    updateIncomeSnapshots(saved);
    const partial = currentIncomeSnapshot(saved)!;
    assert.equal(partial.status, 'partial');
    await writeFile(path.join(directory, 'state.json'), JSON.stringify(saved), 'utf8');

    const service = await startService(directory);
    children.push(service.child);
    // Establish the off status once so a later heartbeat cannot change a rejection's state comparison.
    assert.equal((await service.post('/api/replay/hud', {})).status, 200);
    const restored = await service.state();
    assert.equal(restored.gameTime, 0);
    assert.equal(restored.players.length, 0);
    assert.equal(restored.phase, 'pregame');
    assert.deepEqual(currentIncomeSnapshot(restored), partial);
    assert.equal((await fetch(`${service.base}/api/obs/engine`).then(response => response.json())).mode, 'external');
    const selected = await service.post('/api/action', { type: 'select-player', playerId: partial.players[3].playerId });
    assert.equal(selected.status, 200);
    assert.equal((await selected.json()).selectedPlayerId, partial.players[3].playerId);

    const payload = { gameKey: partial.gameKey, capturedTime: partial.capturedTime, players: [{ playerId: partial.players[0].playerId, values: { monsters: 200 } }] };
    for (const invalid of [
      { ...payload, gameKey: 'other-series-or-game' },
      { ...payload, capturedTime: 601 },
      { ...payload, players: [{ playerId: partial.players[0].playerId, values: { kills: 301 } }] },
      { ...payload, players: [{ playerId: partial.players[0].playerId, totalGold: 5001, values: { monsters: 200 } }] },
    ]) {
      const before = await service.state();
      const response = await service.post('/api/player-income/telemetry', invalid);
      assert.equal(response.status, 400);
      assert.equal(typeof (await response.json()).error, 'string');
      assert.deepEqual(await service.state(), before);
    }

    const network = await fetch(`${service.base}/api/network`).then(response => response.json());
    const addresses = lanAddresses();
    await context.test('a paired request from a non-loopback interface remains forbidden', async remoteContext => {
      if (!addresses.length) { remoteContext.skip('No non-loopback IPv4 interface is available'); return; }
      const before = await service.state();
      const denied = await service.post('/api/player-income/telemetry', payload, `http://${addresses[0]}:${service.port}`, network.controlToken);
      assert.equal(denied.status, 403);
      assert.match((await denied.json()).error, /仅接受导播主机/);
      assert.deepEqual(await service.state(), before);
    });

    const completed = await service.post('/api/player-income/telemetry', {
      gameKey: partial.gameKey, capturedTime: partial.capturedTime,
      players: partial.players.map((player, index) => ({ playerId: player.playerId, values: { kills: index === 0 ? 300 : 0, minions: index === 0 ? 1800 : 1000, monsters: 200, towers: 160, passive: 1213, other: 500 } })),
    });
    assert.equal(completed.status, 200);
    const ready = await completed.json();
    assert.equal(ready.status, 'ready');
    assert.equal(ready.capturedTime, 600);
    assert.equal(ready.players[0].values.kills.source, 'api');
    assert.equal(ready.players[0].values.monsters.source, 'telemetry');
    const afterBridge = await service.state();
    assert.equal(afterBridge.players.length, 0);
    assert.equal(afterBridge.gameTime, 0);
    assert.deepEqual(currentIncomeSnapshot(afterBridge), ready);

    const recording = await service.post('/api/action', { type: 'save-recording', title: '十分钟桥补持久化测试' }).then(response => response.json());
    const recordingId = recording.recordings[0].id;
    assert.deepEqual(recording.recordings[0].incomeSnapshots, [ready]);
    const currentExport = await fetch(`${service.base}/api/export?format=json`).then(response => response.json());
    assert.deepEqual(currentExport.incomeSnapshots, [ready]);
    const recordingExport = await fetch(`${service.base}/api/export?format=json&recordingId=${recordingId}`).then(response => response.json());
    assert.deepEqual(recordingExport.incomeSnapshots, [ready]);
    const csv = await fetch(`${service.base}/api/export?format=csv&recordingId=${recordingId}`).then(response => response.text());
    assert.match(csv, /十分钟经济来源/);
    assert.match(csv, /赛事数据桥/);
    assert.match(csv, /实际采样秒数/);

    await stopService(service.child, service.diagnostics);
    const persisted = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8')) as BroadcastState;
    assert.deepEqual(currentIncomeSnapshot(persisted), ready);
    assert.deepEqual(persisted.recordings[0].incomeSnapshots, [ready]);
    const resumed = await startService(directory);
    children.push(resumed.child);
    const resumedState = await resumed.state();
    assert.deepEqual(currentIncomeSnapshot(resumedState), ready);
    assert.deepEqual(resumedState.recordings[0].incomeSnapshots, [ready]);
    assert.equal(resumedState.players.length, 0);
    const savedChoice = await resumed.post('/api/action', { type: 'select-player', playerId: ready.players[7].playerId });
    assert.equal(savedChoice.status, 200);
    assert.equal((await savedChoice.json()).selectedPlayerId, ready.players[7].playerId);
    const nextGame = await resumed.post('/api/action', { type: 'set-match', patch: { game: resumedState.match.game + 1 } });
    assert.equal(nextGame.status, 200);
    // Advancing clears the runtime feed; let its background initialization finish before testing rejection atomicity.
    const afterAdvance = await waitForDisabledEconomy(resumed);
    const oldCardChoice = await resumed.post('/api/action', { type: 'select-player', playerId: ready.players[7].playerId });
    assert.equal(oldCardChoice.status, 400);
    assert.deepEqual(await resumed.state(), afterAdvance);
    await stopService(resumed.child, resumed.diagnostics);
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise<void>(resolve => { child.once('exit', () => resolve()); setTimeout(resolve, 3000); });
    }
    const absolute = path.resolve(directory);
    assert.ok(absolute.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(absolute).startsWith('riftcast-income-http-'));
    await rm(absolute, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
