import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OBSResponseTypes } from 'obs-websocket-js';
import { ObsPerformanceMonitor } from './obs-performance';

const stats = (patch = {}) => ({ activeFps: 60, cpuUsage: 3, averageFrameRenderTime: 1, renderSkippedFrames: 0, renderTotalFrames: 100, outputSkippedFrames: 0, outputTotalFrames: 100, ...patch }) as OBSResponseTypes['GetStats'];
const stream = (patch = {}) => ({ outputActive: true, outputReconnecting: false, outputDuration: 1000, outputBytes: 1000, outputCongestion: 0, outputSkippedFrames: 0, outputTotalFrames: 100, ...patch }) as OBSResponseTypes['GetStreamStatus'];

test('performance separates recent rendering, encoding and RTMP network frame loss', () => {
  const monitor = new ObsPerformanceMonitor();
  const first = monitor.sample(stats(), stream(), true, 60, 'nvenc', 1000);
  assert.equal(first.sampleSeconds, 0); assert.equal(first.network.bitrateKbps, 0);
  const sampled = monitor.sample(stats({ renderSkippedFrames: 2, renderTotalFrames: 200, outputSkippedFrames: 4, outputTotalFrames: 200 }), stream({ outputDuration: 3000, outputBytes: 1501000, outputSkippedFrames: 8, outputTotalFrames: 200 }), true, 60, 'nvenc', 3000);
  assert.equal(sampled.rendering.percent, 2); assert.equal(sampled.encoding.percent, 4); assert.equal(sampled.network.percent, 8);
  assert.equal(sampled.network.bitrateKbps, 6000); assert.equal(sampled.issues.length, 3);
});

test('counter resets and idle output do not replay historical or negative loss rates', () => {
  const monitor = new ObsPerformanceMonitor();
  monitor.sample(stats({ renderSkippedFrames: 40, renderTotalFrames: 1000 }), stream({ outputDuration: 50000 }), true, 30, 'x264', 1000);
  const reset = monitor.sample(stats(), stream(), true, 30, 'x264', 3000);
  assert.equal(reset.sampleSeconds, 0); assert.equal(reset.rendering.frames, 0);
  const stopped = monitor.sample(stats({ outputSkippedFrames: 100 }), stream({ outputActive: false }), false, 30, 'x264', 5000);
  assert.equal(stopped.encoding.frames, 0); assert.equal(stopped.network.frames, 0);
  assert.equal(stopped.hardwareEncoding, false);
});
