import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ObsTransitions, type TransitionObsCall } from './obs-transitions';
import { EventTransitionRules, defaultTransitionSettings, validateTransitionSettings, type TransitionConfig } from '../shared/broadcast-transitions';
import { createFixture } from './test-support/fixture';

async function harness(options: { failAfterPublish?: boolean; media?: number[]; override?: { transitionName: string | null; transitionDuration: number | null } } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'riftcast-transition-')), video = path.join(dir, 'test.webm'); await writeFile(video, 'synthetic');
  const calls: { name: string; data: any }[] = [], items: { sceneItemId: number; sourceName: string }[] = [];
  let program = 'RiftCast 节目', transition = '原硬切', duration = 400, ms = 1000, published = false, nextId = 0, cursor = 0;
  const scenes = new Set([program, '目标场景']);
  let override = options.override ?? { transitionName: '场景原转场', transitionDuration: 650 };
  const call = (async (name: string, data: any) => {
    calls.push({ name, data });
    if (options.failAfterPublish && published && name === 'SetCurrentProgramScene') throw new Error('模拟切换失败');
    switch (name) {
      case 'GetCurrentProgramScene': return { sceneName: program };
      case 'SetCurrentProgramScene': program = data.sceneName; return;
      case 'GetSceneList': return { scenes: [...scenes].map(sceneName => ({ sceneName })) };
      case 'GetSceneTransitionList': return { transitions: [{ transitionName: '原硬切', transitionKind: 'cut_transition' }, { transitionName: '原淡化', transitionKind: 'fade_transition' }] };
      case 'GetCurrentSceneTransition': return { transitionName: transition, transitionDuration: duration, transitionFixed: transition === '原硬切' };
      case 'SetCurrentSceneTransition': transition = data.transitionName; return;
      case 'SetCurrentSceneTransitionDuration': duration = data.transitionDuration; return;
      case 'GetCurrentSceneTransitionCursor': return { transitionCursor: 1 };
      case 'GetVideoSettings': return { baseWidth: 1920, baseHeight: 1080 };
      case 'SaveSourceScreenshot': await writeFile(data.imageFilePath, 'screenshot'); return;
      case 'CreateScene': scenes.add(data.sceneName); return;
      case 'RemoveScene': scenes.delete(data.sceneName); return;
      case 'CreateSceneItem': { const item = { sceneItemId: ++nextId, sourceName: data.sourceName }; items.push(item); return item; }
      case 'CreateInput': { const item = { sceneItemId: ++nextId, sourceName: data.inputName }; items.push(item); return item; }
      case 'GetSceneItemList': return { sceneItems: items };
      case 'GetSceneSceneTransitionOverride': return { ...override };
      case 'SetSceneSceneTransitionOverride': {
        // OBS validates these fields before changing either setting. null clears;
        // an empty name and a zero duration are invalid protocol values.
        if (data.transitionName === '') throw Object.assign(new Error('Transition name must not be empty.'), { code: 403 });
        if (data.transitionName !== undefined && data.transitionName !== null && !['场景原转场', '原硬切', '原淡化'].includes(data.transitionName)) throw Object.assign(new Error('No scene transition was found by that name.'), { code: 600 });
        if (data.transitionDuration !== undefined && data.transitionDuration !== null && (!Number.isFinite(data.transitionDuration) || data.transitionDuration < 50 || data.transitionDuration > 20000)) throw Object.assign(new Error('Transition duration out of range.'), { code: 401 });
        override = { transitionName: data.transitionName === undefined ? override.transitionName : data.transitionName, transitionDuration: data.transitionDuration === undefined ? override.transitionDuration : data.transitionDuration };
        return;
      }
      case 'GetMediaInputStatus': { const values = options.media ?? [0, 300, 600, 1000]; const value = values[Math.min(cursor++, values.length - 1)]; return { mediaState: value >= 1000 ? 'OBS_MEDIA_STATE_ENDED' : 'OBS_MEDIA_STATE_PLAYING', mediaCursor: value, mediaDuration: 1000 }; }
      default: return {};
    }
  }) as TransitionObsCall;
  const controller = new ObsTransitions(call, dir, { now: () => ms, delay: async n => { ms += n; } });
  return { dir, video, calls, controller, scene: () => program, override: () => override, publish: () => { published = true; calls.push({ name: 'PUBLISH', data: cursor }); }, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('all transition kinds clear overrides with null and restore absent or partial settings exactly', async () => {
  for (const kind of ['cut', 'fade', 'stinger'] as const) for (const override of [
    { transitionName: null, transitionDuration: null },
    { transitionName: '原硬切', transitionDuration: null },
    { transitionName: null, transitionDuration: 900 },
  ]) {
    const h = await harness({ override });
    try {
      const config: TransitionConfig = kind === 'stinger' ? { kind, durationMs: 1000, pointMs: 500, stingerPath: h.video } : { kind, durationMs: 300 };
      const result = await h.controller.run(config, { prepare: async () => '目标场景', publish: h.publish });
      assert.equal(result.status, 'applied', `${kind}: ${result.detail}`);
      assert.equal(result.published, true);
      assert.deepEqual(h.calls.find(c => c.name === 'SetSceneSceneTransitionOverride')?.data, { sceneName: '目标场景', transitionName: null, transitionDuration: null });
      assert.deepEqual(h.override(), override);
      assert.equal(h.calls.filter(c => c.name === 'PUBLISH').length, 1);
    } finally { await h.cleanup(); }
  }
});
test('cut prepares and publishes once, confirms OBS scene and restores transition overrides', async () => {
  const h = await harness(); try {
    const r = await h.controller.run({ kind: 'cut', durationMs: 300 }, { prepare: async () => '目标场景', publish: h.publish });
    assert.equal(r.status, 'applied'); assert.equal(r.published, true); assert.equal(h.scene(), '目标场景');
    assert.equal(h.calls.filter(c => c.name === 'PUBLISH').length, 1); assert(!h.calls.some(c => c.name === 'SaveSourceScreenshot'));
    assert.deepEqual(h.calls.filter(c => c.name === 'SetSceneSceneTransitionOverride').at(-1)?.data, { sceneName: '目标场景', transitionName: '场景原转场', transitionDuration: 650 });
  } finally { await h.cleanup(); }
});
test('fade uses an actual OBS snapshot bridge even when the destination scene name stays unchanged', async () => {
  const h = await harness(); try {
    const r = await h.controller.run({ kind: 'fade', durationMs: 500 }, { prepare: async () => 'RiftCast 节目', publish: h.publish });
    assert.equal(r.status, 'applied'); assert.equal(h.scene(), 'RiftCast 节目');
    const bridge = h.calls.find(c => c.name === 'CreateScene')!.data.sceneName;
    assert(h.calls.some(c => c.name === 'SetCurrentProgramScene' && c.data.sceneName === bridge));
    assert(h.calls.findIndex(c => c.name === 'PUBLISH') > h.calls.findIndex(c => c.name === 'SetCurrentProgramScene' && c.data.sceneName === bridge));
    assert(h.calls.some(c => c.name === 'SetCurrentSceneTransitionDuration' && c.data.transitionDuration === 500));
    assert(h.calls.some(c => c.name === 'SetCurrentSceneTransitionDuration' && c.data.transitionDuration === 400));
    assert.deepEqual(await readdir(path.join(h.dir, 'transition-cache')), []);
  } finally { await h.cleanup(); }
});
test('stinger publishes at an observed media cursor and cleans its private scene after real media end', async () => {
  const h = await harness(); try {
    const config: TransitionConfig = { kind: 'stinger', durationMs: 1000, pointMs: 500, stingerPath: h.video };
    const r = await h.controller.run(config, { prepare: async () => '目标场景', publish: h.publish });
    assert.equal(r.status, 'applied'); assert.equal(h.calls.find(c => c.name === 'PUBLISH')!.data, 3);
    assert(h.calls.some(c => c.name === 'SetInputMute' && c.data.inputMuted === true));
    assert.equal(h.calls.filter(c => c.name === 'GetMediaInputStatus').length, 4);
    assert(h.calls.some(c => c.name === 'RemoveInput' && c.data.inputName.endsWith('视频')));
  } finally { await h.cleanup(); }
});
test('unavailable media and invalid switch points never publish programme content', async () => {
  const h = await harness(); try {
    await assert.rejects(h.controller.run({ kind: 'stinger', durationMs: 1000, pointMs: 200, stingerPath: path.join(h.dir, 'missing.webm') }, { prepare: async () => '目标场景', publish: h.publish }), /不可用/);
    assert.equal(h.calls.length, 0);
    const r = await h.controller.run({ kind: 'stinger', durationMs: 2000, pointMs: 1500, stingerPath: h.video }, { prepare: async () => '目标场景', publish: h.publish });
    assert.equal(r.status, 'failed'); assert.equal(r.published, false); assert.equal(h.scene(), 'RiftCast 节目'); assert(!h.calls.some(c => c.name === 'PUBLISH'));
  } finally { await h.cleanup(); }
});
test('early media end, preparation failure and post-publish OBS failure return distinct receipts', async () => {
  const early = await harness({ media: [1000] }); try {
    const r = await early.controller.run({ kind: 'stinger', durationMs: 1000, pointMs: 500, stingerPath: early.video }, { prepare: async () => '目标场景', publish: early.publish }); assert.equal(r.published, false); assert.equal(r.status, 'failed');
  } finally { await early.cleanup(); }
  const before = await harness(); try { const r = await before.controller.run({ kind: 'fade', durationMs: 300 }, { prepare: async () => { throw new Error('来源丢失'); }, publish: before.publish }); assert.equal(r.published, false); assert.equal(before.scene(), 'RiftCast 节目'); } finally { await before.cleanup(); }
  const after = await harness({ failAfterPublish: true }); try { const r = await after.controller.run({ kind: 'cut', durationMs: 300 }, { prepare: async () => '目标场景', publish: after.publish }); assert.equal(r.published, true); assert.equal(r.status, 'failed'); assert.match(r.detail, /已发布/); } finally { await after.cleanup(); }
});
test('event rules require explicit enablement, new observations, side, cooldown and coherent game context', () => {
  const s = createFixture(), settings = defaultTransitionSettings(), now = Date.now();
  s.phase = 'live'; s.gameTime = 100; s.programScene = 'live'; s.connections.live = { status: 'connected', detail: '', updatedAt: new Date(now).toISOString() }; if(s.production)delete s.production.application;
  settings.rules = [{ id: 'baron', enabled: true, event: 'BaronKill', side: 'blue', targetScene: 'economy', cooldownSeconds: 10, transition: { kind: 'fade', durationMs: 300 } }];
  const rules = new EventTransitionRules(); s.events = [{ id: 'old', time: 98, type: 'BaronKill', team: 'blue', text: '' }]; assert.equal(rules.observe(s, settings, now), null);
  settings.automatic = true; assert.equal(rules.observe(s, settings, now), null);
  s.events.push({ id: 'new', time: 100, type: 'BaronKill', team: 'blue', text: '' }); assert.equal(rules.observe(s, settings, now)?.eventId, 'new'); assert.equal(rules.observe(s, settings, now), null);
  s.events.push({ id: 'cooldown', time: 100, type: 'BaronKill', team: 'blue', text: '' }); assert.equal(rules.observe(s, settings, now + 1000), null);
  s.gameTime = 30; assert.equal(rules.observe(s, settings, now + 2000), null); s.gameTime = 100; assert.equal(rules.observe(s, settings, now + 3000), null);
  s.events.push({ id: 'other-side', time: 100, type: 'BaronKill', team: 'red', text: '' }); assert.equal(rules.observe(s, settings, now + 4000), null);
  const valid = validateTransitionSettings(settings, ['live', 'economy']); assert.equal(valid.rules.length, 1); assert.throws(() => validateTransitionSettings(settings, ['live']), /无效/);
});
