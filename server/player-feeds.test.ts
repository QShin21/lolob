import { createFixture as createSeed, emptyFixture } from './test-support/fixture';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, normalizeSavedState } from './state';
import { activePlayerFeedPair, playerFeedControl, playerFeedHoldReason, playerFeedPairs, resolvedPlayerFeed, tickPlayerFeeds } from '../shared/player-feeds';

test('legacy two-person settings migrate into the jungle pair and retain the saved sources', () => {
  const old = createSeed();
  old.overlay.playerFeeds!.blue = { mode: 'camera', imageUrl: '', cameraDeviceId: 'usb-blue', label: 'BLUE JUNGLE' };
  old.overlay.playerFeeds!.red.imageUrl = '/uploads/player.jpg';
  (old as any).programScene = 'income'; (old as any).previewScene = 'income';
  const state = normalizeSavedState(old);
  assert.equal(state.programScene, 'gold-ranking'); assert.equal(state.previewScene, 'gold-ranking');
  assert.equal(state.overlay.playerFeedPairs!.length, 5);
  assert.equal(playerFeedControl(state.overlay).activeIndex, 1);
  assert.equal(activePlayerFeedPair(state.overlay).blue.cameraDeviceId, 'usb-blue');
  assert.equal(activePlayerFeedPair(state.overlay).red.imageUrl, '/uploads/player.jpg');
  assert.equal(state.overlay.playerFeedPairs![0].blue.cameraDeviceId, '');
  assert.equal(old.overlay.playerFeedPairs, undefined);
});
test('each of five pairs persists independent material settings and resolves its own lane name and portrait', () => {
  const original = createSeed(), pairs = playerFeedPairs(original.overlay);
  for (let index = 0; index < 5; index++) {
    pairs[index].blue.imageUrl = `/uploads/player-${index}.png`;
    pairs[index].red = { mode: 'camera', imageUrl: '', cameraDeviceId: `camera-${index}`, label: `RED ${index}` };
  }
  let state = applyAction(original, { type: 'set-overlay', patch: { playerFeedPairs: pairs } });
  for (let index = 0; index < 5; index++) {
    state = applyAction(state, { type: 'set-player-feed-control', mode: 'manual', activeIndex: index });
    assert.equal(activePlayerFeedPair(state.overlay).blue.imageUrl, `/uploads/player-${index}.png`);
    assert.equal(activePlayerFeedPair(state.overlay).red.cameraDeviceId, `camera-${index}`);
    assert.equal(resolvedPlayerFeed(state, 'blue').label, original.players[index].name);
    assert.equal(resolvedPlayerFeed(state, 'red').label, `RED ${index}`);
  }
  const restored = normalizeSavedState(state);
  assert.deepEqual(restored.overlay.playerFeedPairs, pairs);
  assert.equal(playerFeedControl(restored.overlay).activeIndex, 4);
  restored.overlay.playerFeedPairs![4].blue.imageUrl = '';
  restored.players[4].portrait = '/uploads/player-portrait.png';
  assert.equal(resolvedPlayerFeed(restored, 'blue').imageUrl, '/uploads/player-portrait.png');
  assert.equal(original.overlay.playerFeedPairs, undefined);
});
test('server-controlled rotation holds each pair for five seconds, wraps and stops immediately on manual cut', () => {
  let state = applyAction(createSeed(), { type: 'set-player-feed-control', mode: 'auto', activeIndex: 0 });
  state.previewScene='live';state=applyAction(state,{type:'take'});
  const start = state.overlay.playerFeedControl!.nextSwitchAt! - 5000;
  assert.equal(tickPlayerFeeds(state, start + 4999), false);
  for (let step = 1; step <= 5; step++) {
    assert.equal(tickPlayerFeeds(state, start + step * 5000), true);
    assert.equal(playerFeedControl(state.overlay).activeIndex, step % 5);
    assert.equal(tickPlayerFeeds(state, start + step * 5000 + 4999), false);
  }
  state = applyAction(state, { type: 'set-player-feed-control', mode: 'manual', activeIndex: 3 });
  state=applyAction(state,{type:'take'});
  assert.equal(tickPlayerFeeds(state, start + 100000), false);
  assert.deepEqual(state.overlay.playerFeedControl, { mode: 'manual', activeIndex: 3 });
});
test('automatic rotation waits off-air and restarts a complete slot when a live bus becomes visible', () => {
  const state = applyAction(createSeed(), { type: 'set-player-feed-control', mode: 'auto', activeIndex: 2 });
  state.programScene = 'teamfight'; state.previewScene = 'draft';
  assert.equal(tickPlayerFeeds(state, 1000), true);
  assert.equal(state.overlay.playerFeedControl!.nextSwitchAt, undefined);
  assert.equal(tickPlayerFeeds(state,2000),false);
  // Teamfight PGM must not block a live preview bus.
  state.previewScene = 'live'; tickPlayerFeeds(state, 2000);
  assert.equal(state.overlay.playerFeedControl!.nextSwitchAt, 7000);
  assert.equal(tickPlayerFeeds(state, 6999), false);
  tickPlayerFeeds(state, 7000); assert.equal(state.overlay.playerFeedControl!.activeIndex, 3);
});
test('invalid slot indices and partial or malformed pair configurations cannot mutate saved settings', () => {
  const state = createSeed();
  for (const activeIndex of [-1, 5, 1.5, '2', null]) assert.throws(() => applyAction(state, { type: 'set-player-feed-control', mode: 'manual', activeIndex }));
  assert.throws(() => applyAction(state, { type: 'set-player-feed-control', mode: 'unknown' }));
  const pairs = playerFeedPairs(state.overlay);
  assert.throws(() => applyAction(state, { type: 'set-overlay', patch: { playerFeedPairs: pairs.slice(0, 4) } }));
  pairs[0].blue.mode = 'camera';
  assert.throws(() => applyAction(state, { type: 'set-overlay', patch: { playerFeedPairs: pairs } }), /摄像头/);
  assert.equal(state.overlay.playerFeedPairs, undefined);
});
test('resume rotation clears a saved pause-induced hold without resuming the match or taking staged material',()=>{
 let s=applyAction(createSeed(),{type:'set-player-feed-control',mode:'auto',activeIndex:1});
 s.previewScene='live';s=applyAction(s,{type:'take'});
 s.production!.pause={kind:'official',reason:'旧版暂停',at:'2026-10-20T00:00:00Z',actor:'director'};
 s.production!.feedHold=true;
 tickPlayerFeeds(s,1000);assert.equal(playerFeedHoldReason(s,'preview'),'人工保持');
 const program=s.production!.program!.overlay.playerFeedControl!;
 assert.equal(program.nextSwitchAt,undefined);
 s=applyAction(s,{type:'set-player-feed-control',mode:'auto',activeIndex:4});
 assert(s.production!.pause);assert.equal(s.production!.feedHold,false);
 assert.equal(s.production!.program!.overlay.playerFeedControl!.activeIndex,1);
 const at=s.overlay.playerFeedControl!.nextSwitchAt!-5000;tickPlayerFeeds(s,at);
 tickPlayerFeeds(s,at+5000);
 assert.equal(s.overlay.playerFeedControl!.activeIndex,0);
 assert.equal(s.production!.program!.overlay.playerFeedControl!.activeIndex,2);
 s=applyAction(s,{type:'production',command:{op:'settings',feedHold:true}});
 tickPlayerFeeds(s,at+10000);assert.equal(s.production!.program!.overlay.playerFeedControl!.activeIndex,2);
});
test('preview rotation continues while program shows teamfight or a replay clip',()=>{
 let s=applyAction(createSeed(),{type:'set-player-feed-control',mode:'auto',activeIndex:0});
 s.previewScene='live';s=applyAction(s,{type:'take'});
 const at=s.overlay.playerFeedControl!.nextSwitchAt!;
 s.programScene='teamfight';tickPlayerFeeds(s,at);
 assert.equal(s.overlay.playerFeedControl!.activeIndex,1);
 assert.equal(s.production!.program!.overlay.playerFeedControl!.activeIndex,0);
 assert.match(playerFeedHoldReason(s,'program'),/团战/);assert.equal(playerFeedHoldReason(s,'preview'),'');
 s.programScene='live';s.production!.playingClipId='clip';tickPlayerFeeds(s,at+5000);
 assert.equal(s.overlay.playerFeedControl!.activeIndex,2);assert.equal(s.production!.program!.overlay.playerFeedControl!.activeIndex,0);
 delete s.production!.playingClipId;tickPlayerFeeds(s,at+6000);
 tickPlayerFeeds(s,at+10999);assert.equal(s.production!.program!.overlay.playerFeedControl!.activeIndex,0);
 tickPlayerFeeds(s,at+11000);assert.equal(s.production!.program!.overlay.playerFeedControl!.activeIndex,1);
});
