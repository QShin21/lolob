import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Layers, Monitor, RefreshCw, Search, X } from 'lucide-react';
import type { Asset, CustomSceneSource, CustomSourceChoices } from '../../shared/types';

export type SourceSelection = {
  kind: CustomSceneSource['kind'];
  name: string;
  reference: string;
};

const sourceKinds = [
  { kind: 'image', label: '图片', icon: ImagePlus },
  { kind: 'window', label: '应用窗口', icon: Monitor },
  { kind: 'obs', label: '已有 OBS 来源', icon: Layers },
] as const;

export function CustomSceneSourcePicker({
  kind, replacing, assets, choices, hasReadSources, loading, error, disabled, busy,
  readBlockReason, onKind, onRefresh, onUpload, onSelect, onClose,
}: {
  kind: CustomSceneSource['kind'];
  replacing: boolean;
  assets: Asset[];
  choices: CustomSourceChoices;
  hasReadSources: boolean;
  loading: boolean;
  error: string;
  disabled: boolean;
  busy: boolean;
  readBlockReason: string;
  onKind: (kind: CustomSceneSource['kind']) => void;
  onRefresh: () => void;
  onUpload: () => void;
  onSelect: (selection: SourceSelection) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { setQuery(''); setSelected(''); search.current?.focus(); }, [kind]);

  const rows = kind === 'image'
    ? assets.map(asset => ({ reference: asset.id, name: asset.name, detail: asset.width && asset.height ? `${asset.width} × ${asset.height}` : '素材库图片', url: asset.url }))
    : kind === 'window'
      ? choices.windows.map(item => ({ reference: item.value, name: item.name, detail: '本次读取可选择；捕获效果需在 OBS 核对', url: undefined }))
      : choices.inputs.map(item => ({ reference: item.name, name: item.name, detail: item.kind, url: undefined }));
  const filtered = rows.filter(item => `${item.name} ${item.detail}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const chosen = rows.find(item => item.reference === selected);
  const hostUnavailable = kind !== 'image' && (!!readBlockReason || !hasReadSources || !!error || loading);
  const sourceTitle = sourceKinds.find(item => item.kind === kind)!.label;

  return <section className="custom-source-panel" aria-labelledby="custom-source-panel-title">
    <header className="custom-source-panel-heading">
      <div><h3 id="custom-source-panel-title">{replacing ? `更换${sourceTitle}` : '添加来源'}</h3><p>{replacing ? '保留图层名称、位置、尺寸与显示设置。' : '选择来源，添加到最上层后继续构图。'}</p></div>
      <button type="button" className="custom-icon-button" aria-label="关闭来源面板" disabled={busy} onClick={onClose}><X size={18}/></button>
    </header>
    {!replacing && <div className="custom-source-kinds" role="group" aria-label="来源类型">{sourceKinds.map(({ kind: value, label, icon: Icon }) => <button type="button" key={value} aria-pressed={value === kind} onClick={() => onKind(value)} disabled={disabled}><Icon size={17}/>{label}</button>)}</div>}
    <div className="custom-source-panel-tools">
      <label className="custom-source-search"><Search size={16}/><input ref={search} aria-label={`搜索${sourceTitle}`} placeholder={`搜索${sourceTitle}`} value={query} onChange={event => setQuery(event.target.value)}/></label>
      {kind === 'image'
        ? <button type="button" className="button" disabled={disabled} onClick={onUpload}><ImagePlus size={16}/>上传图片</button>
        : <button type="button" className="button" disabled={disabled || !!readBlockReason || loading} title={readBlockReason || '重新读取当前导播主机的窗口与 OBS 来源'} onClick={onRefresh}><RefreshCw size={15}/>{loading ? '读取中…' : '刷新主机来源'}</button>}
    </div>
    <p className="custom-source-panel-note">{kind === 'image'
      ? 'PNG / JPEG / WebP / GIF，单张不超过 8 MB。上传成功后图片保留在素材库。'
      : readBlockReason || (kind === 'window'
        ? '应用需保持可见。窗口枚举不能确认实际捕获；最小化、会话断开或应用限制可能导致无画面。'
        : '共享引用保留原输入的内容与音频设置；在 OBS 修改它，也会影响其他引用场景。')}</p>
    {error && kind !== 'image' && <p className="custom-source-panel-error" role="alert">读取失败：{error}。本地构图仍保留。</p>}
    <div className="custom-source-results" aria-busy={loading}>
      {hostUnavailable ? <div className="custom-source-empty"><Monitor size={28}/><strong>{loading ? '正在读取主机来源' : error ? '来源列表未能更新' : readBlockReason ? '当前无法读取主机来源' : '先读取导播主机的来源'}</strong><p>{readBlockReason || (error ? '检查 OBS 连接后刷新重试。' : '刷新只读取可选择的来源，不切换节目或预监。')}</p></div>
        : filtered.length ? <div className={`custom-source-results-list ${kind === 'image' ? 'with-images' : ''}`} role="group" aria-label={`${sourceTitle}列表`}>{filtered.map(item => <button type="button" key={item.reference} className="custom-source-result" aria-pressed={selected === item.reference} disabled={disabled} onClick={() => setSelected(item.reference)}>
          {kind === 'image' ? <img src={item.url} alt="" loading="lazy"/> : <span className="custom-source-result-icon">{kind === 'window' ? <Monitor size={22}/> : <Layers size={22}/>}</span>}
          <span className="custom-source-result-copy"><strong title={item.name}>{item.name}</strong><small>{item.detail}</small></span>
          {selected === item.reference && <Check size={16}/>}
        </button>)}</div>
          : <div className="custom-source-empty">{kind === 'image' ? <ImagePlus size={28}/> : <Monitor size={28}/>}<strong>{query ? '没有匹配的来源' : kind === 'image' ? '素材库还没有图片' : '本次读取未找到可选择来源'}</strong><p>{query ? '试试更短的名称，或清空搜索。' : kind === 'image' ? '上传一张图片，开始制作这个场景。' : kind === 'window' ? '打开所需应用并保持窗口可见，再刷新列表。' : '先在 OBS 中添加所需输入，再刷新列表。'}</p></div>}
    </div>
    <footer className="custom-source-panel-footer"><span>{chosen && !hostUnavailable ? chosen.name : '选择一项来源'}</span><button type="button" className="button" disabled={busy} onClick={onClose}>返回画布</button><button type="button" className="button primary" disabled={disabled || !chosen || hostUnavailable} onClick={() => chosen && onSelect({ kind, name: chosen.name, reference: chosen.reference })}>{replacing ? '更换来源' : kind === 'image' ? '添加图片' : kind === 'window' ? '添加窗口' : '引用来源'}</button></footer>
  </section>;
}
