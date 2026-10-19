import { createFixture as createSeed, emptyFixture } from './test-support/fixture';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, normalizeSavedState, publicState, resetRuntimeState } from './state';
import { captureProgram, programState, publishProgram } from '../shared/production';
import { pendingContent } from '../shared/presentation';
import type { BroadcastState } from '../shared/types';

function automaticDraft() {
  const s = createSeed();
  s.phase = 'draft'; s.paused = true;
  s.programScene = s.previewScene = 'draft';
  s.production!.rules.mode = 'standard';
  s.production!.program = captureProgram(s);
  return s;
}
const edit = (s: BroadcastState, champion: string) => applyAction(s, { type: 'set-draft', patch: { bluePicks: [champion, ...s.draft.bluePicks.slice(1)] } });
const mode = (s: BroadcastState, value: 'auto' | 'manual' | 'compare') => applyAction(s, { type: 'production', command: { op: 'draft-mode', mode: value, resolution: 'client' } });

test('manual pending BP holds the latest automatic picture without rewriting the last TAKE', () => {
  let s = automaticDraft();
  const taken = structuredClone(s.production!.program!);
  // Automatic source has progressed after TAKE, including preselect and timer.
  s.draft.bluePicks[0] = 'Gwen'; s.draft.bluePreselect = ['Ashe']; s.draft.timer = 13;
  const visible = structuredClone(programState(s).draft);
  assert.equal(visible.bluePicks[0], 'Gwen');
  assert.deepEqual(s.production!.program, taken);
  s = edit(s, 'Akali');
  assert.equal(s.draft.bluePicks[0], 'Akali');
  assert.deepEqual(programState(s).draft, visible, 'freeze the picture seen at handoff, not the older TAKE hero');
  assert.deepEqual(s.production!.program, taken, 'pending edits cannot rewrite the accepted programme snapshot');
  assert.ok(pendingContent(s).includes('BP'));
  s = edit(s, 'Ashe'); s.gameTime += 9; s.players[0].cs += 4;
  assert.deepEqual(programState(s).draft, visible, 'a second save cannot move the hold boundary');
  assert.equal(programState(s).gameTime, s.gameTime);
  assert.equal(programState(s).players[0].cs, s.players[0].cs, 'same-game telemetry continues');
});

test('same-scene re-TAKE publishes manual BP; undo and redo restore each visible programme', () => {
  let s = automaticDraft(); s.draft.bluePicks[0] = 'Gwen';
  s = edit(s, 'Akali');
  s = applyAction(s, { type: 'take', scene: 'draft' });
  assert.equal(programState(s).draft.bluePicks[0], 'Akali');
  assert.equal(s.production!.program!.draftManual, true);
  assert.equal(s.production!.programDraftHold, undefined);
  assert.equal(s.production!.application!.status, 'requested', 'offline acceptance is not OBS application');
  s = edit(s, 'Ashe');
  assert.equal(programState(s).draft.bluePicks[0], 'Akali');
  const undo = () => { s = applyAction(s, { type: 'production', command: { op: 'immediate', action: 'undo' } }); };
  undo(); assert.equal(programState(s).draft.bluePicks[0], 'Gwen', 'undo restores the last visible automatic hero');
  assert.equal(s.draft.bluePicks[0], 'Ashe', 'undo does not replace pending edits');
  undo(); assert.equal(programState(s).draft.bluePicks[0], 'Akali');
  s = applyAction(s, { type: 'take', scene: 'draft' });
  assert.equal(programState(s).draft.bluePicks[0], 'Ashe');
});

for (const takeover of ['manual', 'compare', 'clear', 'undo'] as const) test(`${takeover} starts a hold before modifying BP`, () => {
  let s = automaticDraft(); s.draft.bluePicks[0] = 'Gwen';
  const visible = structuredClone(s.draft), taken = structuredClone(s.production!.program);
  if (takeover === 'clear' || takeover === 'undo') {
    s.production!.draftUndo = [{ ...structuredClone(s.draft), bluePicks: ['Akali'] }];
    s = applyAction(s, { type: 'production', command: { op: takeover === 'clear' ? 'draft-clear' : 'draft-undo', reason: '回归：核对无效 BP' } });
  } else s = mode(s, takeover);
  s = edit(s, 'Ashe');
  assert.deepEqual(programState(s).draft, visible);
  assert.deepEqual(s.production!.program, taken);
});

for (const manualTake of [false, true]) test(`restoring automatic BP is pending until TAKE (manual TAKE=${manualTake})`, () => {
  let s = automaticDraft(); s.draft.bluePicks[0] = 'Gwen'; s = edit(s, 'Akali');
  if (manualTake) s = applyAction(s, { type: 'take', scene: 'draft' });
  const onAir = structuredClone(programState(s).draft);
  s.production!.clientDraft = { draft: { ...structuredClone(s.draft), bluePicks: ['Ashe'] }, players: structuredClone(s.players), at: new Date().toISOString() };
  s = mode(s, 'auto');
  assert.equal(s.draft.bluePicks[0], 'Ashe');
  assert.deepEqual(programState(s).draft, onAir);
  assert.ok(pendingContent(s).includes('BP'), 'pending source/hero changes stay visible even in auto mode');
  s.draft.bluePicks[0] = 'Gnar';
  assert.deepEqual(programState(s).draft, onAir, 'new automatic samples do not bypass staged source selection');
  s = applyAction(s, { type: 'take', scene: 'draft' });
  assert.equal(programState(s).draft.bluePicks[0], 'Gnar');
  assert.equal(s.production!.program!.draftManual, false);
  s.draft.bluePicks[0] = 'Ashe'; s.draft.timer = 3;
  assert.equal(programState(s).draft.bluePicks[0], 'Ashe', 'normal automatic progression resumes after TAKE');
  assert.equal(programState(s).draft.timer, 3);
});

test('pending hold survives serialization/restart and cannot follow a new attempt', () => {
  let s = automaticDraft(); s.draft.bluePicks[0] = 'Gwen'; s = edit(s, 'Akali');
  s = normalizeSavedState(JSON.parse(JSON.stringify(publicState(s)))); resetRuntimeState(s);
  assert.equal(programState(s).draft.bluePicks[0], 'Gwen');
  assert.equal(s.production!.program!.draft.bluePicks[0], 'Aatrox');
  assert.equal(s.draft.bluePicks[0], 'Akali');
  s = applyAction(s, { type: 'production', command: { op: 'remake', reason: '回归：新尝试' } });
  s = edit(s, 'Ashe');
  assert.equal(programState(s).draft.bluePicks[0], 'Gwen');
  s = applyAction(s, { type: 'take', scene: 'draft' });
  assert.equal(programState(s).draft.bluePicks[0], 'Ashe');
  assert.equal(s.production!.programDraftHold, undefined);
});

test('unpublished source preparation preserves held BP; publication clears only the completed hold', () => {
  let s = automaticDraft(); s.draft.bluePicks[0] = 'Gwen'; s = edit(s, 'Akali');
  const candidate = applyAction(s, { type: 'take', scene: 'draft' });
  assert.equal(programState(s).draft.bluePicks[0], 'Gwen', 'failed/uncompleted preparation cannot publish');
  s.gameTime += 7;
  publishProgram(s, candidate);
  assert.equal(programState(s).draft.bluePicks[0], 'Akali');
  assert.equal(s.production!.programDraftHold, undefined);
  assert.equal(programState(s).gameTime, s.gameTime);
});

test('legacy manual state without a hold falls back to its accepted snapshot, never pending draft', () => {
  let s = automaticDraft();
  s.production!.draftMode = 'manual'; s.draft.bluePicks[0] = 'Akali';
  assert.equal(programState(s).draft.bluePicks[0], 'Aatrox');
  s = mode(s, 'auto');
  assert.equal(programState(s).draft.bluePicks[0], 'Aatrox');
  assert.ok(pendingContent(s).includes('BP'));
});
