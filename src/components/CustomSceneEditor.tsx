import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ImagePlus, Layers, Monitor, Plus, RefreshCw, X, Eye, EyeOff, Move, Maximize2 } from 'lucide-react';
import type { Asset, BroadcastState, CustomScene, CustomSceneSource, CustomSourceChoices, StateContext } from '../../shared/types';
import { api } from '../lib';
import { layerStyle, transformSceneSource, type ResizeHandle } from './custom-scene-geometry';
import './custom-scenes.css';
export function CustomSceneLayout({ scene, state, placeholders = true }: { scene: CustomScene; state: BroadcastState; placeholders?: boolean }) {
  return <div className="custom-scene-layout" style={{ background: scene.background }}>
    {scene.sources.filter(s => s.visible).map(s => <div key={s.id} className="custom-scene-layer" style={{ left: `${s.x / 19.2}%`, top: `${s.y / 10.8}%`, width: `${s.width / 19.2}%`, height: `${s.height / 10.8}%` }}>
      {s.kind === 'image' ? <img alt={s.name} src={state.assets.find(a => a.id === s.assetId)?.url} style={{ objectFit: s.fit === 'stretch' ? 'fill' : s.fit }} /> : placeholders ? <div className="custom-source-placeholder"><Monitor /><span>{s.name}</span><small>实时画面请在 OBS 预监核对</small></div> : null}
    </div>)}
  </div>;
}

const handles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const kindLabel = { image: '图片', window: '应用窗口', obs: '共享 OBS 来源' };
export function CustomSceneEditor({ state, send, notify, seat, connected, initial, onClose }: Pick<StateContext, 'state' | 'send' | 'notify' | 'seat' | 'connected'> & { initial?: CustomScene; onClose: () => void }) {
  const [draft, setDraft] = useState<CustomScene>(() => initial ? structuredClone(initial) : { id: `custom:${crypto.randomUUID()}`, name: '', background: '#101820', sources: [] });
  const [assets, setAssets] = useState<Asset[]>(state.assets);
  const [selected, setSelected] = useState<string | null>(initial?.sources.at(-1)?.id ?? null);
  const [choices, setChoices] = useState<CustomSourceChoices>({ windows: [], inputs: [] });
  const [assetId, setAssetId] = useState(''), [windowId, setWindowId] = useState(''), [inputName, setInputName] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [sourceError, setSourceError] = useState('');
  const [discard, setDiscard] = useState(false), [canvasWidth, setCanvasWidth] = useState(640), [baseVersion, setBaseVersion] = useState(state.production?.configVersion);
  const dialog = useRef<HTMLDialogElement>(null), upload = useRef<HTMLInputElement>(null), viewport = useRef<HTMLDivElement>(null), canvas = useRef<HTMLDivElement>(null);
  const baseline = useRef(JSON.stringify(draft)), operation = useRef(false);
  const gesture = useRef<{ id: number; source: CustomSceneSource; handle: ResizeHandle; startX: number; startY: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const node = dialog.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    return () => { node?.close(); previous?.focus(); };
  }, []);
  useEffect(() => {
    const node = viewport.current; if (!node) return;
    const observer = new ResizeObserver(() => setCanvasWidth(Math.max(80, Math.min(node.clientWidth - 48, (node.clientHeight - 64) * 16 / 9))));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  useEffect(() => { setAssets(current => [...state.assets, ...current.filter(a => !state.assets.some(b => a.id === b.id))]); }, [state.assets]);
  const source = draft.sources.find(s => s.id === selected), dirty = JSON.stringify(draft) !== baseline.current;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const canEdit = connected !== false && (!seat || seat.role === 'director' && (!state.production?.control || state.production.control.owner === seat.id));
  const conflict = baseVersion !== state.production?.configVersion;
  const close = () => { if (busy) return; if (dirty) setDiscard(true); else onClose(); };
  const patchSource = (id: string, change: Partial<CustomSceneSource>) => setDraft(d => ({ ...d, sources: d.sources.map(s => s.id === id ? { ...s, ...change } : s) }));
  const patch = (change: Partial<CustomSceneSource>) => { if (selected) patchSource(selected, change); };
  function add(kind: CustomSceneSource['kind'], name: string, data: Partial<CustomSceneSource>) {
    if (draft.sources.length >= 24) { setError('每个场景最多添加 24 个来源'); return; }
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
    if (operation.current || !canEdit) return;
    operation.current = true; setBusy(true); setError('');
    try { await send({ type: 'save-custom-scene', scene: draft, expectedConfigVersion: baseVersion }); notify('自定义场景已保存到待播；选择预监核对实际合成'); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败，本地草稿仍保留'); }
    finally { operation.current = false; setBusy(false); }
  }
  function move(delta: number) {
    setDraft(d => { const sources = [...d.sources], index = sources.findIndex(s => s.id === selected), next = index + delta; if (index < 0 || next < 0 || next >= sources.length) return d; [sources[index], sources[next]] = [sources[next], sources[index]]; return { ...d, sources }; });
  }
  function start(event: PointerEvent, item: CustomSceneSource, handle: ResizeHandle) {
    if (event.button !== 0 || busy || !canEdit || gesture.current) return;
    event.preventDefault(); event.stopPropagation(); setSelected(item.id); canvas.current?.focus();
    const rect = canvas.current!.getBoundingClientRect();
    gesture.current = { id: event.pointerId, source: { ...item }, handle, startX: event.clientX, startY: event.clientY, width: rect.width, height: rect.height };
    canvas.current!.setPointerCapture(event.pointerId);
  }
  function end(event: PointerEvent, cancel = false) {
    const current = gesture.current; if (!current || current.id !== event.pointerId) return;
    if (cancel) patchSource(current.source.id, current.source);
    gesture.current = null;
    if (canvas.current?.hasPointerCapture(event.pointerId)) canvas.current.releasePointerCapture(event.pointerId);
  }
  const latest = state.customScenes?.find(s => s.id === draft.id);
  return <dialog ref={dialog} className="custom-scene-dialog" aria-labelledby="custom-scene-title" onCancel={e => { e.preventDefault(); close(); }} onKeyDown={e => { if (e.key !== 'Escape') e.stopPropagation(); }}>
    <header className="custom-editor-heading"><Layers size={20}/><div><h2 id="custom-scene-title">{initial ? '编辑自定义场景' : '新建自定义场景'}</h2><span>{dirty ? '本地草稿 · 尚未保存' : '与打开时配置一致'}</span></div><div className="custom-editor-mode"><b>排版编辑</b><span>实际合成：保存后返回 PVW 核对</span></div><button className="button" aria-label="关闭场景编辑器" onClick={close} disabled={busy}><X size={18}/>关闭</button></header>
    <fieldset disabled={busy || !canEdit} className="custom-editor-body">
      <section className="custom-editor-layers" aria-label="场景图层">
        <div className="custom-pane-heading"><h3>图层</h3><small>{draft.sources.length} / 24 · 上层覆盖下层</small></div>
        <div className="custom-layer-list">{[...draft.sources].reverse().map(s => <button key={s.id} className={s.id === selected ? 'selected' : ''} aria-pressed={s.id === selected} onClick={() => setSelected(s.id)}>{s.kind === 'image' ? <img src={assets.find(a => a.id === s.assetId)?.url} alt=""/> : <Monitor size={18}/>}<span><strong title={s.name}>{s.name}</strong><small>{kindLabel[s.kind]}</small></span>{s.visible ? <Eye size={14}/> : <EyeOff size={14}/>}</button>)}{!draft.sources.length && <p className="custom-layer-empty">添加图片、应用窗口或已有 OBS 来源，开始构图。</p>}</div>
        <details className="custom-source-picker" open={!draft.sources.length}><summary><Plus size={15}/>添加来源</summary>
          <button className="button" disabled={draft.sources.length >= 24} onClick={() => upload.current?.click()}><ImagePlus size={16}/>上传图片</button><input ref={upload} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="上传场景图片" onChange={e => void uploadImage(e.target.files?.[0])}/>
          <label>素材库图片<select value={assetId} onChange={e => setAssetId(e.target.value)}><option value="">选择图片</option>{assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><button className="button small" disabled={!assetId || draft.sources.length >= 24} onClick={() => { const a = assets.find(a => a.id === assetId); if (a) add('image', a.name, { assetId: a.id }); }}>添加图片</button><small>PNG / JPEG / WebP / GIF · ≤ 8 MB</small>
          <button className="button small" disabled={!local || state.connections.obs.status !== 'connected' || loading} onClick={() => void refresh()}><RefreshCw size={13}/>{loading ? '读取中…' : '刷新主机来源'}</button>
          <label>应用窗口<select value={windowId} onChange={e => setWindowId(e.target.value)}><option value="">选择应用窗口</option>{choices.windows.map(w => <option key={w.value} value={w.value}>{w.name}</option>)}</select></label><button className="button small" disabled={draft.sources.length >= 24 || !choices.windows.some(w => w.value === windowId)} onClick={() => add('window', choices.windows.find(w => w.value === windowId)!.name, { window: windowId })}>添加窗口</button>
          <label>已有 OBS 来源<select value={inputName} onChange={e => setInputName(e.target.value)}><option value="">选择共享来源</option>{choices.inputs.map(i => <option key={i.name} value={i.name}>{i.name} · {i.kind}</option>)}</select></label><button className="button small" disabled={draft.sources.length >= 24 || !choices.inputs.some(i => i.name === inputName)} onClick={() => add('obs', inputName, { inputName })}>引用来源</button>
          <small>{!local ? '仅导播主机可枚举窗口与 OBS 来源。' : '连接 OBS 后刷新。应用需保持可见；可枚举不代表能稳定捕获。'}</small>
          {sourceError && <p role="alert" className="custom-editor-error">{sourceError}</p>}
        </details>
      </section>
      <section className="custom-editor-composition" aria-label="场景画布编辑">
        <div className="custom-canvas-toolbar"><span><Move size={14}/>选择 / 移动</span><span>1920 × 1080</span><b>{Math.round(canvasWidth / 19.2)}%</b></div>
        <div ref={viewport} className="custom-canvas-viewport">
          <div ref={canvas} className="custom-edit-canvas" role="group" aria-label="场景画布，方向键微调所选图层" tabIndex={0} style={{ width: canvasWidth }}
            onPointerDown={e => { if (e.target === e.currentTarget) setSelected(null); }}
            onPointerMove={e => { const g = gesture.current; if (g && g.id === e.pointerId) patchSource(g.source.id, transformSceneSource(g.source, g.handle, (e.clientX - g.startX) * 1920 / g.width, (e.clientY - g.startY) * 1080 / g.height)); }}
            onPointerUp={e => end(e)} onPointerCancel={e => end(e, true)} onLostPointerCapture={e => { if (gesture.current?.id === e.pointerId) end(e, true); }}
            onKeyDown={e => { if (!source || busy || !canEdit || e.isPropagationStopped() || e.nativeEvent.isComposing) return; const step = e.shiftKey ? 10 : 1; const offsets: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }; if (offsets[e.key]) { e.preventDefault(); e.stopPropagation(); patch(transformSceneSource(source, 'move', ...offsets[e.key])); } }}>
            <CustomSceneLayout scene={draft} state={{ ...state, assets }}/>
            <div className="custom-canvas-hits">{draft.sources.filter(s => s.visible).map(s => <div key={s.id} className="custom-canvas-hit" style={layerStyle(s)} onPointerDown={e => start(e, s, 'move')} title={s.name}/>)}</div>
            {source?.visible && <div className="custom-canvas-selection" style={layerStyle(source)} onPointerDown={e => start(e, source, 'move')}><span>{source.name} · {Math.round(source.width)} × {Math.round(source.height)}</span>{handles.map(handle => <button key={handle} className={`canvas-handle handle-${handle}`} tabIndex={-1} aria-label={`缩放图层 ${handle}`} onPointerDown={e => start(e, source, handle)}/>)}</div>}
          </div>
        </div>
        <p className="custom-canvas-help">拖动移动 · 边角缩放 · 方向键 1 px / Shift 10 px。窗口与 OBS 来源为排版占位。</p>
      </section>
      <section className="custom-editor-properties" aria-label="图层与场景属性">
        <div className="custom-pane-heading"><h3>属性</h3><span>{source ? kindLabel[source.kind] : '场景'}</span></div>
        <label>场景名称<input autoFocus value={draft.name} maxLength={60} placeholder="例如：嘉宾连线" onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label className="custom-background">背景<input type="color" value={draft.background} onChange={e => setDraft({ ...draft, background: e.target.value })}/><code>{draft.background}</code></label>
        {source ? <div className="custom-layer-properties"><h3>所选图层</h3><label>图层名称<input value={source.name} maxLength={100} onChange={e => patch({ name: e.target.value })}/></label><div className="custom-transform-fields">{([['x', 'X 位置', -1920, 1920], ['y', 'Y 位置', -1080, 1080], ['width', '宽度', 1, 3840], ['height', '高度', 1, 2160]] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" value={source[key]} min={min} max={max} onChange={e => patch({ [key]: Number(e.target.value) })}/></label>)}</div><label>适配方式<select value={source.fit} onChange={e => patch({ fit: e.target.value as CustomSceneSource['fit'] })}><option value="contain">完整显示 · contain</option><option value="cover">填满裁切 · cover</option><option value="stretch">拉伸填满 · stretch</option></select></label><label className="custom-visible"><input type="checkbox" checked={source.visible} onChange={e => patch({ visible: e.target.checked })}/>显示此图层</label><div className="custom-layer-actions"><button className="button small" onClick={() => patch({ x: 0, y: 0, width: 1920, height: 1080 })}><Maximize2 size={13}/>铺满画布</button><button className="button small" disabled={draft.sources.at(-1)?.id === selected} onClick={() => move(1)}>上移</button><button className="button small" disabled={draft.sources[0]?.id === selected} onClick={() => move(-1)}>下移</button><button className="button small" onClick={() => { setDraft(d => ({ ...d, sources: d.sources.filter(s => s.id !== selected) })); setSelected(null); }}>移除图层</button></div><p className="custom-source-boundary">{source.kind === 'obs' ? `共享引用：${source.inputName}。在 OBS 中修改此输入，会影响所有引用它的场景；并非独立副本。` : source.kind === 'window' ? '窗口捕获不显示鼠标，也不单独采集该应用音频。请在实际 OBS 预监中核对。' : '移除图层不删除素材库图片。'}负坐标和超画布尺寸按原有范围保留。</p></div> : <p className="custom-layer-empty">点选画布或左侧图层，即可调整位置、尺寸与叠放。</p>}
      </section>
    </fieldset>
    {!canEdit && <p role="alert" className="custom-editor-error">当前无编辑控制权或同步已中断；本地草稿仍保留。</p>}
    {conflict && <div className="custom-editor-conflict" role="alert"><div><span>配置已更新至 v{state.production?.configVersion}。服务器场景：{latest ? `${latest.name} · ${latest.sources.length} 图层` : initial ? '已被删除' : '尚未创建'}；本地草稿已保留。</span>{latest && <details><summary>查看服务器当前配置</summary><p>背景 {latest.background}</p><ul>{[...latest.sources].reverse().map(s => <li key={s.id}>{s.name} · {kindLabel[s.kind]} · {s.visible ? '显示' : '隐藏'} · X {s.x} / Y {s.y} / {s.width} × {s.height} · {s.fit}</li>)}</ul><button className="button small" disabled={busy} onClick={() => { setDraft(structuredClone(latest)); baseline.current = JSON.stringify(latest); setBaseVersion(state.production?.configVersion); setSelected(latest.sources.at(-1)?.id ?? null); setError(''); }}>采用服务器配置，放弃本地修改</button></details>}</div><button className="button small" disabled={busy} onClick={() => { setBaseVersion(state.production?.configVersion); setError(''); }}>已核对，保留本地修改</button></div>}
    {error && <p role="alert" className="custom-editor-error">{error}</p>}
    <footer>{discard ? <><span>放弃尚未保存的修改？已上传图片保留在素材库。</span><button className="button" onClick={() => setDiscard(false)}>继续编辑</button><button className="button" onClick={onClose}>放弃修改</button></> : <><span>{state.programScene === draft.id ? '当前正在播出；保存不改 PGM，再次 TAKE 才应用新构图。' : '保存 → 选择预监 → 核对 OBS 合成 → TAKE。'}</span><button className="button" disabled={busy} onClick={close}>取消</button><button className="button primary" disabled={busy || !canEdit || conflict || !draft.name.trim()} onClick={() => void save()}>{busy ? '正在处理…' : '保存到待播'}</button></>}</footer>
  </dialog>;
}
