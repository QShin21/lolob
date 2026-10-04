// Opt-in Windows integration check. Starts only the bundled engine and records a short local sample.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 3892;
const existingOrigin = process.env.RIFTCAST_OBS_VALIDATE_ORIGIN;
const origin = existingOrigin || `http://127.0.0.1:${port}`;
const parsedOrigin = new URL(origin);
assert.equal(parsedOrigin.hostname, '127.0.0.1'); assert.equal(parsedOrigin.protocol, 'http:');
const evidence = path.resolve(process.env.RIFTCAST_OBS_VALIDATE_DIR || path.join(root, 'verification-output', 'obs'));
const videos = path.join(root, 'data', 'videos');
if (!existingOrigin) {
  try { await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(500) }); throw new Error('验证端口已占用，请先关闭 3892 上的服务'); }
  catch (error) { if (error.message === '验证端口已占用，请先关闭 3892 上的服务') throw error; }
}
await mkdir(evidence, { recursive: true });
await mkdir(videos, { recursive: true });
const prior = new Set(await readdir(videos));
const service = existingOrigin ? undefined : spawn(process.execPath, ['--import', 'tsx', path.join(root, 'server', 'index.ts')], {
  cwd: root, windowsHide: true,
  env: { ...process.env, PORT: String(port), ENABLE_LAN: '0', RIFTCAST_DATA_DIR: path.join(evidence, 'service-data'), RIFTCAST_OBS_MODE: 'embedded', RIFTCAST_OBS_AUTOSTART: '1', RIFTCAST_AUTO_CONNECT: '0' },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
service?.stdout.on('data', () => {});
service?.stderr.on('data', () => {});
const api = async (route, body) => {
  const response = await fetch(origin + route, { signal: AbortSignal.timeout(45000), ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
};
let recordingOwned = false;
try {
  let status;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (service && service.exitCode !== null) throw new Error('验证服务已退出');
    try {
      status = await api('/api/obs/engine');
      if (status.connected && status.inputs.length >= 4) break;
      if (status.error && !status.running) throw new Error(status.error);
    } catch (error) { if (error.message?.includes('OBS')) throw error; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(status?.connected && status.inputs.length >= 4, JSON.stringify(status));
  assert.equal(status.mode, 'embedded');
  assert.equal(status.streamActive, false);
  assert.equal(status.recordActive, false);
  console.log(`内置 OBS ${status.version} 已${existingOrigin ? '复用现有连接' : '自动连接'}，${status.inputs.length} 个来源就绪。`);
  // The browser source loads its renderer after OBS has registered the input.
  await new Promise(resolve => setTimeout(resolve, 2500));
  const preview = await api('/api/obs/engine/preview');
  const pixels = Buffer.from(preview.imageData.split(',')[1], 'base64');
  assert.ok(pixels[0] === 0xff && pixels[1] === 0xd8 && pixels.length > 1000);
  await writeFile(path.join(evidence, 'composite.jpg'), pixels);
  const started = await api('/api/obs/engine/output', { action: 'start-record' });
  assert.equal(started.recordActive, true);
  recordingOwned = true;
  const samples = [];
  for (let index = 0; index < 4; index++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const current = await api('/api/obs/engine');
    assert.equal(current.streamActive, false); assert.equal(current.recordActive, true);
    if (current.performance) samples.push(current.performance);
  }
  const stopped = await api('/api/obs/engine/output', { action: 'stop-record' });
  assert.equal(stopped.recordActive, false);
  recordingOwned = false;
  const directory = existingOrigin ? videos : path.join(evidence, 'service-data', 'videos');
  const files = (await readdir(directory)).filter(file => !prior.has(file) && file.endsWith('.mkv'));
  assert.equal(files.length, 1, '短录制应生成一个新 MKV');
  const video = path.join(directory, files[0]);
  const metadata = await stat(video);
  const binary = await readFile(video);
  assert.ok(binary.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && metadata.size > 10000, '录制具有有效 Matroska 容器头与非空媒体数据');
  assert.ok(binary.includes(Buffer.from('V_MPEG4/ISO/AVC')), '录制包含 H.264 视频轨');
  // Matroska DefaultDuration is an unsigned EBML integer containing nanoseconds per frame.
  const durationTag = binary.indexOf(Buffer.from([0x23, 0xe3, 0x83]));
  let frameDuration;
  if (durationTag >= 0) {
    let marker = 0x80, sizeBytes = 1; const first = binary[durationTag + 3];
    while (!(first & marker) && sizeBytes < 8) { marker >>= 1; sizeBytes++; }
    let size = first & (marker - 1);
    for (let index = 1; index < sizeBytes; index++) size = size * 256 + binary[durationTag + 3 + index];
    if (size > 0 && size <= 6) {
      frameDuration = 0;
      for (let index = 0; index < size; index++) frameDuration = frameDuration * 256 + binary[durationTag + 3 + sizeBytes + index];
    }
  }
  const frameRate = frameDuration ? 1e9 / frameDuration : null;
  if (status.performance?.configuredFps === 60) assert.ok(frameRate && frameRate >= 59.9 && frameRate <= 60.1, '视频轨需具有 60 FPS 帧时长');
  const logDirectory = path.join(root, 'runtime', 'obs-studio', 'config', 'obs-studio', 'logs');
  const latestLog = (await readdir(logDirectory)).filter(file => file.endsWith('.txt')).sort().at(-1);
  const logContent = latestLog ? await readFile(path.join(logDirectory, latestLog), 'utf8') : '';
  const nvencConfirmed = /nvenc[^\r\n]*simple_video_(?:stream|record)/i.test(logContent);
  if (status.performance?.encoder === 'nvenc') assert.ok(nvencConfirmed, 'OBS 录制日志需确认实际实例化了 NVENC 编码器');
  const report = { verifiedAt: new Date().toISOString(), version: status.version, mode: status.mode, automaticConnection: !existingOrigin, inputs: status.inputs, preview: { file: path.join(evidence, 'composite.jpg'), size: pixels.length }, recording: { file: video, bytes: metadata.size, sha256: createHash('sha256').update(binary).digest('hex'), container: 'Matroska', codec: 'H.264', frameRate, encoder: status.performance?.encoder ?? null, nvencConfirmed, logFile: latestLog }, performanceSamples: samples, streamStarted: false, validationBoundary: '本机短录制与 OBS 帧统计；平台接收端与真实比赛运动流畅度需另行核对' };
  await writeFile(path.join(evidence, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(`合成预览 ${pixels.length} 字节；本地 MKV 录制 ${metadata.size} 字节；未开始推流。`);
} finally {
  if (recordingOwned) await api('/api/obs/engine/output', { action: 'stop-record' }).catch(() => {});
  if (service && service.exitCode === null) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('验证服务关闭超时')), 55000);
      service.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('验证服务退出异常')); });
      service.send({ type: 'riftcast-shutdown' });
    });
  }
}
console.log(existingOrigin ? '已保留现有引擎与服务，仅停止验证录制。' : '验证服务已正常退出，OBS 由服务回收。');
