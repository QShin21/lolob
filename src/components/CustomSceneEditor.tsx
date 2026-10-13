import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Layers, Monitor, Plus, RefreshCw, X } from 'lucide-react';
import type { Asset, BroadcastState, CustomScene, CustomSceneSource, CustomSourceChoices, StateContext } from '../../shared/types';
import { api } from '../lib';
import './custom-scenes.css';

export function CustomSceneLayout({ scene, state, placeholders = true }: { scene: CustomScene; state: BroadcastState; placeholders?: boolean }) {
  return <div className="custom-scene-layout" style={{ background: scene.background }}>
    {scene.sources.filter(s => s.visible).map(s => <div key={s.id} className="custom-scene-layer" style={{ left: `${s.x / 19.2}%`, top: `${s.y / 10.8}%`, width: `${s.width / 19.2}%`, height: `${s.height / 10.8}%` }}>
      {s.kind === 'image' ? <img alt={s.name} src={state.assets.find(a => a.id === s.assetId)?.url} style={{ objectFit: s.fit === 'stretch' ? 'fill' : s.fit }} /> : placeholders ? <div className="custom-source-placeholder"><Monitor /><span>{s.name}</span><small>实时画面请在 OBS 预监核对</small></div> : null}
    </div>)}
  </div>;
}

export function CustomSceneEditor({ state, send, notify, initial, onClose }: Pick<StateContext, 'state' | 'send' | 'notify'> & { initial?: CustomScene; onClose: () => void }) {
  const [draft, setDraft] = useState<CustomScene>(() => initial ? structuredClone(initial) : { id: `custom:${crypto.randomUUID()}`, name: '', background: '#101820', sources: [] });
  const [assets, setAssets] = useState<Asset[]>(state.assets);
  const [selected, setSelected] = useState<string | null>(initial?.sources[0]?.id ?? null);
  const [choices, setChoices] = useState<CustomSourceChoices>({ windows: [], inputs: [] });
  const [assetId, setAssetId] = useState(''), [windowId, setWindowId] = useState(''), [inputName, setInputName] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [sourceError, setSourceError] = useState('');
  const [discard, setDiscard] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), upload = useRef<HTMLInputElement>(null);
  const baseline = useRef(JSON.stringify(draft));
  const version = useRef(state.production?.configVersion);
  const operation = useRef(false);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  useEffect(() => { setAssets(current => [...state.assets, ...current.filter(a => !state.assets.some(b => a.id === b.id))]); }, [state.assets]);
  const source = draft.sources.find(s => s.id === selected);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const close = () => { if (busy) return; if (JSON.stringify(draft) !== baseline.current) setDiscard(true); else onClose(); };
  const patch = (change: Partial<CustomSceneSource>) => setDraft(d => ({ ...d, sources: d.sources.map(s => s.id === selected ? { ...s, ...change } : s) }));
  function add(kind: CustomSceneSource['kind'], name: string, data: Partial<CustomSceneSource>) {
    if (draft.sources.length >= 24) { setError('每个场景最多添加 24 个素材'); return; }
    const id = crypto.randomUUID();
    setDraft(d => ({ ...d, sources: [...d.sources, { id, kind, name: name.slice(0, 100), x: 0, y: 0, width: 1920, height: 1080, fit: 'contain', visible: true, ...data }] })); setSelected(id); setError('');
  }
  async function refresh() {
    setLoading(true); setSourceError('');
    try { setChoices(await api<CustomSourceChoices>('/api/obs/custom-sources')); }
    catch (e) { setSourceError(e instanceof Error ? e.message : '读取来源失败'); }
    finally { setLoading(false); }
  }
  async function uploadImage(file?: File) {
    if (!file || operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('图片不能超过 8 MB');
      const form = new FormData(); form.append('file', file); form.append('category', 'other');
      const asset = await api<Asset>('/api/assets', { method: 'POST', body: form });
      setAssets(list => [asset, ...list.filter(a => a.id !== asset.id)]); add('image', asset.name, { assetId: asset.id });
    } catch (e) { setError(e instanceof Error ? e.message : '上传失败'); }
    finally { operation.current = false; setBusy(false); if (upload.current) upload.current.value = ''; }
  }
  async function save() {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try { await send({ type: 'save-custom-scene', scene: draft, expectedConfigVersion: version.current }); notify('自定义场景已保存，可在场景库选择预监'); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); }
    finally { operation.current = false; setBusy(false); }
  }
  function move(delta: number) {
    setDraft(d => { const sources = [...d.sources], index = sources.findIndex(s => s.id === selected), next = index + delta; if (index < 0 || next < 0 || next >= sources.length) return d; [sources[index], sources[next]] = [sources[next], sources[index]]; return { ...d, sources }; });
  }
  return <dialog ref={dialog} className="custom-scene-dialog" aria-labelledby="custom-scene-title" onCancel={e => { e.preventDefault(); close(); }}>
    <header><div><small>场景库 / 自定义</small><h2 id="custom-scene-title">{initial ? '编辑自定义场景' : '新建自定义场景'}</h2></div><button className="icon-button" aria-label="关闭场景编辑器" onClick={close} disabled={busy}><X size={20} /></button></header>
    <fieldset disabled={busy} className="custom-editor-body">
      <div className="custom-editor-meta"><label>场景名称<input autoFocus value={draft.name} maxLength={60} placeholder="例如：嘉宾连线、赞助商画面" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>背景颜色<input type="color" value={draft.background} onChange={e => setDraft({ ...draft, background: e.target.value })} /></label></div>
      <div className="custom-editor-columns"><section className="custom-editor-composition"><CustomSceneLayout scene={draft} state={{ ...state, assets }} /><p className="muted">1920 × 1080 · 排版预览。保存后选择预监，可查看实际合成画面。</p>
        <div className="custom-add-sources"><h3><Plus size={16} />添加素材</h3><div className="custom-add-row"><button className="button" onClick={() => upload.current?.click()}><ImagePlus size={16} />上传图片</button><input ref={upload} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="上传场景图片" onChange={e => void uploadImage(e.target.files?.[0])} /><select aria-label="已有图片素材" value={assetId} onChange={e => setAssetId(e.target.value)}><option value="">从素材库选择图片</option>{assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><button className="button small" disabled={!assetId} onClick={() => { const a = assets.find(a => a.id === assetId); if (a) add('image', a.name, { assetId: a.id }); }}>添加</button></div><small className="muted">PNG / JPEG / WebP / GIF，单张不超过 8 MB</small>
          <div className="custom-add-heading"><strong>应用窗口与 OBS 来源</strong><button className="button small" disabled={!local || state.connections.obs.status !== 'connected' || loading} onClick={() => void refresh()}><RefreshCw size={13} />{loading ? '读取中…' : '刷新来源'}</button></div>
          {!local || state.connections.obs.status !== 'connected' ? <p className="muted">请在导播主机连接 OBS 引擎后读取应用窗口。图片场景可先保存。</p> : <p className="muted">打开目标应用并保持窗口可见，然后刷新来源。窗口捕获不附带应用音频；节目沿用桌面音频与解说麦克风。</p>}
          {sourceError && <p role="alert" className="custom-editor-error">{sourceError}</p>}
          <div className="custom-add-row"><Monitor size={16} /><select aria-label="应用窗口" value={windowId} onChange={e => setWindowId(e.target.value)}><option value="">选择进程 / 应用窗口</option>{choices.windows.map(w => <option key={w.value} value={w.value}>{w.name}</option>)}</select><button className="button small" disabled={!choices.windows.some(w => w.value === windowId)} onClick={() => add('window', choices.windows.find(w => w.value === windowId)!.name, { window: windowId })}>添加窗口</button></div>
          <div className="custom-add-row"><Layers size={16} /><select aria-label="已有 OBS 来源" value={inputName} onChange={e => setInputName(e.target.value)}><option value="">已有 OBS 来源（摄像头、媒体等）</option>{choices.inputs.map(i => <option key={i.name} value={i.name}>{i.name} · {i.kind}</option>)}</select><button className="button small" disabled={!choices.inputs.some(i => i.name === inputName)} onClick={() => add('obs', inputName, { inputName })}>添加来源</button></div>
        </div>
      </section><section className="custom-editor-layers"><h3>图层 <small>{draft.sources.length} / 24 · 上方覆盖下方</small></h3><div className="custom-layer-list">{[...draft.sources].reverse().map(s => <button key={s.id} className={s.id === selected ? 'selected' : ''} aria-pressed={s.id === selected} onClick={() => setSelected(s.id)}><span>{s.kind === 'image' ? '图片' : s.kind === 'window' ? '窗口' : 'OBS'}</span><strong>{s.name}</strong><small>{s.visible ? '显示' : '隐藏'}</small></button>)}{!draft.sources.length && <p className="custom-layer-empty">添加第一张图片或应用窗口，开始制作场景。</p>}</div>
        {source && <div className="custom-layer-properties"><label>素材名称<input value={source.name} maxLength={100} onChange={e => patch({ name: e.target.value })} /></label><div className="custom-transform-fields">{([['x', '横向位置', -1920, 1920], ['y', '纵向位置', -1080, 1080], ['width', '宽度', 1, 3840], ['height', '高度', 1, 2160]] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" value={source[key]} min={min} max={max} onChange={e => patch({ [key]: Number(e.target.value) })} /></label>)}</div><label>适配方式<select value={source.fit} onChange={e => patch({ fit: e.target.value as CustomSceneSource['fit'] })}><option value="contain">完整显示（保持比例）</option><option value="cover">填满裁切（保持比例）</option><option value="stretch">拉伸填满</option></select></label><label className="custom-visible"><input type="checkbox" checked={source.visible} onChange={e => patch({ visible: e.target.checked })} />显示此素材</label><div className="custom-layer-actions"><button className="button small" onClick={() => patch({ x: 0, y: 0, width: 1920, height: 1080 })}>铺满画布</button><button className="button small" disabled={draft.sources.at(-1)?.id === selected} onClick={() => move(1)}>上移</button><button className="button small" disabled={draft.sources[0]?.id === selected} onClick={() => move(-1)}>下移</button><button className="button small" onClick={() => { setDraft(d => ({ ...d, sources: d.sources.filter(s => s.id !== selected) })); setSelected(null); }}>移除素材</button></div></div>}
      </section></div>
    </fieldset>
    {error && <p role="alert" className="custom-editor-error">{error}</p>}
    <footer>{discard ? <><span>放弃尚未保存的场景修改？已上传图片会保留在素材库。</span><button className="button" onClick={() => setDiscard(false)}>继续编辑</button><button className="button" onClick={onClose}>放弃修改</button></> : <><span>保存为待播配置，按 TAKE 后进入节目。</span><button className="button" disabled={busy} onClick={close}>取消</button><button className="button primary" disabled={busy || !draft.name.trim()} onClick={() => void save()}>{busy ? '正在处理…' : '保存场景'}</button></>}</footer>
  </dialog>;
}
