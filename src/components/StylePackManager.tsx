import { useEffect, useRef, useState } from 'react';
import { Download, Upload, X, Palette, Trash2 } from 'lucide-react';
import { stylePackDeleteBlock } from '../../shared/style-pack-usage';
import type { BroadcastState, Champion, StateContext, BuiltinScene } from '../../shared/types';
import { BUILTIN_RUNTIME_STYLES, BUILTIN_STYLE_REF, STYLE_PACK_MAX_BYTES, STYLE_SCENES, sameStyle, styleRef, styleSummary } from '../../shared/style-packs';
import type { StylePackSummary } from '../../shared/style-packs';
import { api, sceneInfo } from '../lib';
import { BroadcastCanvas } from './BroadcastCanvas';
import { loadStylePack } from './useStylePack';
import './style-pack-manager.css';

type Props = { state: BroadcastState; champions: Champion[]; onClose: () => void } & Pick<StateContext, 'send' | 'notify' | 'seat' | 'connected'>;
export function StylePackManager({ state, champions, send, notify, seat, connected, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), fileInput = useRef<HTMLInputElement>(null), working = useRef(false);
  const [packs, setPacks] = useState<StylePackSummary[]>(BUILTIN_RUNTIME_STYLES.map(styleSummary));
  const [selected, setSelected] = useState(styleRef(state.overlay.stylePack));
  const [scene, setScene] = useState<BuiltinScene>(state.previewScene.startsWith('custom:') ? 'standby' : state.previewScene as BuiltinScene);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [warnings, setWarnings] = useState<string[]>([]), [ready, setReady] = useState(false);
  const canEdit = connected !== false && seat?.role === 'director' && state.production?.control?.owner === seat.id;
  const active = styleRef(state.overlay.stylePack), onAir = styleRef(state.production?.program?.overlay.stylePack);
  const selectedInfo = packs.find(p => sameStyle(p, selected));
  const deleteBlock = stylePackDeleteBlock(state, selected);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { previous?.focus(); };
  }, []);
  useEffect(() => {
    let alive = true;
    void api<{ packs: StylePackSummary[]; warnings: string[] }>('/api/style-packs').then(data => { if (alive) { setPacks(data.packs); setWarnings(data.warnings); } }).catch(e => { if (alive) setError(e instanceof Error ? e.message : '读取风格包失败'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true; setReady(false); setError('');
    void loadStylePack(selected).then(() => { if (alive) setReady(true); }).catch(e => { if (alive) setError(e instanceof Error ? e.message : '贴图加载失败'); });
    return () => { alive = false; };
  }, [selected.id, selected.revision]);
  useEffect(() => { setConfirmDelete(false); }, [selected.id, selected.revision]);
  async function removeSelected() {
    if (!canEdit || working.current || !selectedInfo || deleteBlock) return;
    working.current = true; setBusy(true); setError('');
    try {
      const data = await api<{ packs: StylePackSummary[]; warnings: string[] }>(`/api/style-packs/${selected.id}/${selected.revision}`, { method: 'DELETE' });
      setPacks(data.packs); setWarnings(data.warnings); setSelected(BUILTIN_STYLE_REF); setConfirmDelete(false);
      notify(`已删除 ${selected.name}；可重新导入 ZIP 恢复`, 'success');
    } catch (e) { setError(e instanceof Error ? e.message : '删除失败'); }
    finally { working.current = false; setBusy(false); }
  }
  async function importFile(file?: File) {
    if (!file || !canEdit || working.current) return;
    if (!/\.zip$/i.test(file.name) || file.size > STYLE_PACK_MAX_BYTES) { setError('请选择不超过 48 MiB 的 ZIP 风格包'); return; }
    working.current = true; setBusy(true); setError('');
    try {
      const body = new FormData(); body.append('file', file);
      const pack = await api<StylePackSummary>('/api/style-packs/import', { method: 'POST', body });
      setPacks(current => [...current.filter(p => !sameStyle(p, pack)), pack]); setSelected(pack);
      notify(`已导入 ${pack.name}；尚未改变预监或节目`, 'success');
    } catch (e) { setError(e instanceof Error ? e.message : '导入失败'); }
    finally { working.current = false; setBusy(false); }
  }
  async function stage() {
    if (!canEdit || !ready || working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      await loadStylePack(selected);
      await send({ type: 'set-style-pack', id: selected.id, revision: selected.revision });
      notify(`已将 ${selected.name} 准备到预监；核对后 TAKE 生效`, 'success');
    } catch (e) { setError(e instanceof Error ? e.message : '切换未完成'); }
    finally { working.current = false; setBusy(false); }
  }
  const previewState = { ...state, overlay: { ...state.overlay, stylePack: selected } };
  return <dialog ref={dialog} className="style-pack-dialog" aria-labelledby="style-pack-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <header><div><h2 id="style-pack-title"><Palette size={20}/>风格包</h2><p>统一管理预设节目的美术，不修改赛事数据与自定义场景。</p></div><button className="button small" aria-label="关闭风格包" disabled={busy} onClick={onClose}><X size={18}/></button></header>
    <div className="style-pack-buses"><span>当前节目：<b>{onAir.name}</b></span><span>待播配置：<b>{active.name}</b></span>{!sameStyle(active, onAir) && <strong>新风格待 TAKE</strong>}</div>
    <div className="style-pack-layout">
      <aside><div className="style-pack-import"><button className="button primary" disabled={!canEdit || busy || loading} onClick={() => fileInput.current?.click()}><Upload size={15}/>{busy ? '处理中…' : '导入风格包'}</button><input ref={fileInput} type="file" accept=".zip,application/zip" aria-label="导入 ZIP 风格包" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void importFile(file); }}/><small>ZIP · 最多 48 MiB</small></div>
        <div className="style-pack-list" aria-label="已安装风格包">{packs.map(pack => <button key={`${pack.id}/${pack.revision}`} className="style-pack-choice" aria-pressed={sameStyle(pack, selected)} disabled={busy} onClick={() => setSelected(pack)}><strong>{pack.name}</strong><span>{pack.builtin ? (sameStyle(pack, BUILTIN_STYLE_REF) ? '内置 · 默认 · ' : '内置 · ') : ''}v{pack.version} · {pack.author || '未署名'}</span><small>{pack.id} · {pack.revision.slice(0, 10)}</small>{sameStyle(pack, active) && <b>待播使用中</b>}</button>)}</div>
        {loading && <p role="status">正在读取已安装风格包…</p>}
      </aside>
      <section className="style-pack-detail"><div className="style-pack-preview-heading"><div><h3>{selectedInfo?.name ?? selected.name}</h3><p>{selectedInfo?.description}</p></div><label>预览节目<select aria-label="风格包预览节目" value={scene} onChange={e => setScene(e.target.value as BuiltinScene)}>{STYLE_SCENES.map(s => <option key={s} value={s}>{sceneInfo[s].name}</option>)}</select></label></div>
        <div className="style-pack-preview"><BroadcastCanvas state={previewState} champions={champions} scene={scene}/></div>
        <p>此处仅查看效果。导入后选择“准备到预监”，再回导播台核对并 TAKE；正在播出的风格保持不变。</p>
        <p>美术制作：导出任一内置风格包，解压后修改清单标识与图片，再将清单和 assets 文件夹压缩为 ZIP 导入。</p>
        {scene === 'teamfight' && <p>团战节目叠加十人状态和中立资源计时，游戏区域保持透明。</p>}
        {!canEdit && <p>导入、删除和切换由当前主导播操作；此席位可查看与导出。</p>}
        <div className="style-pack-delete">
          <button className="button danger" disabled={!canEdit || busy || loading || !selectedInfo || !!deleteBlock} onClick={() => setConfirmDelete(true)}><Trash2 size={15}/>删除风格包</button>
          <small>{deleteBlock ?? '删除当前选中的版本，可重新导入原 ZIP 恢复。需要保留素材时请先导出。'}</small>
          {confirmDelete && !deleteBlock && <div role="group" aria-label="删除风格包确认"><p>确认删除“{selected.name}”的 v{selectedInfo?.version}（{selected.revision.slice(0, 10)}）版本？{selectedInfo?.builtin ? '内置原始素材保留在安装目录，重新导入对应风格包可恢复。' : '该版本的本地清单与贴图将被移除。'}</p><button className="button" disabled={busy} onClick={() => setConfirmDelete(false)}>取消删除</button><button className="button danger" disabled={busy || !canEdit} onClick={() => void removeSelected()}>确认删除</button></div>}
        </div>
        {warnings.map((w, i) => <p className="style-pack-warning" key={i}>{w}</p>)}
        {error && <p className="style-pack-error" role="alert">{error}</p>}
        <footer><a className="button" download href={`/api/style-packs/${selected.id}/${selected.revision}/export`}><Download size={15}/>导出风格包</a><button className="button primary" disabled={!canEdit || busy || !ready || sameStyle(active, selected)} onClick={() => void stage()}>{busy ? '处理中…' : !ready ? '贴图加载中…' : sameStyle(active, selected) ? '已是待播风格' : '准备到预监'}</button></footer>
      </section>
    </div>
  </dialog>;
}
