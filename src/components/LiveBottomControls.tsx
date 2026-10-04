import { useEffect, useRef, useState } from 'react';
import { Camera, Image, RefreshCw, Save, Upload } from 'lucide-react';
import type { Asset, OverlaySettings, PlayerFeedSettings, Side, StateContext } from '../../shared/types';
import { api } from '../lib';
import './live-bottom-controls.css';

type BottomDraft = {
  patchVersion: string;
  bottomTitle: string;
  playerFeeds: Record<Side, PlayerFeedSettings>;
};
type CameraDevice = { name: string; id: string };
const sides: Side[] = ['blue', 'red'];
const sideName = { blue: '蓝色方', red: '红色方' };
const feedDefault: PlayerFeedSettings = { mode: 'image', imageUrl: '', cameraDeviceId: '', label: '' };
const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作失败，请检查本地服务连接';

function bottomDraft(overlay: OverlaySettings): BottomDraft {
  return {
    patchVersion: overlay.patchVersion ?? '26.18',
    bottomTitle: overlay.bottomTitle ?? '2026 DEMACIA CUP GLOBAL INVITATIONAL',
    playerFeeds: {
      blue: { ...feedDefault, ...overlay.playerFeeds?.blue },
      red: { ...feedDefault, ...overlay.playerFeeds?.red },
    },
  };
}

/** Preserve typed fields while applying changes received from another control page. */
function mergeUntouched(draft: BottomDraft, previous: BottomDraft, incoming: BottomDraft): BottomDraft {
  const next: BottomDraft = {
    patchVersion: draft.patchVersion === previous.patchVersion ? incoming.patchVersion : draft.patchVersion,
    bottomTitle: draft.bottomTitle === previous.bottomTitle ? incoming.bottomTitle : draft.bottomTitle,
    playerFeeds: { blue: { ...draft.playerFeeds.blue }, red: { ...draft.playerFeeds.red } },
  };
  for (const side of sides) {
    for (const key of ['mode', 'imageUrl', 'cameraDeviceId', 'label'] as const) {
      if (draft.playerFeeds[side][key] === previous.playerFeeds[side][key]) {
        // Each key is copied from a feed of the same shape.
        Object.assign(next.playerFeeds[side], { [key]: incoming.playerFeeds[side][key] });
      }
    }
  }
  return next;
}

export function LiveBottomControls({ state, send, notify }: StateContext) {
  const incoming = bottomDraft(state.overlay);
  const incomingKey = JSON.stringify(incoming);
  const [draft, setDraft] = useState<BottomDraft>(() => incoming);
  const previousRemote = useRef(incoming);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [cameraDetail, setCameraDetail] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [cameraLoading, setCameraLoading] = useState(false);
  const [uploadedAssets, setUploadedAssets] = useState<Asset[]>([]);
  const [pending, setPending] = useState<Side | 'save' | 'camera-apply' | null>(null);
  const [error, setError] = useState('');
  const [cameraApplyDetail, setCameraApplyDetail] = useState('');
  const [cameraApplyFailed, setCameraApplyFailed] = useState(false);
  const [failedImages, setFailedImages] = useState<Partial<Record<Side, string>>>({});
  const busy = pending !== null;
  const dirty = JSON.stringify(draft) !== incomingKey;
  const assets = [...uploadedAssets, ...state.assets].filter((asset, index, all) => imageTypes.includes(asset.type) && all.findIndex(item => item.id === asset.id) === index);

  useEffect(() => {
    const previous = previousRemote.current;
    previousRemote.current = incoming;
    setDraft(current => mergeUntouched(current, previous, incoming));
  }, [incomingKey]);

  useEffect(() => {
    let active = true;
    setCameraLoading(true);
    void api<{ devices: CameraDevice[]; detail?: string }>('/api/obs/cameras').then(result => {
      if (!active) return;
      setDevices(result.devices || []);
      setCameraDetail(result.detail || (result.devices?.length ? '摄像头列表已更新' : '当前未发现摄像头，请检查设备连接后刷新。'));
      setCameraError('');
    }).catch(cause => {
      if (!active) return;
      setCameraError(messageOf(cause));
      setDevices([]);
    }).finally(() => { if (active) setCameraLoading(false); });
    return () => { active = false; };
  }, [state.connections.obs.status]);

  function updateFeed(side: Side, patch: Partial<PlayerFeedSettings>) {
    setError('');
    if ('imageUrl' in patch) setFailedImages(current => ({ ...current, [side]: undefined }));
    setDraft(current => ({ ...current, playerFeeds: { ...current.playerFeeds, [side]: { ...current.playerFeeds[side], ...patch } } }));
  }

  async function refreshCameras() {
    setCameraLoading(true);
    setCameraError('');
    try {
      const result = await api<{ devices: CameraDevice[]; detail?: string }>('/api/obs/cameras');
      setDevices(result.devices || []);
      const detail = result.detail || (result.devices?.length ? '摄像头列表已更新' : '当前未发现摄像头，请检查设备连接后刷新。');
      setCameraDetail(detail);
      notify(detail);
    } catch (cause) {
      const detail = messageOf(cause);
      setCameraError(detail);
      notify(detail);
    } finally { setCameraLoading(false); }
  }

  async function uploadImage(side: Side, file?: File) {
    if (!file) return;
    setError('');
    if (!imageTypes.includes(file.type)) { setError('支持 PNG、JPG、WebP 和 GIF 图片。'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('图片大小需在 8 MB 以内。'); return; }
    setPending(side);
    try {
      const body = new FormData();
      body.append('file', file);
      const asset = await api<Asset>('/api/assets', { method: 'POST', body });
      setUploadedAssets(current => [asset, ...current]);
      updateFeed(side, { mode: 'image', imageUrl: asset.url });
      notify(`${sideName[side]}图片已上传并选中，保存底部配置后播出`);
    } catch (cause) {
      const detail = messageOf(cause);
      setError(detail);
      notify(detail);
    } finally { setPending(null); }
  }

  async function save() {
    setError('');
    setCameraApplyDetail('');
    setCameraApplyFailed(false);
    for (const side of sides) {
      if (draft.playerFeeds[side].mode === 'camera' && !draft.playerFeeds[side].cameraDeviceId) {
        setError(`请为${sideName[side]}选择摄像头，或先切换为图片展示。`);
        return;
      }
    }
    setPending('save');
    const saved: BottomDraft = { patchVersion: draft.patchVersion.trim(), bottomTitle: draft.bottomTitle.trim(), playerFeeds: { blue: { ...draft.playerFeeds.blue, label: draft.playerFeeds.blue.label.trim() }, red: { ...draft.playerFeeds.red, label: draft.playerFeeds.red.label.trim() } } };
    try {
      await send({ type: 'set-overlay', patch: saved });
      setDraft(saved);
      if (sides.some(side => saved.playerFeeds[side].mode === 'camera')) {
        await applySavedCameras();
      } else {
        notify('局内底部配置已保存');
      }
    } catch (cause) {
      const detail = messageOf(cause);
      setError(detail);
      notify(detail);
    } finally { setPending(null); }
  }

  async function applySavedCameras() {
    try {
      const result = await api<{ applied: boolean; detail?: string }>('/api/obs/player-feeds', { method: 'POST', body: JSON.stringify({}) });
      const detail = result.detail || (result.applied ? '选手摄像头已应用到 OBS，请在视频预览中确认画面。' : 'OBS 当前未就绪；底部配置已保存，连接 OBS 后可重新应用。');
      setCameraApplyDetail(detail);
      setCameraApplyFailed(!result.applied);
      notify(`底部配置已保存。${detail}`);
    } catch (cause) {
      const detail = `底部配置已保存，摄像头应用失败：${messageOf(cause)}`;
      setCameraApplyDetail(detail);
      setCameraApplyFailed(true);
      notify(detail);
    }
  }

  async function retryCameras() {
    setPending('camera-apply');
    try { await applySavedCameras(); } finally { setPending(null); }
  }

  return <section className="panel live-bottom-controls">
    <div className="panel-head"><div><h2>局内底部包装</h2><p className="muted">五行计分板使用全不透明黑色背景；选手属性区域与小地图保留游戏原生画面。</p></div><span className={`badge ${dirty ? 'live-bottom-unsaved' : ''}`}>{dirty ? '待保存' : '已同步'}</span></div>
    <div className="live-bottom-controls-body">
      <div className="live-bottom-text-fields">
        <p className="muted">五路对位使用五行完整画幅，中央显示经济差；两侧展示选手状态、技能、符文与装备。</p>
        <label className="field">左下角游戏版本<input maxLength={20} value={draft.patchVersion} disabled={busy} onChange={event => setDraft(current => ({ ...current, patchVersion: event.target.value }))} placeholder="26.18" /><small className="muted">留空可隐藏版本文字。</small></label>
      </div>
      <div className="live-bottom-camera-heading"><div><strong>两侧选手画面</strong><p className="muted">上传图片或选择摄像头；画面按参考图比例裁切，选手名显示在底部。</p></div><button type="button" className="button small" disabled={cameraLoading} onClick={() => void refreshCameras()}><RefreshCw size={14} className={cameraLoading ? 'spinning' : ''} />{cameraLoading ? '正在读取…' : '刷新摄像头'}</button></div>
      {(cameraError || cameraDetail) && <p className={`live-bottom-camera-detail ${cameraError ? 'request-error' : 'muted'}`} role={cameraError ? 'status' : undefined}>{cameraError || cameraDetail}</p>}
      <div className="live-bottom-feed-grid">{sides.map(side => {
        const feed = draft.playerFeeds[side];
        const missingCamera = !!feed.cameraDeviceId && !devices.some(device => device.id === feed.cameraDeviceId);
        const missingAsset = !!feed.imageUrl && !assets.some(asset => asset.url === feed.imageUrl);
        const imageFailed = failedImages[side] === feed.imageUrl;
        return <div className={`live-bottom-feed-card ${side}`} key={side}>
          <div className="live-bottom-feed-title"><i /><h3>{sideName[side]}选手画面</h3></div>
          <div className="live-bottom-feed-preview" aria-label={`${sideName[side]}选手画面预览`}>
            {feed.mode === 'image' && feed.imageUrl && !imageFailed ? <img src={feed.imageUrl} alt={`${sideName[side]}选手图片`} onError={() => setFailedImages(current => ({ ...current, [side]: feed.imageUrl }))} /> : <div className="live-bottom-feed-placeholder">{feed.mode === 'camera' ? <Camera size={26} /> : <Image size={26} />}<span>{feed.mode === 'camera' ? '摄像头画面在 OBS 视频预览中显示' : feed.mode === 'off' ? '选手画面已隐藏' : imageFailed ? '图片加载失败，请重新上传或选择素材' : '选择或上传选手图片'}</span></div>}
            {feed.mode !== 'off' && feed.label && <div className="live-bottom-feed-nameplate">{feed.label}</div>}
          </div>
          <label className="field">展示来源<select aria-label={`${sideName[side]}展示来源`} value={feed.mode} disabled={busy} onChange={event => updateFeed(side, { mode: event.target.value as PlayerFeedSettings['mode'] })}><option value="image">自定义图片</option><option value="camera">摄像头源</option><option value="off">隐藏选手画面</option></select></label>
          {feed.mode === 'image' && <><label className="field">图片素材<select aria-label={`${sideName[side]}图片素材`} value={feed.imageUrl} disabled={busy} onChange={event => updateFeed(side, { imageUrl: event.target.value })}><option value="">未选择图片</option>{missingAsset && <option value={feed.imageUrl}>当前已保存图片</option>}{assets.map(asset => <option key={asset.id} value={asset.url}>{asset.name}</option>)}</select></label><label className={`button small live-bottom-upload ${busy ? 'disabled' : ''}`}><Upload size={14} />{pending === side ? '正在上传…' : '上传选手图片'}<input type="file" aria-label={`${sideName[side]}上传选手图片`} accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void uploadImage(side, file); }} /></label><small className="muted live-bottom-upload-note">PNG / JPG / WebP / GIF，最大 8 MB</small></>}
          {feed.mode === 'camera' && <label className="field">摄像头设备<select aria-label={`${sideName[side]}摄像头设备`} value={feed.cameraDeviceId} disabled={busy || cameraLoading} onChange={event => updateFeed(side, { cameraDeviceId: event.target.value })}><option value="">{devices.length ? '请选择摄像头' : '等待摄像头列表'}</option>{missingCamera && <option value={feed.cameraDeviceId}>已保存设备 · 当前未发现</option>}{devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select><small className="muted">保存后由 OBS 采集；请在 OBS 视频预览中确认画面。</small></label>}
          <label className="field">选手名称<input maxLength={80} aria-label={`${sideName[side]}选手名称`} value={feed.label} disabled={busy} onChange={event => updateFeed(side, { label: event.target.value })} placeholder={side === 'blue' ? '例如 Raptor' : '例如 Heng'} /><small className="muted">留空时使用该方打野选手的名称。</small></label>
        </div>;
      })}</div>
      <p className="live-bottom-economy-note muted">每行经济领先继续使用双方同位置选手的累计经济 OCR 读数计算。请在上方经济来源中启用个人经济识别并校准游戏原生金币列。</p>
      {cameraApplyDetail && <div className="live-bottom-camera-apply"><p className={cameraApplyFailed ? 'request-error' : 'muted'} role="status">{cameraApplyDetail}</p>{cameraApplyFailed && sides.some(side => incoming.playerFeeds[side].mode === 'camera') && <button type="button" className="button small" disabled={busy || dirty} onClick={() => void retryCameras()}><RefreshCw size={14} className={pending === 'camera-apply' ? 'spinning' : ''} />{pending === 'camera-apply' ? '正在应用…' : '重新应用已保存摄像头'}</button>}</div>}
      {error && <p className="request-error live-bottom-error" role="alert">{error}</p>}
      <div className="live-bottom-save-row"><span className="muted">{dirty ? '保存后应用到局内计分板' : '当前配置已应用'}</span><button type="button" className="button primary small" disabled={busy || !dirty} onClick={() => void save()}><Save size={14} />{pending === 'save' ? '正在保存…' : '保存底部配置'}</button></div>
    </div>
  </section>;
}
