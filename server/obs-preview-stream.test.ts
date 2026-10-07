import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import { OBS_SNAPSHOT_INTERVAL_MS, usesNativeObsPreview } from '../shared/obs-preview-policy';
import { ObsPreviewStream } from './obs-preview-stream';

class Socket extends EventEmitter {
  readyState = 1; bufferedAmount = 0;
  frames: Buffer[] = []; messages: string[] = [];
  send(data: string | Buffer) { if (Buffer.isBuffer(data)) this.frames.push(data); else this.messages.push(data); }
  next() { this.emit('message', Buffer.from('next'), false); }
  close() { this.readyState = 3; this.emit('close'); }
  terminate() { this.close(); }
  asSocket() { return this as unknown as WebSocket; }
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('only the explicitly designated studio program can own a native display', () => {
  assert.equal(usesNativeObsPreview('program', undefined, true, true), false, 'new monitor instances default to snapshots');
  assert.equal(usesNativeObsPreview('program', 'monitor', true, true), false, 'connection settings remain sampled');
  assert.equal(usesNativeObsPreview('preview', 'program', true, true), false, 'preview cannot acquire a native display');
  assert.equal(usesNativeObsPreview('program', 'program', true, true), true);
  assert.equal(usesNativeObsPreview('preview', 'dynamic', true, true), true, 'optional main preview may acquire a native projector');
  assert.equal(usesNativeObsPreview('preview', 'dynamic', false, true), false, 'browser keeps snapshots');
  assert.equal(usesNativeObsPreview('preview', 'dynamic', true, false), false, 'external OBS keeps snapshots');
  assert.equal(usesNativeObsPreview('program', 'program', false, true), false, 'browser falls back to snapshots');
  assert.equal(usesNativeObsPreview('program', 'program', true, false), false, 'external OBS falls back to snapshots');
  assert.equal(OBS_SNAPSHOT_INTERVAL_MS, 1000);
});

test('snapshot producer enforces one frame per second despite fast acknowledgements and new subscribers', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const captureTimes: number[] = [];
  const stream = new ObsPreviewStream(async () => { captureTimes.push(Date.now()); return Buffer.from(`frame-${captureTimes.length}`); });
  t.after(() => stream.close());
  const first = new Socket(); stream.attach(first.asSocket(), 'program'); await settle();
  assert.equal(first.frames.length, 1, 'first frame is available immediately');
  for (let acknowledgement = 0; acknowledgement < 100; acknowledgement++) first.next();
  t.mock.timers.tick(500); await settle();
  const second = new Socket(); stream.attach(second.asSocket(), 'program'); await settle();
  t.mock.timers.tick(499); await settle();
  assert.equal(captureTimes.length, 1, 'joining a channel cannot restart its sampling clock');
  t.mock.timers.tick(1); await settle();
  assert.equal(first.frames.length, 2); assert.equal(second.frames.length, 1);
  assert.deepEqual(captureTimes, [100000, 101000]);
  assert.equal(first.frames.at(-1)!.toString(), second.frames.at(-1)!.toString(), 'one capture is shared');
  first.next(); second.next();
  t.mock.timers.tick(1000); await settle();
  assert.deepEqual(captureTimes, [100000, 101000, 102000]);
});

test('decode backpressure skips idle and slow subscribers and closing clients stops capture', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  let captures = 0;
  const stream = new ObsPreviewStream(async () => Buffer.from(`frame-${++captures}`));
  t.after(() => stream.close());
  const slow = new Socket(), fast = new Socket(); stream.attach(slow.asSocket(), 'program'); stream.attach(fast.asSocket(), 'program');
  await settle(); assert.equal(captures, 1); assert.equal(slow.frames.length, 1); assert.equal(fast.frames.length, 1);
  t.mock.timers.tick(10000); await settle();
  assert.equal(captures, 1, 'producer sleeps while every client is waiting to decode');
  fast.next(); await settle();
  assert.equal(captures, 2); assert.equal(fast.frames.length, 2); assert.equal(slow.frames.length, 1);
  slow.next(); fast.next(); t.mock.timers.tick(1000); await settle();
  assert.equal(captures, 3); assert.equal(fast.frames.length, 3); assert.equal(slow.frames.length, 2);
  slow.close(); fast.close(); t.mock.timers.tick(10000); await settle();
  assert.equal(captures, 3);
});

test('preview and program use distinct sources and buffered clients recover without blocking healthy clients', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const kinds: string[] = [];
  const stream = new ObsPreviewStream(async kind => { kinds.push(kind); return Buffer.from(kind); });
  t.after(() => stream.close());
  const preview = new Socket(), program = new Socket(); preview.bufferedAmount = 300 * 1024;
  stream.attach(preview.asSocket(), 'preview'); stream.attach(program.asSocket(), 'program'); await settle();
  assert.deepEqual(kinds, ['program']); assert.equal(program.frames[0].toString(), 'program');
  preview.bufferedAmount = 0; t.mock.timers.tick(999); await settle();
  assert.equal(preview.frames.length, 0);
  t.mock.timers.tick(1); await settle(); assert.equal(preview.frames[0].toString(), 'preview');
  assert.deepEqual(kinds, ['program', 'preview']);
});

test('an in-flight capture never overlaps and is discarded when the last subscriber leaves', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  let finishCapture!: (pixels: Buffer) => void;
  let captures = 0;
  const stream = new ObsPreviewStream(() => { captures++; return new Promise(resolve => { finishCapture = resolve; }); });
  t.after(() => stream.close());
  const client = new Socket(); stream.attach(client.asSocket(), 'preview');
  client.next(); t.mock.timers.tick(10000); await settle();
  assert.equal(captures, 1, 'acknowledgements cannot start a concurrent producer');
  client.close(); finishCapture(Buffer.from('late frame')); await settle();
  t.mock.timers.tick(10000); await settle();
  assert.equal(captures, 1); assert.equal(client.frames.length, 0);
});

test('capture failures send safe status and close subscribers for reconnection', async t => {
  const stream = new ObsPreviewStream(async () => { throw new Error('secret upstream diagnostic'); });
  t.after(() => stream.close());
  const client = new Socket(); stream.attach(client.asSocket(), 'program'); await settle();
  assert.equal(client.readyState, 3); assert.equal(client.frames.length, 0); assert.match(client.messages.at(-1)!, /实时画面读取失败/);
  assert.ok(!client.messages.join('').includes('secret'));
});
