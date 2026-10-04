import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EconomyRoi } from '../shared/types';

export interface OcrWorkerReading {
  ok: boolean; blueText?: string; redText?: string; error?: string; playerWords?: unknown; playerPortraits?: unknown; playerError?: string;
  blueRoi?: EconomyRoi; redRoi?: EconomyRoi; [key: string]: unknown;
}
type WorkerOptions = { spawn?: () => ChildProcessWithoutNullStreams; timeoutMs?: number; closeTimeoutMs?: number; maxOutputBytes?: number };
type Pending = { id: number; resolve: (reading: OcrWorkerReading) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
type Starting = { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
const workerScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/spectator-ocr-worker.ps1');

/** One serialized OCR lane reuses Windows OCR engines and compiled portrait code. */
export class SpectatorOcrWorker {
  private child?: ChildProcessWithoutNullStreams;
  private pending?: Pending;
  private starting?: Starting;
  private initialized = false;
  private output = '';
  private nextId = 0;
  private closed = false;
  private queue: Promise<void> = Promise.resolve();
  private closing?: Promise<void>;
  private readonly create: () => ChildProcessWithoutNullStreams;
  private readonly timeout: number;
  private readonly closeTimeout: number;
  private readonly outputLimit: number;

  constructor(options: WorkerOptions = {}) {
    this.create = options.spawn ?? (() => spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', workerScript], { windowsHide: true, stdio: 'pipe' }));
    this.timeout = options.timeoutMs ?? 12000;
    this.closeTimeout = options.closeTimeoutMs ?? 750;
    this.outputLimit = options.maxOutputBytes ?? 256 * 1024;
  }

  request(args: string[]): Promise<OcrWorkerReading> {
    if (!Array.isArray(args) || args.length > 64 || args.some(arg => typeof arg !== 'string' || arg.length > 4096 || /[\r\n\0]/.test(arg))) return Promise.reject(new Error('OCR 请求参数无效'));
    const parameters = [...args];
    return this.enqueue(() => this.execute(parameters));
  }

  /** Initialize the OCR runtime without capturing or reading a frame. */
  ready(): Promise<void> {
    return this.enqueue(async () => { await this.runtime(); });
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(work);
    this.queue = operation.then(() => {}, () => {});
    return operation;
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const child = this.create(); this.child = child; this.output = ''; this.initialized = false;
    let resolve!: () => void, reject!: (error: Error) => void;
    const promise = new Promise<void>((accept, decline) => { resolve = accept; reject = decline; });
    const timer = setTimeout(() => { void this.fail(child, new Error('Windows OCR 初始化超时，下一次采样将重新启动')); }, this.timeout);
    this.starting = { promise, resolve, reject, timer };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.receive(child, chunk));
    // Drain diagnostic output without retaining potentially sensitive image paths or data.
    child.stderr.resume();
    child.once('error', () => { void this.fail(child, new Error('Windows OCR 进程未能启动')); });
    child.once('exit', () => { void this.fail(child, new Error('Windows OCR 进程已退出，下一次采样将重新启动')); });
    child.stdin.on('error', () => { void this.fail(child, new Error('Windows OCR 进程通信中断')); });
    return child;
  }

  private async runtime(): Promise<ChildProcessWithoutNullStreams> {
    if (this.closed) throw new Error('Windows OCR 采样已关闭');
    let child: ChildProcessWithoutNullStreams;
    try { child = this.start(); } catch { throw new Error('Windows OCR 进程未能启动'); }
    if (this.starting) await this.starting.promise;
    if (this.closed || child !== this.child || !this.initialized) throw new Error('Windows OCR 采样已关闭');
    return child;
  }

  private async execute(args: string[]): Promise<OcrWorkerReading> {
    const child = await this.runtime();
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { void this.fail(child, new Error('Windows OCR 采样超时，下一次采样将重新启动')); }, this.timeout);
      this.pending = { id, resolve, reject, timer };
      child.stdin.write(JSON.stringify({ type: 'read', id, args }) + '\n', error => { if (error) void this.fail(child, new Error('Windows OCR 进程通信中断')); });
    });
  }

  private receive(child: ChildProcessWithoutNullStreams, chunk: string): void {
    if (child !== this.child) return;
    this.output += chunk;
    if (Buffer.byteLength(this.output, 'utf8') > this.outputLimit) { void this.fail(child, new Error('Windows OCR 响应过大，已停止本次采样')); return; }
    for (let newline = this.output.indexOf('\n'); newline >= 0; newline = this.output.indexOf('\n')) {
      const line = this.output.slice(0, newline).trim(); this.output = this.output.slice(newline + 1);
      if (!line) continue;
      let response: Record<string, unknown>;
      try { const value: unknown = JSON.parse(line); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); response = value as Record<string, unknown>; }
      catch { void this.fail(child, new Error('Windows OCR 返回了无效通信响应')); return; }
      if (response.type === 'ready' && response.protocol === 1) {
        const starting = this.starting; this.starting = undefined; this.initialized = true;
        if (starting) { clearTimeout(starting.timer); starting.resolve(); }
        continue;
      }
      const pending = this.pending;
      if (!pending || response.id !== pending.id || response.type !== 'result' || !response.reading || typeof response.reading !== 'object' || Array.isArray(response.reading) || typeof (response.reading as OcrWorkerReading).ok !== 'boolean') {
        void this.fail(child, new Error('Windows OCR 通信协议异常，下一次采样将重新启动')); return;
      }
      clearTimeout(pending.timer); this.pending = undefined; pending.resolve(response.reading as OcrWorkerReading);
    }
  }

  private async stop(child: ChildProcessWithoutNullStreams, graceful: boolean): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>(resolve => {
      let finished = false;
      let fallback: ReturnType<typeof setTimeout> | undefined;
      const finish = () => { if (finished) return; finished = true; clearTimeout(timer); if (fallback) clearTimeout(fallback); child.removeListener('exit', finish); resolve(); };
      const timer = setTimeout(() => { child.kill(); fallback = setTimeout(finish, this.closeTimeout); }, this.closeTimeout);
      child.once('exit', finish);
      if (graceful && !child.stdin.destroyed) child.stdin.write(JSON.stringify({ type: 'shutdown' }) + '\n');
      else child.kill();
    });
  }

  private async fail(child: ChildProcessWithoutNullStreams, error: Error): Promise<void> {
    if (child !== this.child) return;
    this.child = undefined; this.output = ''; this.initialized = false;
    const starting = this.starting; this.starting = undefined; if (starting) clearTimeout(starting.timer);
    const pending = this.pending; this.pending = undefined; if (pending) clearTimeout(pending.timer);
    await this.stop(child, false); starting?.reject(error); pending?.reject(error);
  }

  close(): Promise<void> {
    this.closing ??= this.finishClose(); return this.closing;
  }
  private async finishClose(): Promise<void> {
    this.closed = true;
    const child = this.child; this.child = undefined; this.output = ''; this.initialized = false;
    const starting = this.starting; this.starting = undefined; if (starting) clearTimeout(starting.timer);
    const pending = this.pending; this.pending = undefined; if (pending) clearTimeout(pending.timer);
    if (child) await this.stop(child, true);
    const error = new Error('Windows OCR 采样已关闭'); starting?.reject(error); pending?.reject(error);
    await this.queue;
  }
}

let sharedWorker: SpectatorOcrWorker | undefined;
export async function warmSpectatorOcrWorker(): Promise<void> {
  if (process.platform !== 'win32') throw new Error('观战经济识别需要 Windows 10 / 11');
  sharedWorker ??= new SpectatorOcrWorker();
  await sharedWorker.ready();
}
export async function runPersistentSpectatorOcr(args: string[]): Promise<OcrWorkerReading> {
  if (process.platform !== 'win32') return { ok: false, error: '观战经济识别需要 Windows 10 / 11' };
  sharedWorker ??= new SpectatorOcrWorker();
  try { return await sharedWorker.request(args); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Windows OCR 采样未完成' }; }
}
export async function closeSpectatorOcrWorker(): Promise<void> {
  const worker = sharedWorker; sharedWorker = undefined; if (worker) await worker.close();
}
