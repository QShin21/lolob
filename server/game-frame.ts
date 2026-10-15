import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPersistentSpectatorOcr } from './spectator-ocr-worker';

/** Both calibration and OCR use this uncomposited, native-resolution frame. */
export async function captureGameFrame(primary: () => Promise<Buffer>, fallback = captureVisibleGame): Promise<Buffer> {
  try { return await primary(); }
  catch (error) {
    try { return await fallback(); }
    catch (fallbackError) {
      throw new Error(`OBS 采样：${error instanceof Error ? error.message : '未就绪'}；游戏窗口采样：${fallbackError instanceof Error ? fallbackError.message : '不可用'}`);
    }
  }
}
async function captureVisibleGame(): Promise<Buffer> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'riftcast-frame-'));
  try {
    const file = path.join(directory, 'game.png');
    const result = await runPersistentSpectatorOcr(['-CapturePath', file]);
    if (!result.ok) throw new Error(result.error || '请恢复并完整显示英雄联盟游戏窗口');
    const bytes = await readFile(file);
    if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('游戏采样图格式无效');
    return bytes;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
