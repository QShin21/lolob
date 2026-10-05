import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativeHudController } from './native-hud';
import { applyAction, createSeed } from './state';

const hiddenFields = ['interfaceReplay', 'interfaceScore', 'interfaceScoreboard', 'interfaceFrames', 'interfaceTimeline', 'interfaceChat', 'interfaceQuests', 'interfaceAnnounce', 'interfaceKillCallouts'] as const;
function originalRender() {
  return Object.fromEntries([...hiddenFields, 'interfaceAll', 'interfaceTarget', 'interfaceMinimap', 'interfaceNeutralTimers', 'healthBarChampions', 'healthBarStructures', 'healthBarWards', 'healthBarPets', 'healthBarMinions', 'fogOfWar', 'environment', 'characters', 'champions', 'minions', 'particles'].map(key => [key, true]));
}
function fixture(render = originalRender()) {
  const state = applyAction(createSeed(), { type: 'set-mode', mode: 'live' });
  state.programScene = 'live';
  const calls: { endpoint: string; method: string; body?: Record<string, boolean> }[] = [];
  const current = { processId: 42, render: structuredClone(render), unsupported: false, acceptWrites: true };
  const controller = new NativeHudController(() => state, work => work(state), async (port, endpoint, options) => {
    assert.equal(port, 2999);
    calls.push({ endpoint, method: options?.method ?? 'GET', ...(options?.body ? { body: structuredClone(options.body) as Record<string, boolean> } : {}) });
    if (current.unsupported) throw new Error('Replay API 不可用');
    if (endpoint === '/replay/game') return { processID: current.processId };
    assert.equal(endpoint, '/replay/render');
    if (options?.method === 'POST' && current.acceptWrites) Object.assign(current.render, options.body);
    return structuredClone(current.render);
  });
  return { state, calls, current, controller, posts: () => calls.filter(call => call.method === 'POST') };
}

test('automatic HUD hides only broadcast interface panels and preserves the native target, minimap, health bars, camera and world', async () => {
  const saved = originalRender();
  saved.healthBarMinions = false;
  const f = fixture(saved);
  await f.controller.tick(true);
  assert.equal(f.state.nativeHudStatus?.status, 'hidden');
  assert.equal(f.posts().length, 1);
  const patch = f.posts()[0].body!;
  assert.deepEqual(Object.keys(patch).sort(), [...hiddenFields].sort());
  for (const key of hiddenFields) assert.equal(f.current.render[key], false);
  for (const key of ['interfaceTarget', 'interfaceMinimap', 'healthBarChampions', 'healthBarStructures', 'healthBarWards', 'healthBarPets', 'healthBarMinions', 'fogOfWar', 'environment', 'characters', 'champions', 'minions', 'particles']) assert.equal(f.current.render[key], saved[key]);
  assert.ok(f.calls.every(call => ['/replay/game', '/replay/render'].includes(call.endpoint)));
  await f.controller.tick(true);
  assert.equal(f.posts().length, 1);
  await f.controller.close();
  assert.deepEqual(f.current.render, saved);
});

test('live scenes enable game-provided bottom corners and restore their original hidden settings', async () => {
  for (const scene of ['live', 'gold-ranking', 'economy', 'ranking'] as const) {
    const saved = originalRender();
    saved.interfaceAll = false;
    saved.interfaceTarget = false;
    saved.interfaceMinimap = false;
    const f = fixture(saved);
    f.state.programScene = scene;
    await f.controller.tick(true);
    assert.equal(f.current.render.interfaceAll, true);
    assert.equal(f.current.render.interfaceTarget, true);
    assert.equal(f.current.render.interfaceMinimap, true);
    assert.equal(f.posts()[0].body?.interfaceTarget, true);
    assert.equal(f.posts()[0].body?.interfaceMinimap, true);
    assert.match(f.state.nativeHudStatus?.detail ?? '', /游戏目标面板.*小地图/);
    f.state.programScene = 'teamfight';
    await f.controller.tick(true);
    assert.deepEqual(f.current.render, saved);
    await f.controller.close();
  }
});

test('OCR keeps visible team and player score sources while other native panels are hidden', async () => {
  const f = fixture();
  f.state.settings.economyOcr = { enabled: true, blue: { x: 0, y: 0, width: .1, height: .1 }, red: { x: .9, y: 0, width: .1, height: .1 } };
  await f.controller.tick(true);
  assert.equal(f.state.nativeHudStatus?.status, 'hidden');
  assert.equal(f.state.nativeHudStatus?.preserveScore, true);
  assert.equal(f.current.render.interfaceScore, true);
  assert.equal(f.current.render.interfaceScoreboard, true);
  assert.equal(f.state.nativeHudStatus?.preserveScoreboard, true);
  assert.equal(f.current.render.interfaceFrames, false);
  assert.equal(f.current.render.interfaceTarget, true);
  assert.equal(f.current.render.interfaceMinimap, true);
  f.state.settings.economyOcr.enabled = false;
  await f.controller.tick(true);
  assert.equal(f.current.render.interfaceScore, false);
  assert.equal(f.current.render.interfaceScoreboard, false);
  f.state.settings.economyOcr.enabled = true;
  await f.controller.tick(true);
  assert.equal(f.current.render.interfaceScore, true);
  assert.equal(f.current.render.interfaceScoreboard, true);
  await f.controller.close();
  assert.equal(f.current.render.interfaceScore, true);
});

test('player OCR independently preserves the expanded scoreboard and restores the saved switches', async () => {
  const saved = originalRender();saved.interfaceScoreboard=false;
  const f = fixture(saved);
  f.state.settings.economyOcr = {enabled:false,blue:{x:0,y:0,width:.1,height:.1},red:{x:.9,y:0,width:.1,height:.1},players:{enabled:true,region:{x:.25,y:.65,width:.5,height:.35}}};
  await f.controller.tick(true);
  assert.equal(f.current.render.interfaceScore,false);
  assert.equal(f.current.render.interfaceScoreboard,true);
  f.state.settings.economyOcr.players!.enabled=false;
  await f.controller.tick(true);
  assert.equal(f.current.render.interfaceScoreboard,false);
  await f.controller.close();assert.deepEqual(f.current.render,saved);
});

test('OCR enabling exposes its score input even when the score began hidden, then restores the original setting', async () => {
  const saved = originalRender();
  saved.interfaceScore = false;
  const f = fixture(saved);
  f.state.settings.economyOcr = { enabled: true, blue: { x: 0, y: 0, width: .1, height: .1 }, red: { x: .9, y: 0, width: .1, height: .1 } };
  await f.controller.tick(true);
  assert.equal(f.current.render.interfaceScore, true);
  await f.controller.close();
  assert.equal(f.current.render.interfaceScore, false);
});

test('unsupported replay responses fall back without posting partial or unvalidated render changes', async () => {
  const f = fixture();
  delete f.current.render.interfaceFrames;
  await f.controller.tick(true);
  assert.equal(f.state.nativeHudStatus?.status, 'fallback');
  assert.equal(f.posts().length, 0);
  const offline = fixture();
  offline.current.unsupported = true;
  await offline.controller.tick(true);
  assert.equal(offline.state.nativeHudStatus?.status, 'fallback');
  assert.equal(offline.posts().length, 0);
});

test('missing bottom corner or OCR score switches fall back without hiding any native HUD panels', async () => {
  for (const key of ['interfaceTarget', 'interfaceMinimap', 'interfaceScore', 'interfaceScoreboard'] as const) {
    const f = fixture();
    f.state.settings.economyOcr = { enabled: true, blue: { x: 0, y: 0, width: .1, height: .1 }, red: { x: .9, y: 0, width: .1, height: .1 } };
    delete f.current.render[key];
    const saved = structuredClone(f.current.render);
    await f.controller.tick(true);
    assert.equal(f.state.nativeHudStatus?.status, 'fallback');
    assert.equal(f.posts().length, 0);
    assert.deepEqual(f.current.render, saved);
    await f.controller.close();
  }
});

test('a teamfight preview leaves the game untouched and a live program still enables automatic hiding', async () => {
  const f = fixture();
  f.state.programScene = 'draft';
  f.state.previewScene = 'teamfight';
  await f.controller.tick(true);
  assert.equal(f.calls.length, 0);
  assert.equal(f.state.nativeHudStatus?.status, 'waiting');
  f.state.programScene = 'teamfight';
  await f.controller.tick(true);
  assert.equal(f.calls.length, 0);
  assert.equal(f.state.nativeHudStatus?.status, 'off');
  assert.match(f.state.nativeHudStatus?.detail ?? '', /团战.*原生 HUD.*按 A/);
  f.state.programScene = 'live';
  await f.controller.tick(true);
  assert.equal(f.state.nativeHudStatus?.status, 'hidden');
  await f.controller.close();
  assert.deepEqual(f.current.render, originalRender());
});

test('teamfight preserves native HUD without Replay API calls in auto, mask and off modes', async () => {
  for (const mode of ['auto', 'mask', 'off'] as const) {
    const f = fixture();
    f.state.overlay.nativeHud = mode;
    f.state.programScene = 'teamfight';
    await f.controller.tick(true);
    assert.equal(f.calls.length, 0);
    assert.equal(f.state.nativeHudStatus?.status, 'off');
    assert.match(f.state.nativeHudStatus?.detail ?? '', /团战.*原生 HUD.*按 A/);
    f.current.render.interfaceScore = false;
    f.current.render.interfaceScoreboard = false;
    const nativeView = structuredClone(f.current.render);
    await f.controller.tick(true);
    await f.controller.close();
    assert.equal(f.calls.length, 0);
    assert.deepEqual(f.current.render, nativeView);
  }
});

test('entering teamfight restores automatic changes once then preserves manual native HUD changes', async () => {
  const saved = originalRender();
  saved.interfaceChat = false;
  saved.interfaceScoreboard = false;
  const f = fixture(saved);
  await f.controller.tick(true);
  assert.equal(f.current.render.interfaceFrames, false);
  const callsBeforePreview = f.calls.length;
  f.state.previewScene = 'teamfight';
  await f.controller.tick(true);
  assert.equal(f.posts().length, 1);
  assert.equal(f.current.render.interfaceFrames, false);
  assert.ok(f.calls.length > callsBeforePreview);
  f.state.programScene = 'teamfight';
  await f.controller.tick(true);
  assert.deepEqual(f.current.render, saved);
  assert.equal(f.posts().length, 2);
  assert.equal(f.state.nativeHudStatus?.status, 'off');
  f.current.render.interfaceScore = false;
  f.current.render.interfaceScoreboard = true;
  f.current.render.interfaceTarget = false;
  const nativeView = structuredClone(f.current.render);
  const calls = f.calls.length;
  await f.controller.tick(true);
  await f.controller.tick(true);
  await f.controller.close();
  assert.equal(f.calls.length, calls);
  assert.deepEqual(f.current.render, nativeView);
});

test('teamfight reports unconfirmed restoration without claiming an OBS mask and retries the saved switches', async () => {
  const saved = originalRender();
  saved.interfaceChat = false;
  const f = fixture(saved);
  await f.controller.tick(true);
  f.state.programScene = 'teamfight';
  f.current.acceptWrites = false;
  await f.controller.tick(true);
  assert.equal(f.state.nativeHudStatus?.status, 'fallback');
  assert.match(f.state.nativeHudStatus?.detail ?? '', /团战.*恢复未确认.*按 A/);
  assert.doesNotMatch(f.state.nativeHudStatus?.detail ?? '', /OBS 遮挡/);
  assert.equal(f.current.render.interfaceFrames, false);
  f.current.acceptWrites = true;
  await f.controller.tick(true);
  assert.deepEqual(f.current.render, saved);
  assert.equal(f.state.nativeHudStatus?.status, 'off');
  assert.equal(f.posts().length, 3);
  const calls = f.calls.length;
  await f.controller.tick(true);
  await f.controller.close();
  assert.equal(f.calls.length, calls);
});

test('entering teamfight after the replay changes preserves the replacement process HUD', async () => {
  const f = fixture();
  await f.controller.tick(true);
  const replacement = originalRender();
  replacement.interfaceScore = false;
  replacement.interfaceScoreboard = false;
  f.current.processId = 84;
  f.current.render = structuredClone(replacement);
  f.state.programScene = 'teamfight';
  const posts = f.posts().length;
  await f.controller.tick(true);
  assert.equal(f.posts().length, posts);
  assert.deepEqual(f.current.render, replacement);
  assert.equal(f.state.nativeHudStatus?.status, 'off');
  const calls = f.calls.length;
  await f.controller.tick(true);
  await f.controller.close();
  assert.equal(f.calls.length, calls);
});

test('program scene changes restore native HUD immediately while unchanged failures remain throttled', async () => {
  const f = fixture();
  await f.controller.tick();
  assert.equal(f.current.render.interfaceFrames, false);
  f.state.programScene = 'teamfight';
  await f.controller.tick();
  assert.deepEqual(f.current.render, originalRender());
  assert.equal(f.posts().length, 2);
  assert.equal(f.state.nativeHudStatus?.status, 'off');
  await f.controller.close();

  const failing = fixture();
  failing.current.unsupported = true;
  await failing.controller.tick();
  assert.equal(failing.state.nativeHudStatus?.status, 'fallback');
  const calls = failing.calls.length;
  await failing.controller.tick();
  assert.equal(failing.calls.length, calls);
  failing.state.programScene = 'teamfight';
  await failing.controller.tick();
  assert.equal(failing.calls.length, calls);
  assert.equal(failing.state.nativeHudStatus?.status, 'off');
  await failing.controller.close();
});

test('broadcast and native HUD mode changes bypass the previous context throttle', async () => {
  for (const change of ['broadcast', 'nativeHud'] as const) {
    const f = fixture();
    await f.controller.tick();
    assert.equal(f.current.render.interfaceFrames, false);
    if (change === 'broadcast') f.state.mode = 'demo';
    else f.state.overlay.nativeHud = 'mask';
    await f.controller.tick();
    assert.deepEqual(f.current.render, originalRender());
    assert.equal(f.posts().length, 2);
    await f.controller.close();
  }
});

test('a busy tick does not consume a scene change awaiting native HUD restoration', async () => {
  const state = applyAction(createSeed(), { type: 'set-mode', mode: 'live' });
  state.programScene = 'live';
  const saved = originalRender(), render = structuredClone(saved);
  let releaseHide!: () => void, reportStarted!: () => void;
  const hideGate = new Promise<void>(resolve => { releaseHide = resolve; });
  const started = new Promise<void>(resolve => { reportStarted = resolve; });
  let firstPost = true;
  const controller = new NativeHudController(() => state, work => work(state), async (_port, endpoint, options) => {
    if (endpoint === '/replay/game') return { processID: 42 };
    if (options?.method === 'POST') {
      if (firstPost) { firstPost = false; reportStarted(); await hideGate; }
      Object.assign(render, options.body);
    }
    return structuredClone(render);
  });
  const hiding = controller.tick();
  await started;
  state.programScene = 'teamfight';
  await controller.tick();
  releaseHide();
  await hiding;
  assert.equal(render.interfaceFrames, false);
  await controller.tick();
  assert.deepEqual(render, saved);
  assert.equal(state.nativeHudStatus?.status, 'off');
  await controller.close();
});

test('an unconfirmed API write enables fallback and keeps the original switches available for restoration', async () => {
  const f = fixture();
  f.current.acceptWrites = false;
  await f.controller.tick(true);
  assert.equal(f.state.nativeHudStatus?.status, 'fallback');
  assert.equal(f.posts().length, 1);
  f.current.acceptWrites = true;
  await f.controller.close();
  assert.equal(f.posts().length, 2);
  assert.deepEqual(f.current.render, originalRender());
});

test('leaving a live program restores the exact original interface configuration', async () => {
  const saved = originalRender();
  saved.interfaceChat = false;
  saved.interfaceMinimap = false;
  const f = fixture(saved);
  await f.controller.tick(true);
  assert.equal(f.current.render.interfaceMinimap, true);
  f.state.programScene = 'draft';
  await f.controller.tick(true);
  assert.deepEqual(f.current.render, saved);
  assert.equal(f.state.nativeHudStatus?.status, 'waiting');
  const posts = f.posts().length;
  await f.controller.close();
  assert.equal(f.posts().length, posts);
});

test('an unconfirmed restoration keeps the original switches and retries instead of reporting restored', async () => {
  const saved = originalRender();
  saved.interfaceChat = false;
  const f = fixture(saved);
  await f.controller.tick(true);
  f.state.programScene = 'draft';
  f.current.acceptWrites = false;
  await f.controller.tick(true);
  assert.equal(f.state.nativeHudStatus?.status, 'fallback');
  assert.match(f.state.nativeHudStatus?.detail ?? '', /未确认.*恢复/);
  assert.equal(f.current.render.interfaceScore, false);
  f.current.acceptWrites = true;
  await f.controller.tick(true);
  assert.deepEqual(f.current.render, saved);
  assert.equal(f.state.nativeHudStatus?.status, 'waiting');
  assert.equal(f.posts().length, 3);
  await f.controller.close();
  assert.equal(f.posts().length, 3);
});

test('mask and off modes restore automatic changes and remain free of subsequent game mutations', async () => {
  for (const mode of ['mask', 'off'] as const) {
    const f = fixture();
    await f.controller.tick(true);
    f.state.overlay.nativeHud = mode;
    await f.controller.tick(true);
    assert.deepEqual(f.current.render, originalRender());
    assert.equal(f.state.nativeHudStatus?.status, mode === 'off' ? 'off' : 'fallback');
    const calls = f.calls.length;
    await f.controller.tick(true);
    assert.equal(f.calls.length, calls);
    await f.controller.close();
  }
});

test('a changed replay process receives its own saved HUD configuration and never the previous process settings', async () => {
  const f = fixture();
  await f.controller.tick(true);
  const nextOriginal = originalRender();
  nextOriginal.interfaceChat = false;
  nextOriginal.interfaceScoreboard = false;
  f.current.processId = 84;
  f.current.render = structuredClone(nextOriginal);
  await f.controller.tick(true);
  await f.controller.close();
  assert.deepEqual(f.current.render, nextOriginal);
  assert.equal(f.posts().at(-1)?.body?.interfaceChat, false);
  assert.equal(f.posts().at(-1)?.body?.interfaceScoreboard, false);
});

test('closing after the replay process changes never restores old switches into the replacement process', async () => {
  const f = fixture();
  await f.controller.tick(true);
  f.current.processId = 84;
  f.current.render = originalRender();
  const posts = f.posts().length;
  await f.controller.close();
  assert.equal(f.posts().length, posts);
});

test('shutdown waits for an in-flight hide so the final game state is restored', async () => {
  const state = applyAction(createSeed(), { type: 'set-mode', mode: 'live' });
  state.programScene = 'live';
  const saved = originalRender(), render = structuredClone(saved);
  let releaseHide!: () => void, reportStarted!: () => void;
  const hideGate = new Promise<void>(resolve => { releaseHide = resolve; });
  const started = new Promise<void>(resolve => { reportStarted = resolve; });
  let firstPost = true;
  const controller = new NativeHudController(() => state, work => work(state), async (_port, endpoint, options) => {
    if (endpoint === '/replay/game') return { processID: 42 };
    if (options?.method === 'POST') {
      if (firstPost) { firstPost = false; reportStarted(); await hideGate; }
      Object.assign(render, options.body);
    }
    return structuredClone(render);
  });
  const hiding = controller.tick(true);
  await started;
  const closing = controller.close();
  // Allow the close request to enter before the pending game write completes.
  await Promise.resolve();
  await Promise.resolve();
  releaseHide();
  await Promise.all([hiding, closing]);
  assert.deepEqual(render, saved);
});
