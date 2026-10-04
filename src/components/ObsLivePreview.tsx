import { useEffect, useRef, useState } from 'react';
import { Monitor, Pause, RefreshCw, WifiOff } from 'lucide-react';
import { OBS_SNAPSHOT_INTERVAL_MS, usesNativeObsPreview, type ObsPreviewPurpose } from '../../shared/obs-preview-policy';
import './obs-live-preview.css';

type PreviewPhase = 'waiting' | 'loading' | 'live' | 'paused' | 'error';
export type ObsPreviewStatus = {
  phase: PreviewPhase;
  message: string;
  frames: number;
  fps: number;
  updatedAt?: number;
  transport?: 'native' | 'video' | 'screenshot';
};
type Props = {
  kind: 'preview' | 'program';
  /** Only the studio's main program screen may acquire a native projector. */
  purpose?: ObsPreviewPurpose;
  connected: boolean;
  enabled?: boolean;
  className?: string;
  onStatus?: (status: ObsPreviewStatus) => void;
};
type Frame = { url: string; socket: WebSocket };

const initialStatus: ObsPreviewStatus = { phase: 'waiting', message: '引擎就绪后显示实时合成画面', frames: 0, fps: 0 };
const snapshotInitialStatus: ObsPreviewStatus = { ...initialStatus, transport: 'screenshot', message: '引擎就绪后每秒更新 1 帧合成画面' };
const isLocal = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

function ScreenshotPreview({ kind, connected, enabled = true, className = '', onStatus }: Props) {
  const [status, setStatus] = useState<ObsPreviewStatus>(snapshotInitialStatus);
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const [frame, setFrame] = useState<Frame | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const frameRef = useRef<Frame | null>(null);
  const loadedUrlRef = useRef<string | null>(null);
  const urls = useRef(new Set<string>());
  const frames = useRef(0);
  const lastLoadedAt = useRef<number | undefined>(undefined);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const revoke = (url: string | null) => {
    if (url && urls.current.delete(url)) URL.revokeObjectURL(url);
  };

  useEffect(() => { onStatusRef.current?.(status); }, [status]);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => () => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
  }, []);

  useEffect(() => {
    if (!isLocal()) {
      setStatus({ ...snapshotInitialStatus, message: '合成快照需在导播主机查看' });
      return;
    }
    if (!connected) {
      frameRef.current = null;
      loadedUrlRef.current = null;
      setFrame(null);
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
      setStatus(snapshotInitialStatus);
      return;
    }
    if (!enabled || !visible) {
      setStatus(previous => ({ ...previous, phase: 'paused', message: !enabled ? '实时预览已暂停' : '页面隐藏，实时预览已暂停', fps: 0 }));
      return;
    }

    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let connectionStartedAt = Date.now();
    let sampleStartedAt = performance.now();
    let sampleFrames = frames.current;
    let loadedOnConnection = false;
    let lastReceivedAt = Date.now();

    const updateStatus = (phase: PreviewPhase, message: string) => setStatus(previous => ({ ...previous, phase, message, fps: phase === 'live' ? previous.fps : 0 }));
    const connect = () => {
      if (stopped) return;
      updateStatus('loading', attempt ? '实时画面连接中断，正在重连' : '正在连接 OBS 合成画面');
      const url = new URL('/ws/obs-preview', location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('kind', kind);
      const token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('riftcast-control-token');
      if (token) url.searchParams.set('token', token);
      const socket = new WebSocket(url);
      socket.binaryType = 'blob';
      socketRef.current = socket;
      loadedOnConnection = false;
      connectionStartedAt = lastReceivedAt = Date.now();

      socket.onmessage = event => {
        if (stopped || socketRef.current !== socket) return;
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data) as { type?: string; status?: string; message?: string };
            if (message.type === 'error') updateStatus('error', message.message || 'OBS 合成画面暂不可用，正在重连');
            else if (message.type === 'status' && message.status === 'loading' && !loadedOnConnection) updateStatus('loading', message.message || '正在获取合成画面');
          } catch { updateStatus('error', '实时预览状态格式异常，正在重连'); socket.close(); }
          return;
        }
        if (!(event.data instanceof Blob) || !event.data.size) {
          updateStatus('error', '实时预览收到空画面，正在重连');
          socket.close();
          return;
        }
        lastReceivedAt = Date.now();
        const next: Frame = { url: URL.createObjectURL(new Blob([event.data], { type: 'image/jpeg' })), socket };
        urls.current.add(next.url);
        const pending = frameRef.current;
        if (pending && pending.url !== loadedUrlRef.current) revoke(pending.url);
        frameRef.current = next;
        setFrame(next);
      };
      socket.onerror = () => {
        if (!stopped && socketRef.current === socket) updateStatus('error', '实时画面连接中断，正在重连');
      };
      socket.onclose = () => {
        if (stopped || socketRef.current !== socket) return;
        socketRef.current = null;
        setStatus(previous => ({ ...previous, phase: 'error', message: previous.phase === 'error' ? previous.message : '实时画面连接中断，正在重连', fps: 0 }));
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 10000));
      };
    };
    connect();

    const timer = window.setInterval(() => {
      if (stopped) return;
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN && Date.now() - lastReceivedAt > 6000) {
        updateStatus('error', '合成画面暂未更新，正在重新连接');
        socket.close();
      } else if (socket?.readyState === WebSocket.CONNECTING && Date.now() - connectionStartedAt > 10000) {
        updateStatus('error', '实时预览连接超时，正在重连');
        socket.close();
      }
      const now = performance.now();
      const count = frames.current;
      if (lastLoadedAt.current && lastLoadedAt.current >= connectionStartedAt) {
        loadedOnConnection = true;
        attempt = 0;
        setStatus(previous => previous.phase === 'live' ? { ...previous, frames: count, fps: (count - sampleFrames) * 1000 / (now - sampleStartedAt), updatedAt: lastLoadedAt.current } : previous);
      }
      sampleFrames = count;
      sampleStartedAt = now;
    }, 1000);
    return () => {
      stopped = true;
      clearTimeout(retry);
      window.clearInterval(timer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connected, enabled, visible, kind]);

  function acceptFrame(current: Frame) {
    if (frameRef.current !== current) { revoke(current.url); return; }
    const previousUrl = loadedUrlRef.current;
    loadedUrlRef.current = current.url;
    if (previousUrl !== current.url) revoke(previousUrl);
    if (socketRef.current !== current.socket || current.socket.readyState !== WebSocket.OPEN) return;
    frames.current += 1;
    lastLoadedAt.current = Date.now();
    setStatus(previous => previous.phase === 'live' ? previous : { phase: 'live', transport: 'screenshot', message: '每秒 1 帧合成快照', frames: frames.current, fps: 0, updatedAt: lastLoadedAt.current });
    current.socket.send('next');
  }

  function rejectFrame(current: Frame) {
    if (frameRef.current !== current || socketRef.current !== current.socket) return;
    revoke(current.url);
    frameRef.current = null;
    setFrame(null);
    setStatus(previous => ({ ...previous, phase: 'error', message: '合成画面解码失败，正在重新连接', fps: 0 }));
    current.socket.close();
  }

  const live = status.phase === 'live';
  const Icon = status.phase === 'paused' ? Pause : status.phase === 'error' ? WifiOff : status.phase === 'loading' ? RefreshCw : Monitor;
  return <div className={`obs-live-preview ${className} phase-${status.phase}`} aria-label={`${kind === 'preview' ? '预监' : '节目'}每秒 1 帧合成快照`} data-transport="screenshot" data-kind={kind} data-cadence-ms={OBS_SNAPSHOT_INTERVAL_MS}>
    {frame && <img src={frame.url} alt={`OBS ${kind === 'preview' ? '预监' : '节目'}的游戏画面与赛事 HUD 合成快照`} onLoad={() => acceptFrame(frame)} onError={() => rejectFrame(frame)} />}
    {!live && <div className="obs-live-preview-state" role="status"><Icon size={30} className={status.phase === 'loading' ? 'spinning' : ''} /><strong>{status.message}</strong><span>{status.phase === 'paused' && frame ? '保留暂停前的画面' : connected ? 'OBS 游戏捕获与赛事 HUD 合成' : '在「连接与输出」中启动直播引擎'}</span></div>}
    <span className={`obs-live-preview-badge ${live ? 'live' : ''}`} title="每秒采样 1 帧；实际推流与录制帧率由 OBS 输出配置决定"><i />{live ? '每秒 1 帧 · 合成快照' : status.phase === 'paused' ? '预览已暂停' : '等待合成快照'}</span>
  </div>;
}

type DesktopPreviewBridge = {
  release: (kind: Props['kind']) => Promise<void>;
  embed?: (kind: Props['kind'], bounds: NativeBounds) => Promise<{ fps: number; transport: 'native' }>;
  position?: (kind: Props['kind'], bounds: NativeBounds) => Promise<void>;
};
type NativeBounds = { x: number; y: number; width: number; height: number; viewportWidth: number; viewportHeight: number; devicePixelRatio: number };
declare global { interface Window { riftcastPreview?: DesktopPreviewBridge } }

// Keep native window acquisition and disposal ordered across both monitors.
let acquisition: Promise<unknown> = Promise.resolve();
function serializeCapture<T>(work: () => Promise<T>): Promise<T> {
  const next = acquisition.catch(() => {}).then(work);
  acquisition = next;
  return next;
}

let nativePerformance: { at: number; pending: Promise<number> } | undefined;
function nativeFps(): Promise<number> {
  if (!nativePerformance || Date.now() - nativePerformance.at >= 900) {
    nativePerformance = { at: Date.now(), pending: fetch('/api/obs/engine', { cache: 'no-store' }).then(response => response.json()).then(engine => {
      if (!engine.connected || !Number.isFinite(engine.performance?.activeFps)) throw new Error('OBS 状态未就绪');
      return engine.performance.activeFps as number;
    }) };
  }
  return nativePerformance.pending;
}

function NativePreview({ kind, connected, enabled = true, className = '', onStatus }: Props) {
  const [status, setStatus] = useState<ObsPreviewStatus>({ ...initialStatus, transport: 'native' });
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const surface = useRef<HTMLDivElement>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  useEffect(() => { onStatusRef.current?.(status); }, [status]);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (!connected) { setStatus({ ...initialStatus, transport: 'native' }); return; }
    if (!enabled || !visible) { setStatus(previous => ({ ...previous, phase: 'paused', fps: 0, message: '实时预览已暂停' })); return; }
    const bridge = window.riftcastPreview!;
    const element = surface.current!;
    let stopped = false;
    let embedded = false;
    let request = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const bounds = (): NativeBounds | undefined => {
      const rect = element.getBoundingClientRect();
      const available = { x: Math.max(0, rect.x), y: Math.max(0, rect.y), right: Math.min(innerWidth, rect.right), bottom: Math.min(innerHeight, rect.bottom) };
      const width = Math.min(available.right - available.x, (available.bottom - available.y) * 16 / 9);
      const height = width * 9 / 16;
      if (width < 64 || height < 36) return;
      return { x: available.x + (available.right - available.x - width) / 2, y: available.y + (available.bottom - available.y - height) / 2, width, height, viewportWidth: innerWidth, viewportHeight: innerHeight, devicePixelRatio };
    };
    const connect = () => {
      void serializeCapture(async () => {
        if (stopped) return;
        const rect = bounds();
        if (!rect) { retry = setTimeout(connect, 250); return; }
        setStatus(previous => ({ ...previous, phase: 'loading', message: '正在连接 OBS 原生画面', fps: 0 }));
        try {
          await bridge.embed!(kind, rect);
          if (stopped) { await bridge.release(kind); return; }
          embedded = true;
          attempts = 0;
          const fps = await nativeFps().catch(() => 0);
          if (!stopped) setStatus({ phase: 'live', transport: 'native', message: 'OBS 原生合成画面', frames: 0, fps, updatedAt: Date.now() });
        } catch {
          if (stopped) return;
          setStatus(previous => ({ ...previous, phase: 'error', fps: 0, message: 'OBS 原生画面暂不可用，正在重新连接' }));
          retry = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 10000));
        }
      });
    };
    const reposition = () => {
      cancelAnimationFrame(request);
      request = requestAnimationFrame(() => {
        const rect = bounds();
        if (!embedded || stopped) return;
        if (!rect) {
          embedded = false;
          void serializeCapture(() => bridge.release(kind)).then(() => { if (!stopped) connect(); });
          return;
        }
        void bridge.position!(kind, rect).catch(() => {
          if (stopped || !embedded) return;
          embedded = false;
          connect();
        });
      });
    };
    const observer = new ResizeObserver(reposition);
    observer.observe(element);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    connect();
    const timer = window.setInterval(() => {
      if (!embedded || stopped) return;
      void nativeFps().then(fps => { if (!stopped) setStatus(previous => ({ ...previous, fps, updatedAt: Date.now() })); }).catch(() => {
        if (stopped) return;
        embedded = false;
        setStatus(previous => ({ ...previous, phase: 'error', fps: 0, message: '正在恢复 OBS 原生画面连接' }));
        connect();
      });
    }, 1000);
    return () => {
      stopped = true;
      clearTimeout(retry); clearInterval(timer); cancelAnimationFrame(request);
      observer.disconnect();
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      void serializeCapture(() => bridge.release(kind).catch(() => {}));
    };
  }, [kind, connected, enabled, visible]);
  const live = status.phase === 'live';
  const Icon = status.phase === 'paused' ? Pause : status.phase === 'error' ? WifiOff : status.phase === 'loading' ? RefreshCw : Monitor;
  return <div className={`obs-live-preview native-preview ${className} phase-${status.phase}`} aria-label={`${kind === 'preview' ? '预监' : '节目'}实时合成画面`} data-transport="native" data-kind={kind}>
    <div className="obs-native-surface" ref={surface} />
    {!live && <div className="obs-live-preview-state" role="status"><Icon size={30} className={status.phase === 'loading' ? 'spinning' : ''} /><strong>{status.message}</strong><span>{connected ? 'OBS 游戏捕获与赛事 HUD 合成' : '在「连接与输出」中启动直播引擎'}</span></div>}
    <span className={`obs-live-preview-badge ${live ? 'live' : ''}`} title="帧率来自 OBS 合成引擎统计；画面由 OBS 原生显示直接呈现"><i />{live ? `OBS 合成${status.fps > 0 ? ` · ${status.fps.toFixed(1)} fps` : ''} · 原生显示` : status.phase === 'paused' ? '预览已暂停' : '等待实时画面'}</span>
  </div>;
}

export function ObsLivePreview(props: Props) {
  const [embedded, setEmbedded] = useState(false);
  const nativeRequested = props.kind === 'program' && props.purpose === 'program' && !!window.riftcastPreview?.embed;
  useEffect(() => {
    if (!nativeRequested || !props.connected) { setEmbedded(false); return; }
    let cancelled = false;
    fetch('/api/obs/engine', { cache: 'no-store' }).then(response => response.json()).then(engine => {
      if (!cancelled) setEmbedded(engine.mode !== 'external');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [props.connected, nativeRequested]);
  return usesNativeObsPreview(props.kind, props.purpose, !!window.riftcastPreview?.embed, embedded) ? <NativePreview {...props} /> : <ScreenshotPreview {...props} />;
}
