import { createFixture as createSeed, emptyFixture } from './test-support/fixture';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyAction, normalizeSavedState } from './state';
import { programState } from '../shared/production';
import { pendingContent } from '../shared/presentation';
import { ControlSeats } from './control-seats';
import { ObsCustomScenes } from './obs-custom-scenes';
import { Adapters, ChampionCatalog } from './adapters';
import type { CustomScene } from '../shared/types';

const scene: CustomScene = { id: 'custom:test', name: '嘉宾连线', background: '#123456', sources: [
  { id: 'photo', name: '背景', kind: 'image', assetId: 'picture', x: 0, y: 0, width: 1920, height: 1080, fit: 'cover', visible: true },
  { id: 'app', name: '应用窗口', kind: 'window', window: 'Fixture:Window:fixture.exe', x: 200, y: 100, width: 800, height: 600, fit: 'contain', visible: true },
] };
function seed() { const s = createSeed(); s.assets.push({ id: 'picture', name: '背景', url: '/uploads/picture.png', type: 'image/png', createdAt: new Date().toISOString() }); return s; }

test('custom edits remain staged through save, reload and deletion; TAKE freezes content', () => {
  let s = applyAction(seed(), { type: 'save-custom-scene', scene });
  assert.equal(s.production?.configVersion, 2);
  assert.equal(programState(s).customScenes?.length, 0);
  s = applyAction(s, { type: 'preview-scene', scene: scene.id });
  assert.equal(s.programScene, 'live');
  s = applyAction(s, { type: 'take' });
  assert.equal(programState(s).customScenes?.[0].name, '嘉宾连线');
  const changed = { ...scene, name: '更新的嘉宾', sources: scene.sources.slice(0, 1) };
  s = applyAction(s, { type: 'save-custom-scene', scene: changed });
  assert.equal(programState(s).customScenes?.[0].name, '嘉宾连线');
  assert.equal(programState(s).customScenes?.[0].sources.length, 2);
  assert.ok(pendingContent(s).includes('自定义场景'));
  s = normalizeSavedState(JSON.parse(JSON.stringify(s)));
  assert.equal(s.customScenes?.[0].name, '更新的嘉宾');
  assert.equal(programState(s).customScenes?.[0].name, '嘉宾连线');
  assert.throws(() => applyAction(s, { type: 'delete-custom-scene', id: scene.id }), /先切入/);
  s = applyAction(s, { type: 'take', scene: 'standby' });
  s = applyAction(s, { type: 'delete-custom-scene', id: scene.id });
  assert.equal(s.previewScene, 'standby'); assert.equal(s.customScenes?.length, 0); assert.equal(s.assets.length, 1);
  assert.throws(() => applyAction(s, { type: 'take', scene: scene.id }), /不存在/);
});

test('custom scenes validate references, geometry, limits and control seat permissions', () => {
  for (const invalid of [
    { ...scene, name: ' ' }, { ...scene, id: '../escape' }, { ...scene, background: 'url(file)' },
    { ...scene, sources: [{ ...scene.sources[0], assetId: 'missing' }] },
    { ...scene, sources: [{ ...scene.sources[0], x: Infinity }] },
    { ...scene, sources: [{ ...scene.sources[0], width: 0 }] },
    { ...scene, sources: [scene.sources[0], scene.sources[0]] },
    { ...scene, sources: Array(25).fill(scene.sources[0]) },
    { ...scene, sources: [{ ...scene.sources[0], kind: 'obs', inputName: 'RiftCast 自定义 recursive' }] },
  ]) assert.throws(() => applyAction(seed(), { type: 'save-custom-scene', scene: invalid }));
  const s = seed(); s.assets[0].url = '/uploads/../state.json';
  assert.throws(() => applyAction(s, { type: 'save-custom-scene', scene }), /图片/);
  const restored = normalizeSavedState({ ...seed(), customScenes: [{ ...scene, background: 'bad' }], previewScene: scene.id });
  assert.deepEqual(restored.customScenes, []); assert.equal(restored.previewScene, 'standby');
  const seats = new ControlSeats(), owner = seats.issue({}, true), data = seats.issue({ role: 'data' }, true);
  assert.throws(() => seats.authorize(data.token, 'save-custom-scene'), /主导播/);
  assert.equal(seats.authorize(owner.token, 'save-custom-scene').role, 'director');
});

class FakeObs {
  requests: { type: string; data: any }[] = [];
  scenes = new Map<string, any[]>([['live', []]]);
  inputs = new Map<string, { inputName: string; inputKind: string }>([['camera', { inputName: 'camera', inputKind: 'dshow_input' }], ['RiftCast 桌面音频', { inputName: 'RiftCast 桌面音频', inputKind: 'wasapi_output_capture' }]]);
  program = 'live'; preview = 'live'; studio = false; next = 1; windows = [scene.sources[1].window]; failTransform = false;
  call: any = async (type: string, data: any = {}) => {
    this.requests.push({ type, data });
    if (type === 'GetInputList') return { inputs: [...this.inputs.values()] };
    if (type === 'GetStudioModeEnabled') return { studioModeEnabled: this.studio };
    if (type === 'SetStudioModeEnabled') { this.studio = data.studioModeEnabled; return {}; }
    if (type === 'GetCurrentProgramScene') return { sceneName: this.program };
    if (type === 'GetCurrentPreviewScene') return { sceneName: this.preview };
    if (type === 'SetCurrentPreviewScene') { this.preview = data.sceneName; return {}; }
    if (type === 'GetVideoSettings') return { baseWidth: 1280, baseHeight: 720 };
    if (type === 'GetSceneList') return { scenes: [...this.scenes.keys()].map(sceneName => ({ sceneName })), currentProgramSceneName: this.program, currentPreviewSceneName: this.preview };
    if (type === 'CreateScene') { this.scenes.set(data.sceneName, []); return {}; }
    if (type === 'CreateInput' || type === 'CreateSceneItem') {
      const id = this.next++;
      if (type === 'CreateInput') assert.ok(!this.scenes.has(data.inputName), 'OBS scene and input names share a namespace');
      if (type === 'CreateInput') this.inputs.set(data.inputName, { inputName: data.inputName, inputKind: data.inputKind });
      this.scenes.get(data.sceneName)!.push({ sceneItemId: id, sourceName: data.sourceName ?? data.inputName });
      return { sceneItemId: id };
    }
    if (type === 'GetInputPropertiesListPropertyItems') return { propertyItems: this.windows.map(w => ({ itemName: 'Fixture app', itemValue: w, itemEnabled: true })) };
    if (type === 'SetSceneItemTransform') { if (this.failTransform) throw new Error('Transform failed'); return {}; }
    if (type === 'RemoveScene') { this.scenes.delete(data.sceneName); return {}; }
    if (type === 'RemoveInput') { this.inputs.delete(data.inputName); return {}; }
    throw new Error(`Unexpected OBS request: ${type}`);
  };
}

test('OBS builds independent layers, validates missing windows and preserves borrowed sources on failure', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'riftcast-custom-unit-'));
  try {
    await mkdir(path.join(dir, 'uploads')); await writeFile(path.join(dir, 'uploads/picture.png'), 'fixture');
    const obs = new FakeObs(), compositor = new ObsCustomScenes(obs.call, dir), s = seed();
    const choices = await compositor.choices();
    assert.deepEqual(choices.windows, [{ name: 'Fixture app', value: scene.sources[1].window }]);
    assert.deepEqual(choices.inputs.map(i => i.name), ['camera']);
    assert.equal(obs.scenes.size, 1, 'temporary window-list scene is removed');
    const preview = await compositor.prepare(scene, s, 'preview'); obs.preview = preview;
    assert.equal(obs.program, 'live');
    const transforms = obs.requests.filter(r => r.type === 'SetSceneItemTransform');
    assert.equal(transforms[0].data.sceneItemTransform.boundsWidth, 1280);
    assert.equal(transforms[0].data.sceneItemTransform.cropToBounds, true);
    assert.ok(Math.abs(transforms[1].data.sceneItemTransform.positionX - 200 * 2 / 3) < 1e-9);
    assert.equal(obs.requests.find(r => r.type === 'CreateInput' && r.data.inputKind === 'window_capture' && r.data.inputSettings.window)?.data.inputSettings.capture_audio, false);
    const program = await compositor.prepare(scene, s, 'program'); obs.program = program;
    assert.notEqual(preview, program);
    assert.ok(obs.scenes.get(program)!.some(i => i.sourceName === 'RiftCast 桌面音频'));
    assert.ok(!obs.scenes.get(preview)!.some(i => i.sourceName === 'RiftCast 桌面音频'));
    obs.windows = [];
    await assert.rejects(compositor.prepare(scene, s, 'program'), /窗口已关闭/);
    obs.windows = [scene.sources[1].window];
    obs.failTransform = true;
    const borrowed: CustomScene = { ...scene, sources: [{ ...scene.sources[0], kind: 'obs', inputName: 'camera' }] };
    await assert.rejects(compositor.prepare(borrowed, s, 'preview'), /SetSceneItemTransform/);
    assert.ok(obs.inputs.has('camera')); assert.ok(obs.scenes.has(program)); assert.ok(obs.scenes.has(preview));
    assert.equal(obs.scenes.size, 3, 'failed preparation cleans its own scene');
    obs.failTransform = false;
    const edited = await compositor.prepare({ ...scene, background: '#ffffff' }, s, 'preview'); obs.preview = edited;
    await compositor.cleanup();
    assert.ok(!obs.scenes.has(preview)); assert.ok(obs.scenes.has(program)); assert.ok(obs.scenes.has(edited));
    assert.ok(!obs.requests.some(r => r.type === 'SetCurrentProgramScene' || r.type === 'SetInputSettings'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('custom scenes can be queued in rundown and cannot be deleted while referenced', () => {
  let s = applyAction(seed(), {type:'save-custom-scene',scene});
  s = applyAction(s, {type:'production',command:{op:'rundown',items:[{id:'cue',scene:scene.id,title:scene.name,seconds:30,status:'ready'}]}});
  assert.equal(s.production?.rundown[0].scene,scene.id);
  assert.throws(()=>applyAction(s,{type:'delete-custom-scene',id:scene.id}),/串联单/);
  assert.throws(()=>applyAction(s,{type:'production',command:{op:'rundown',items:[{id:'cue',scene:'custom:missing',title:'missing',seconds:30,status:'ready'}]}}),/场景不存在/);
});

for (const mode of ['embedded', 'external'] as const) test(`${mode} preview switches and returns without any screenshot subscribers`, async () => {
  let s = applyAction(seed(), {type:'save-custom-scene',scene:{...scene,sources:[]}});
  s = applyAction(s, {type:'preview-scene',scene:scene.id}); s.connections.obs.status='connected';
  const obs = new FakeObs(), adapters = new Adapters(()=>s,work=>work(s),new ChampionCatalog('unused'));
  const engineCalls:unknown[]=[];
  const internals = adapters as any;
  internals.obs.call=obs.call;
  internals.customScenes=new ObsCustomScenes(obs.call,'unused');
  internals.productionOutput={tick:async()=>{}};
  internals.engine={mode,exclusive:async(work:()=>Promise<unknown>)=>work(),setCustomPreview:(name?:string)=>engineCalls.push(name),monitor:async(options:unknown)=>{engineCalls.push(options);obs.preview='builtin-preview';}};
  await adapters.productionTick();
  assert.ok(obs.preview.startsWith('RiftCast 自定义 preview'));
  assert.equal(obs.program,'live'); assert.equal(obs.studio,true);
  s=applyAction(s,{type:'preview-scene',scene:'standby'});
  await adapters.productionTick();
  assert.equal(obs.preview,mode==='embedded'?'builtin-preview':'live');
  assert.equal(obs.program,'live');
  assert.ok(engineCalls.includes(undefined));
  if(mode==='embedded')assert.ok(engineCalls.some(call=>JSON.stringify(call)==='{"kind":"preview","open":false}'));
});
