import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, Crosshair, Eye, EyeOff, ImageOff, ImagePlus, Layers, Maximize2, Monitor, MousePointer2, PanelLeft, PanelRight, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import type { Asset, BroadcastState, CustomScene, CustomSceneSource, CustomSourceChoices, StateContext } from '../../shared/types';
import { api } from '../lib';
import { layerStyle, transformSceneSource, type ResizeHandle } from './custom-scene-geometry';
import { CustomSceneSourcePicker, type SourceSelection } from './CustomSceneSourcePicker';
import './custom-scenes.css';
import { customSceneFacts } from './custom-scene-status';

function CustomImageLayer({ source, asset, placeholders }: { source: CustomSceneSource; asset?: Asset; placeholders: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [asset?.url]);
  if (!asset || failed) return placeholders ? <div className="custom-source-placeholder"><ImageOff/><span>{source.name}</span><small>{failed ? '图片无法载入，请检查素材或更换来源' : '图片素材不可用'}</small></div> : null;
  return <img alt={source.name} src={asset.url} style={{ objectFit: source.fit === 'stretch' ? 'fill' : source.fit }} onError={() => setFailed(true)}/>;
}

/** This fixed-ratio layout is also used by the broadcast canvas. Editor UI stays outside it. */
export function CustomSceneLayout({ scene, state, placeholders = true }: { scene: CustomScene; state: BroadcastState; placeholders?: boolean }) {
  return <div className="custom-scene-layout" style={{ background: scene.background }}>
    {scene.sources.filter(source => source.visible).map(source => {
      const asset = source.kind === 'image' ? state.assets.find(item => item.id === source.assetId) : undefined;
      return <div key={source.id} className="custom-scene-layer" style={layerStyle(source)}>
        {source.kind === 'image' ? <CustomImageLayer source={source} asset={asset} placeholders={placeholders}/>
          : placeholders ? <div className="custom-source-placeholder"><Monitor/><span>{source.name}</span><small>排版占位 · 请在 OBS 预监核对</small></div> : null}
      </div>;
    })}
  </div>;
}

const handles: [ResizeHandle, string][] = [['nw', '左上'], ['n', '上边'], ['ne', '右上'], ['e', '右边'], ['se', '右下'], ['s', '下边'], ['sw', '左下'], ['w', '左边']];
const kindLabel = { image: '图片', window: '应用窗口', obs: '共享 OBS 来源', browser: '浏览器图层' };
const transformFields = [
  ['x', '横向位置', 'X', -1920, 1920], ['y', '纵向位置', 'Y', -1080, 1080],
  ['width', '宽度', 'W', 1, 3840], ['height', '高度', 'H', 1, 2160],
] as const;

function TransformField({ label, axis, value, min, max, disabled, onChange }: {
  label: string; axis: string; value: number; min: number; max: number; disabled: boolean; onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(value)); }, [value]);
  const invalid = text !== '' && (!Number.isFinite(Number(text)) || Number(text) < min || Number(text) > max);
  return <label className="custom-transform-field"><span>{label}</span><div><b aria-hidden="true">{axis}</b><input type="number" aria-label={label} aria-invalid={invalid || undefined} value={text} min={min} max={max} step="any" disabled={disabled}
    onFocus={() => { focused.current = true; }}
    onChange={event => { const raw = event.target.value; setText(raw); if (raw !== '' && Number.isFinite(Number(raw))) onChange(Number(raw)); }}
    onBlur={() => { focused.current = false; if (!text || !Number.isFinite(Number(text))) setText(String(value)); }}/></div><small>{min} ～ {max}</small></label>;
}

export function CustomSceneEditor({ state, send, notify, seat, connected, initial, onClose }: Pick<StateContext, 'state' | 'send' | 'notify' | 'seat' | 'connected'> & { initial?: CustomScene; onClose: () => void }) {
  const [draft, setDraft] = useState<CustomScene>(() => initial ? structuredClone(initial) : { id: `custom:${crypto.randomUUID()}`, name: '', background: '#101820', sources: [] });
  const [assets, setAssets] = useState<Asset[]>(state.assets);
  const [selected, setSelected] = useState<string | null>(initial?.sources.at(-1)?.id ?? null);
  const [choices, setChoices] = useState<CustomSourceChoices>({ windows: [], inputs: [] });
  const [sourcesRead, setSourcesRead] = useState(false);
  const [sourcePicker, setSourcePicker] = useState<{ kind: CustomSceneSource['kind']; replaceId?: string } | null>(null);
  const [previewGuide, setPreviewGuide] = useState(false);
  const [busy, setBusy] = useState<'upload' | 'save' | 'preview' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [discard, setDiscard] = useState(false);
  const [baseVersion, setBaseVersion] = useState(state.production?.configVersion);
  const [viewportSize, setViewportSize] = useState({ width: 640, height: 440 });
  const [zoom, setZoom] = useState('fit');
  const [guides, setGuides] = useState(false);
  const [compactPanel, setCompactPanel] = useState<'layers' | 'properties' | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const continueEditing = useRef<HTMLButtonElement>(null);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const sourceTrigger = useRef<HTMLElement | null>(null);
  const baseline = useRef(JSON.stringify(draft));
  const operation = useRef(false);
  const readingSources = useRef(false);
  const gesture = useRef<{ id: number; source: CustomSceneSource; handle: ResizeHandle; startX: number; startY: number; width: number; height: number } | null>(null);

  const facts = customSceneFacts(draft, state);
  const source = draft.sources.find(item => item.id === selected);
  const dirty = JSON.stringify(draft) !== baseline.current;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const canEdit = connected !== false && !!seat && seat.role === 'director' && state.production?.control?.owner === seat.id;
  const editLocked = !!busy || !canEdit;
  const conflict = baseVersion !== state.production?.configVersion;
  const latest = state.customScenes?.find(item => item.id === draft.id);
  const sceneLimit = !latest && (state.customScenes?.length ?? 0) >= 50;
  const duplicateName = state.customScenes?.some(item => item.id !== draft.id && item.name === draft.name.trim());
  const invalidSource = draft.sources.find(item => !item.name.trim() || transformFields.some(([key, , , min, max]) => !Number.isFinite(item[key]) || item[key] < min || item[key] > max));
  const saveBlockReason = !canEdit ? '当前无编辑控制权或同步已中断' : conflict ? '先核对服务器更新' : !draft.name.trim() ? '请填写场景名称' : duplicateName ? '场景名称已存在' : sceneLimit ? '最多保存 50 个自定义场景' : invalidSource ? `请检查图层「${invalidSource.name || '未命名'}」的名称与数值范围` : '';
  const readBlockReason = !local ? '仅导播主机可读取窗口与 OBS 来源。' : !canEdit ? '需要已同步且持有节目控制权的主导播席。' : state.connections.obs.status !== 'connected' ? 'OBS 尚未连接。请返回连接与输出页面检查。' : '';
  const canvasWidth = zoom === 'fit' ? Math.max(48, Math.min(viewportSize.width - 80, (viewportSize.height - 80) * 16 / 9)) : Number(zoom) * 19.2;
  const sourceAsset = source?.kind === 'image' ? assets.find(item => item.id === source.assetId) : undefined;
  const referenceMissing = source && (source.kind === 'image' ? !sourceAsset : source.kind === 'browser' ? !source.url : sourcesRead && !sourceError && !readBlockReason && !(source.kind === 'window' ? choices.windows.some(item => item.value === source.window) : choices.inputs.some(item => item.name === source.inputName)));

  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (node && !node.open) node.showModal();
    return () => { node?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => setViewportSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = viewport.current;
    if (node) { node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2; node.scrollTop = (node.scrollHeight - node.clientHeight) / 2; }
  }, [zoom, viewportSize]);
  useEffect(() => { setAssets(current => [...state.assets, ...current.filter(item => !state.assets.some(next => item.id === next.id))]); }, [state.assets]);
  useEffect(() => { if (state.connections.obs.status !== 'connected') setSourcesRead(false); }, [state.connections.obs.status]);
  useEffect(() => { if (discard) continueEditing.current?.focus(); }, [discard]);
  useEffect(() => {
    if (!canEdit && gesture.current) {
      const current = gesture.current;
      gesture.current = null;
      setDraft(value => ({ ...value, sources: value.sources.map(item => item.id === current.source.id ? current.source : item) }));
      if (canvas.current?.hasPointerCapture(current.id)) canvas.current.releasePointerCapture(current.id);
    }
  }, [canEdit]);

  const patchSource = (id: string, change: Partial<CustomSceneSource>) => setDraft(value => ({ ...value, sources: value.sources.map(item => item.id === id ? { ...item, ...change } : item) }));
  const patch = (change: Partial<CustomSceneSource>) => { if (selected && !editLocked) patchSource(selected, change); };
  const close = () => { if (operation.current) return; if (dirty) setDiscard(true); else onClose(); };
  const closeSourcePicker = (restoreFocus = true) => {
    if (operation.current) return;
    setSourcePicker(null);
    if (restoreFocus) requestAnimationFrame(() => {
      const trigger = sourceTrigger.current;
      if (trigger?.isConnected && trigger.checkVisibility()) trigger.focus();
      else canvas.current?.focus();
    });
  };
  function openSourcePicker(trigger: HTMLElement, replaceId?: string) {
    if (editLocked || (!replaceId && draft.sources.length >= 24)) return;
    sourceTrigger.current = trigger;
    setPreviewGuide(false);
    setCompactPanel(null);
    setSourcePicker({ kind: replaceId ? draft.sources.find(item => item.id === replaceId)!.kind : 'image', replaceId });
  }
  function applySource(selection: SourceSelection, replaceId = sourcePicker?.replaceId) {
    const data = { assetId: selection.kind === 'image' ? selection.reference : undefined, window: selection.kind === 'window' ? selection.reference : undefined, inputName: selection.kind === 'obs' ? selection.reference : undefined, url: selection.kind === 'browser' ? selection.reference : undefined };
    if (replaceId) {
      patchSource(replaceId, { kind: selection.kind, ...data });
      setSelected(replaceId);
    } else {
      if (draft.sources.length >= 24) { setError('每个场景最多添加 24 个来源；已上传图片仍保留在素材库。'); return; }
      const id = crypto.randomUUID();
      setDraft(value => ({ ...value, sources: [...value.sources, { id, kind: selection.kind, name: selection.name.slice(0, 100), x: 0, y: 0, width: 1920, height: 1080, fit: 'contain', visible: true, ...data }] }));
      setSelected(id);
    }
    setError('');
    setSourcePicker(null);
    requestAnimationFrame(() => canvas.current?.focus());
  }
  async function refresh() {
    if (readingSources.current || readBlockReason) return;
    readingSources.current = true;
    setLoading(true); setSourceError('');
    try { setChoices(await api<CustomSourceChoices>('/api/obs/custom-sources')); setSourcesRead(true); }
    catch (error) { setSourceError(error instanceof Error ? error.message : '读取来源失败'); setSourcesRead(false); }
    finally { readingSources.current = false; setLoading(false); }
  }
  async function uploadImage(file?: File) {
    if (!file || operation.current || !canEdit) return;
    const replaceId = sourcePicker?.replaceId;
    operation.current = true; setBusy('upload'); setError('');
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('图片不能超过 8 MB');
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('仅支持 PNG、JPEG、WebP、GIF 图片');
      const form = new FormData(); form.append('file', file); form.append('category', 'other');
      const asset = await api<Asset>('/api/assets', { method: 'POST', body: form });
      setAssets(list => [asset, ...list.filter(item => item.id !== asset.id)]);
      applySource({ kind: 'image', name: asset.name, reference: asset.id }, replaceId);
    } catch (error) { setError(error instanceof Error ? error.message : '上传失败，本地草稿仍保留'); }
    finally { operation.current = false; setBusy(null); if (upload.current) upload.current.value = ''; }
  }
  async function save() {
    if (operation.current || saveBlockReason) return;
    operation.current = true; setBusy('save'); setError('');
    try {
      await send({ type: 'save-custom-scene', scene: draft, expectedConfigVersion: baseVersion });
      notify('自定义场景已保存到待播；选择预监核对实际合成');
      onClose();
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败，本地草稿仍保留'); }
    finally { operation.current = false; setBusy(null); }
  }
  async function choosePreview() {
    if (operation.current || dirty || !latest || !canEdit || conflict) return;
    operation.current = true; setBusy('preview'); setError('');
    try {
      await send({ type: 'preview-scene', scene: draft.id });
      notify('已选择自定义预监；请在 PVW 核对 OBS 实际合成，节目未切换');
      onClose();
    } catch (error) { setError(error instanceof Error ? error.message : '选择预监失败，本地内容仍保留'); }
    finally { operation.current = false; setBusy(null); }
  }
  function move(delta: number) {
    if (editLocked) return;
    setDraft(value => {
      const sources = [...value.sources], index = sources.findIndex(item => item.id === selected), next = index + delta;
      if (index < 0 || next < 0 || next >= sources.length) return value;
      [sources[index], sources[next]] = [sources[next], sources[index]];
      return { ...value, sources };
    });
  }
  function removeSelected() {
    if (editLocked) return;
    const sources = draft.sources.filter(item => item.id !== selected);
    setDraft(value => ({ ...value, sources }));
    setSelected(sources.at(-1)?.id ?? null);
  }
  function start(event: PointerEvent, item: CustomSceneSource, handle: ResizeHandle) {
    if (event.button !== 0 || editLocked || gesture.current || !canvas.current) return;
    event.preventDefault(); event.stopPropagation(); setSelected(item.id); canvas.current.focus();
    const rect = canvas.current.getBoundingClientRect();
    gesture.current = { id: event.pointerId, source: { ...item }, handle, startX: event.clientX, startY: event.clientY, width: rect.width, height: rect.height };
    canvas.current.setPointerCapture(event.pointerId);
  }
  function finishGesture(pointerId: number, cancel = false) {
    const current = gesture.current;
    if (!current || current.id !== pointerId) return;
    if (cancel) patchSource(current.source.id, current.source);
    gesture.current = null;
    if (canvas.current?.hasPointerCapture(pointerId)) canvas.current.releasePointerCapture(pointerId);
  }

  return <dialog ref={dialog} className="custom-scene-dialog" aria-labelledby="custom-scene-title" onCancel={event => {
    event.preventDefault();
    if (gesture.current) finishGesture(gesture.current.id, true);
    else if (sourcePicker) closeSourcePicker();
    else if (previewGuide) { setPreviewGuide(false); previewTrigger.current?.focus(); }
    else if (discard) setDiscard(false);
    else close();
  }} onKeyDown={event => event.stopPropagation()}>
    <header className="custom-editor-heading">
      <button type="button" className="button custom-editor-back" aria-label="返回导播台，关闭场景编辑器" disabled={!!busy} onClick={close}><ArrowLeft size={17}/><span>返回导播</span></button>
      <div className="custom-editor-identity"><h2 id="custom-scene-title">{initial ? '编辑自定义场景' : '新建自定义场景'}</h2><label><span className="sr-only">场景名称</span><input autoFocus={!initial} aria-invalid={duplicateName || undefined} value={draft.name} maxLength={60} placeholder="输入场景名称" disabled={editLocked} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))}/></label></div>
      <div className="custom-editor-save-state" data-dirty={dirty || !latest}><strong>{busy === 'upload' ? '正在上传图片' : busy === 'save' ? '正在保存待播' : busy === 'preview' ? '正在选择预监' : conflict ? '需要核对更新' : dirty || !latest ? '本地草稿' : '已保存待播'}</strong><span>{dirty ? '修改尚未保存' : latest ? '与打开时配置一致' : '保存后进入场景库'}</span></div>
      <div className="custom-editor-primary-actions"><button ref={previewTrigger} type="button" className="button" aria-expanded={previewGuide} disabled={!!busy} onClick={() => { setSourcePicker(null); setPreviewGuide(value => !value); setCompactPanel(null); }}><Monitor size={16}/><span>实际合成</span></button><button type="button" className="button primary" title={saveBlockReason || '仅保存待播，不切换节目'} disabled={!!busy || !!saveBlockReason} onClick={() => void save()}><Save size={16}/>{busy === 'save' ? '正在保存…' : '保存到待播'}</button></div>
    </header>
    <input ref={upload} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="上传场景图片" tabIndex={-1} disabled={editLocked} onChange={event => void uploadImage(event.target.files?.[0])}/>
    <div className="custom-editor-body" data-panel={compactPanel ?? ''}>
      <section className="custom-editor-layers" aria-label="场景图层" inert={!!sourcePicker || previewGuide}>
        <div className="custom-pane-heading"><div><h3><Layers size={16}/>图层</h3><span>{draft.sources.length} / 24</span></div><button type="button" className="custom-icon-button custom-pane-close" aria-label="收起图层面板" onClick={() => setCompactPanel(null)}><X size={17}/></button></div>
        <button type="button" className="button custom-add-source" disabled={editLocked || draft.sources.length >= 24} title={draft.sources.length >= 24 ? '每个场景最多 24 个来源' : '添加图片、浏览器地址、应用窗口或已有 OBS 来源'} onClick={event => openSourcePicker(event.currentTarget)}><Plus size={16}/>添加来源</button>
        <p className="custom-layer-order">列表上方覆盖下方</p>
        <div className="custom-layer-list">{[...draft.sources].reverse().map(item => <div key={item.id} className="custom-layer-row" data-selected={item.id === selected} data-visible={item.visible}>
          <button type="button" className="custom-layer-select" aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}>{item.kind === 'image' ? <span className="custom-layer-thumbnail">{assets.some(asset => asset.id === item.assetId) ? <img src={assets.find(asset => asset.id === item.assetId)!.url} alt=""/> : <ImageOff size={18}/>}</span> : <span className="custom-layer-thumbnail">{item.kind === 'window' ? <Monitor size={18}/> : <Layers size={18}/>}</span>}<span><strong title={item.name}>{item.name || '未命名图层'}</strong><small>{kindLabel[item.kind]}{!item.visible && ' · 已隐藏'}</small></span></button>
          <button type="button" className="custom-layer-visibility custom-icon-button" aria-label={`${item.visible ? '隐藏' : '显示'}图层 ${item.name}`} title={item.visible ? '隐藏此图层' : '显示此图层'} disabled={editLocked} onClick={() => patchSource(item.id, { visible: !item.visible })}>{item.visible ? <Eye size={15}/> : <EyeOff size={15}/>}</button>
        </div>)}{!draft.sources.length && <div className="custom-layer-empty"><Layers size={24}/><p>还没有图层</p><small>添加来源后，可在画布点选并调整位置。</small></div>}</div>
        <div className="custom-layer-stack-tools" role="group" aria-label="图层叠放与移除"><button type="button" className="button" disabled={editLocked || !source || draft.sources.at(-1)?.id === selected} onClick={() => move(1)}><ArrowUp size={14}/>上移</button><button type="button" className="button" disabled={editLocked || !source || draft.sources[0]?.id === selected} onClick={() => move(-1)}><ArrowDown size={14}/>下移</button><button type="button" className="custom-icon-button" aria-label="移除图层" title="移除所选图层；保留素材和共享 OBS 输入" disabled={editLocked || !source} onClick={removeSelected}><Trash2 size={15}/></button></div>
        <button type="button" className="custom-scene-settings" aria-pressed={!source} onClick={() => { setSelected(null); setCompactPanel('properties'); }}><span style={{ background: draft.background }}/><strong>场景背景</strong><small>{draft.background}</small></button>
      </section>
      <section className="custom-editor-composition" aria-label="场景画布编辑">
        <div className="custom-composition-surface" inert={!!sourcePicker || previewGuide}>
          <div className="custom-canvas-toolbar"><button type="button" className="custom-icon-button custom-layers-toggle" aria-label="显示图层面板" aria-expanded={compactPanel === 'layers'} onClick={() => setCompactPanel(value => value === 'layers' ? null : 'layers')}><PanelLeft size={17}/></button><span className="custom-canvas-tool"><MousePointer2 size={15}/>点选 / 移动</span><span className="custom-canvas-dimensions">1920 × 1080</span><div className="custom-canvas-view-tools"><button type="button" className="custom-icon-button" aria-label="中心辅助线" aria-pressed={guides} title="显示或隐藏中心辅助线；不进入节目输出" onClick={() => setGuides(value => !value)}><Crosshair size={16}/></button><label><span className="sr-only">画布缩放</span><select value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">适合窗口</option><option value="25">25%</option><option value="50">50%</option><option value="75">75%</option><option value="100">100%</option></select></label><b>{Math.round(canvasWidth / 19.2)}%</b><button type="button" className="custom-icon-button custom-properties-toggle" aria-label="显示属性面板" aria-expanded={compactPanel === 'properties'} onClick={() => setCompactPanel(value => value === 'properties' ? null : 'properties')}><PanelRight size={17}/></button></div></div>
          <div ref={viewport} className="custom-canvas-viewport">
            <div className="custom-canvas-stage" style={{ width: Math.max(viewportSize.width, canvasWidth + 80), height: Math.max(viewportSize.height, canvasWidth * 9 / 16 + 80) }} onPointerDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
              <div ref={canvas} className="custom-edit-canvas" role="group" aria-label="场景画布，方向键微调所选图层" aria-describedby="custom-canvas-help" tabIndex={0} style={{ width: canvasWidth }}
                onPointerDown={event => { if (event.target === event.currentTarget) setSelected(null); }}
                onPointerMove={event => { const current = gesture.current; if (current && current.id === event.pointerId && !editLocked) patchSource(current.source.id, transformSceneSource(current.source, current.handle, (event.clientX - current.startX) * 1920 / current.width, (event.clientY - current.startY) * 1080 / current.height)); }}
                onPointerUp={event => finishGesture(event.pointerId)} onPointerCancel={event => finishGesture(event.pointerId, true)} onLostPointerCapture={event => finishGesture(event.pointerId, true)}
                onKeyDown={event => {
                  if (event.key === 'Escape' && gesture.current) { event.preventDefault(); finishGesture(gesture.current.id, true); return; }
                  if (!source || editLocked || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
                  const step = event.shiftKey ? 10 : 1;
                  const offsets: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                  if (offsets[event.key]) { event.preventDefault(); event.stopPropagation(); patch(transformSceneSource(source, 'move', ...offsets[event.key])); }
                }}>
                <CustomSceneLayout scene={draft} state={{ ...state, assets }}/>
                {guides && <div className="custom-canvas-guides" aria-hidden="true"><i/><i/></div>}
                <div className="custom-canvas-hits">{draft.sources.filter(item => item.visible).map(item => <div key={item.id} className="custom-canvas-hit" style={layerStyle(item)} onPointerDown={event => start(event, item, 'move')} title={item.name}/>)}</div>
                {source?.visible && <div className="custom-canvas-selection" style={layerStyle(source)}><span>{source.name} <b>{Math.round(source.width)} × {Math.round(source.height)}</b></span>{!editLocked && handles.map(([handle, label]) => <button type="button" key={handle} className={`canvas-handle handle-${handle}`} tabIndex={-1} aria-label={`${label}缩放图层`} onPointerDown={event => start(event, source, handle)}/>)}</div>}
                {!draft.sources.length && <div className="custom-canvas-empty"><ImagePlus size={30}/><strong>从一个来源开始构图</strong><p>图片、浏览器地址、应用窗口或已有 OBS 来源</p><button type="button" className="button" disabled={editLocked} onClick={event => openSourcePicker(event.currentTarget)}><Plus size={15}/>添加第一个来源</button></div>}
              </div>
            </div>
          </div>
          <div className="custom-canvas-caption"><span>{source ? `${source.visible ? '已选中' : '已隐藏'}：${source.name || '未命名图层'}` : '点选图层，或编辑场景背景'}</span><small>排版示意</small></div>
        </div>
        {sourcePicker && <CustomSceneSourcePicker kind={sourcePicker.kind} replacing={!!sourcePicker.replaceId} assets={assets} choices={choices} hasReadSources={sourcesRead} loading={loading} error={sourceError} disabled={editLocked} busy={!!busy} readBlockReason={readBlockReason} onKind={kind => setSourcePicker(value => value ? { ...value, kind } : null)} onRefresh={() => void refresh()} onUpload={() => upload.current?.click()} onSelect={selection => { if (!editLocked) applySource(selection); }} onClose={() => closeSourcePicker()}/>}
        {previewGuide && <section className="custom-composite-guide" aria-labelledby="custom-composite-title"><header><Monitor size={20}/><h3 id="custom-composite-title">核对实际合成</h3><button type="button" className="custom-icon-button" aria-label="返回排版编辑" onClick={() => { setPreviewGuide(false); previewTrigger.current?.focus(); }}><X size={18}/></button></header><div><p>这里展示排版草稿。应用窗口与 OBS 来源使用占位图，实际运动画面需要回到导播台，在 PVW 核对。</p><dl className="custom-composition-facts"><div><dt>可见来源</dt><dd>图片 {facts.images} / 浏览器 {facts.browsers} / 窗口 {facts.windows} / 共享 OBS {facts.sharedInputs}</dd></div><div><dt>隐藏图层</dt><dd>{facts.hidden}</dd></div><div><dt>节目配置</dt><dd>{facts.onAir ? facts.changedOnAir ? '新构图待切入，当前节目使用已播快照' : '此场景正在节目中' : '此场景尚未切入当前节目'}</dd></div><div><dt>串联单引用</dt><dd>{facts.references.length} 项</dd></div></dl>{facts.missingImages.length > 0 && <p className="custom-editor-error">{facts.missingImages.length} 张可见图片缺少素材记录，请先更换；文件本身会在准备时再次核验。</p>}<ol><li><strong>保存到待播</strong><span>保存图层配置，正在播出的场景保持上次 TAKE 的快照。</span></li><li><strong>选择预监</strong><span>在 PVW 检查窗口、图片与共享来源的实际合成。</span></li><li><strong>核对后 TAKE</strong><span>由当前主导播切入，再核对节目画面与声音。</span></li></ol>{facts.sharedInputs > 0 && <p className="custom-source-boundary">共享 OBS 输入自身的外部修改仍会影响其他引用；保存快照不冻结该输入的内容或音频。</p>}</div><footer>{dirty || !latest ? <><span>当前草稿需要先保存。</span><button type="button" className="button primary" disabled={!!busy || !!saveBlockReason} title={saveBlockReason || undefined} onClick={() => void save()}>保存到待播并返回</button></> : <><span>只选择 PVW，节目保持不变。</span><button type="button" className="button primary" disabled={!!busy || !canEdit || conflict} onClick={() => void choosePreview()}>{busy === 'preview' ? '正在选择…' : '选择预监并返回'}</button></>}</footer></section>}
      </section>
      <section className="custom-editor-properties" aria-label="图层与场景属性" inert={!!sourcePicker || previewGuide}>
        <div className="custom-pane-heading"><div><h3>{source ? '图层属性' : '场景属性'}</h3><span>{source ? kindLabel[source.kind] : '1920 × 1080'}</span></div><button type="button" className="custom-icon-button custom-pane-close" aria-label="收起属性面板" onClick={() => setCompactPanel(null)}><X size={17}/></button></div>
        <div className="custom-properties-scroll">{source ? <>
          <section className="custom-property-section"><label>图层名称<input value={source.name} maxLength={100} disabled={editLocked} aria-invalid={!source.name.trim() || undefined} onChange={event => patch({ name: event.target.value })}/></label></section>
          <section className="custom-property-section"><h4>位置与尺寸 <span>px</span></h4><div className="custom-transform-fields">{transformFields.map(([key, label, axis, min, max]) => <TransformField key={`${source.id}-${key}`} label={label} axis={axis} value={source[key]} min={min} max={max} disabled={editLocked} onChange={value => patch({ [key]: value })}/>)}</div><div className="custom-transform-actions"><button type="button" className="button" disabled={editLocked} onClick={() => patch({ x: Math.round((1920 - source.width) / 2), y: Math.round((1080 - source.height) / 2) })}><Crosshair size={14}/>居中</button><button type="button" className="button" disabled={editLocked} onClick={() => patch({ x: 0, y: 0, width: 1920, height: 1080 })}><Maximize2 size={14}/>铺满画布</button></div></section>
          <section className="custom-property-section"><h4>适配与显示</h4><label><span className="sr-only">适配方式</span><select value={source.fit} disabled={editLocked} onChange={event => patch({ fit: event.target.value as CustomSceneSource['fit'] })}><option value="contain">完整显示 · contain</option><option value="cover">填满裁切 · cover</option><option value="stretch">拉伸填满 · stretch</option></select></label><p className="custom-fit-description">{source.fit === 'contain' ? '保持来源比例，完整放入图层范围。' : source.fit === 'cover' ? '保持来源比例，裁掉超出范围的部分。' : '按图层宽高拉伸，来源比例会改变。'}</p><label className="custom-visible"><input type="checkbox" checked={source.visible} disabled={editLocked} onChange={event => patch({ visible: event.target.checked })}/>{source.visible ? '图层可见' : '图层已隐藏'}</label></section>
          <section className="custom-property-section"><h4>来源</h4><div className="custom-bound-source">{sourceAsset && <img src={sourceAsset.url} alt=""/>}<div><strong>{source.kind === 'image' ? sourceAsset?.name ?? '图片素材不可用' : source.kind === 'browser' ? source.url : source.kind === 'obs' ? source.inputName : choices.windows.find(item => item.value === source.window)?.name ?? source.name}</strong><small>{source.kind === 'image' ? sourceAsset?.width && sourceAsset.height ? `${sourceAsset.width} × ${sourceAsset.height}` : kindLabel[source.kind] : kindLabel[source.kind]}</small></div></div><p className="custom-reference-status" data-missing={!!referenceMissing}>{source.kind === 'browser' ? '网页将在 OBS 浏览器来源中载入，实际内容请在预监核对。' : source.kind === 'image' ? sourceAsset ? '素材库已找到；实际文件在准备时再次检查。' : '素材记录缺失，请更换图片。' : readBlockReason || (sourceError ? `读取失败：${sourceError}` : sourcesRead ? referenceMissing ? source.kind === 'window' ? '最近读取未找到此窗口。请打开应用、恢复会话后刷新，或更换窗口。' : '最近读取未找到此 OBS 输入。请恢复输入或更换来源。' : '最近读取可选择；实际画面与声音仍需在 PVW 核对。' : '尚未读取主机来源，无法判断当前是否可选择。')}</p><div className="custom-source-property-actions"><button type="button" className="button" disabled={editLocked} onClick={event => openSourcePicker(event.currentTarget, source.id)}>更换来源</button>{['window', 'obs'].includes(source.kind) && <button type="button" className="button" disabled={editLocked || !!readBlockReason || loading} title={readBlockReason || undefined} onClick={() => void refresh()}><RefreshCw size={13}/>{loading ? '读取中…' : '刷新来源'}</button>}</div><p className="custom-source-boundary">{source.kind === 'browser' ? '此来源使用独立网页视口并默认静音。' : source.kind === 'obs' ? '共享引用。在 OBS 修改输入内容或音频设置，会影响所有引用它的场景。' : source.kind === 'window' ? '窗口捕获不显示鼠标，也不单独采集该应用音频。最小化或会话断开可能影响捕获。' : '移除图层、放弃编辑或删除场景都不会删除已上传图片。'}</p></section>
        </> : <>
          <section className="custom-property-section"><h4>背景颜色</h4><label className="custom-background"><span className="sr-only">场景背景颜色</span><input type="color" value={draft.background} disabled={editLocked} onChange={event => setDraft(value => ({ ...value, background: event.target.value }))}/><code>{draft.background}</code></label><p className="custom-fit-description">六位十六进制实色；覆盖场景的完整画布。</p></section>
          <section className="custom-property-section"><h4>画布</h4><dl className="custom-scene-facts"><div><dt>输出尺寸</dt><dd>1920 × 1080</dd></div><div><dt>图层上限</dt><dd>24 个来源</dd></div><div><dt>自定义场景</dt><dd>{state.customScenes?.length ?? 0} / 50</dd></div></dl><p className="custom-source-boundary">选中图层后，在这里调整位置、尺寸、适配方式和来源。画布缩放与辅助线只用于编辑。</p></section>
          <section className="custom-property-section"><h4>保存与节目</h4><p className="custom-source-boundary">{state.programScene === draft.id ? '此场景正在节目中。保存新构图后，PGM 继续使用上次 TAKE 的配置，再次 TAKE 才应用新配置。' : '保存只写入待播。选择 PVW 核对实际合成后，再由主导播 TAKE。'}</p></section>
        </>}</div>
      </section>
    </div>
    <div className="custom-editor-feedback">
      {!canEdit && <p role="alert" className="custom-editor-error">{connected === false ? '同步已中断' : '当前席位没有编辑控制权'}；本地草稿仍保留，恢复后可继续编辑。</p>}
      {conflict && <div className="custom-editor-conflict" role="alert"><div><strong>服务器配置已更新至 v{state.production?.configVersion}</strong><span>服务器场景：{latest ? `${latest.name}，${latest.sources.length} 个图层` : initial ? '已被删除' : '尚未创建'}。本地草稿已保留。</span><details><summary>核对服务器当前配置</summary>{latest ? <><p>背景 {latest.background}</p><ul>{[...latest.sources].reverse().map(item => <li key={item.id}>{item.name} · {kindLabel[item.kind]} · {item.visible ? '显示' : '隐藏'} · X {item.x} / Y {item.y} / {item.width} × {item.height} · {item.fit}</li>)}</ul><button type="button" className="button" disabled={!!busy} onClick={() => { setDraft(structuredClone(latest)); baseline.current = JSON.stringify(latest); setBaseVersion(state.production?.configVersion); setSelected(latest.sources.at(-1)?.id ?? null); setError(''); }}>采用服务器配置，放弃本地修改</button></> : <p>{initial ? '场景已在服务器删除。保留本地草稿并再次保存会重新创建此场景。' : '服务器上尚未创建这个场景。保存时仍会校验名称、数量与来源。'}</p>}</details></div><button type="button" className="button" disabled={!!busy || !canEdit} onClick={() => { setBaseVersion(state.production?.configVersion); setError(''); }}>已核对，保留本地修改</button></div>}
      {(error || duplicateName || sceneLimit || invalidSource) && <p role="alert" className="custom-editor-error">{error || (duplicateName ? '场景名称已存在，请更换名称。' : sceneLimit ? '已达到 50 个自定义场景上限。本地草稿保留，可返回场景库整理后重试。' : saveBlockReason)}</p>}
    </div>
    <footer className="custom-editor-footer">{discard ? <div className="custom-discard-confirm" role="group" aria-label="放弃未保存修改"><span><strong>放弃尚未保存的修改？</strong>已上传图片保留在素材库。</span><button ref={continueEditing} type="button" className="button" onClick={() => setDiscard(false)}>继续编辑</button><button type="button" className="button danger" onClick={onClose}>放弃修改</button></div> : <><span className="custom-editor-staging-note"><Check size={14}/>{state.programScene === draft.id ? '保存不改变正在播出的场景；再次 TAKE 才应用新构图。' : '保存到待播后，选择预监核对，再 TAKE。'}</span><span id="custom-canvas-help" className="custom-canvas-help">拖动移动 · 八向缩放 · 方向键 1 px / Shift 10 px</span></>}</footer>
  </dialog>;
}
