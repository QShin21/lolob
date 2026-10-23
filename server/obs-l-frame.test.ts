import test from 'node:test';
import assert from 'node:assert/strict';
import { ObsLFrame } from './obs-l-frame';
import { lFrameGameTransform } from '../shared/l-frame';

test('L-frame applies actual game-source bounds and restores a full canvas without changing the HUD', async () => {
  const calls: { kind: string; data?: any }[] = [];
  const call: any = async (kind: string, data?: any) => {
    calls.push({ kind, data });
    if (kind === 'GetVideoSettings') return { baseWidth: 1280, baseHeight: 720 };
    if (kind === 'GetSceneItemList') return { sceneItems: [{ sourceName: 'RiftCast 游戏画面', sceneItemId: 2 }, { sourceName: 'RiftCast HUD', sceneItemId: 3 }] };
    if (kind === 'GetInputSettings') return { inputKind: 'game_capture' };
    return {};
  };
  const frame = new ObsLFrame(call);
  assert.equal((await frame.apply('RiftCast 预监', true)).applied, true);
  const enabled = calls.find(c => c.kind === 'SetSceneItemTransform')!.data;
  assert.equal(enabled.sceneItemId, 2); assert.equal(enabled.sceneName, 'RiftCast 预监');
  assert.deepEqual(enabled.sceneItemTransform, lFrameGameTransform(true, 1280, 720));
  assert.equal(enabled.sceneItemTransform.boundsWidth / enabled.sceneItemTransform.boundsHeight, 16 / 9);
  await frame.apply('RiftCast 节目', false);
  const restored = calls.filter(c => c.kind === 'SetSceneItemTransform').at(-1)!.data.sceneItemTransform;
  assert.equal(restored.positionX, 0); assert.equal(restored.boundsWidth, 1280); assert.equal(restored.boundsHeight, 720);
});
test('L-frame reports unsupported or missing sources without transforming another input', async () => {
  const call: any = async (kind: string) => kind === 'GetVideoSettings' ? { baseWidth: 1920, baseHeight: 1080 } : kind === 'GetSceneItemList' ? { sceneItems: [] } : assert.fail(kind);
  const frame = new ObsLFrame(call);
  assert.equal((await frame.apply('custom scene', true)).applied, false);
  assert.equal((await frame.apply('RiftCast 节目', true)).applied, false);
});
