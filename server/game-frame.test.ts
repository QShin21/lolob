import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureGameFrame } from './game-frame';

test('calibration and OCR prefer the original OBS frame and avoid screen capture', async () => {
  const frame = Buffer.from('obs');
  assert.equal(await captureGameFrame(async () => frame, async () => { throw new Error('must not run'); }), frame);
});
test('failed OBS screenshot falls back to the visible game frame', async () => {
  const frame = Buffer.from('game');
  assert.equal(await captureGameFrame(async () => { throw new Error('GetSourceScreenshot failed'); }, async () => frame), frame);
});
test('unavailable game reports both capture failures rather than an opaque image error', async () => {
  await assert.rejects(captureGameFrame(async () => { throw new Error('OBS disconnected'); }, async () => { throw new Error('game occluded'); }), /OBS disconnected.*game occluded/);
});

test('Windows persistent capture worker returns a native-size PNG through the calibration path', {skip:process.platform !== 'win32'}, async () => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { default: os } = await import('node:os');
  const { default: path } = await import('node:path');
  const { default: sharp } = await import('sharp');
  const { SpectatorOcrWorker } = await import('./spectator-ocr-worker');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'riftcast-frame-test-'));
  const worker = new SpectatorOcrWorker();
  try {
    const input = path.join(directory, 'input.png'), output = path.join(directory, 'output.png');
    await sharp({create:{width:1920,height:1080,channels:3,background:'#31758a'}}).png().toFile(input);
    const result = await worker.request(['-ImagePath', input, '-CapturePath', output]);
    assert.equal(result.ok, true, result.error);
    const frame = await captureGameFrame(async () => { throw new Error('OBS unavailable'); }, () => readFile(output));
    const decoded = await sharp(frame).removeAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(decoded.info.width, 1920); assert.equal(decoded.info.height, 1080);
    assert.deepEqual([...decoded.data.subarray(0,3)], [49,117,138]);
  } finally { await worker.close(); await rm(directory, {recursive:true,force:true}); }
});
