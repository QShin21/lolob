import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import type { BroadcastState, Champion, BuiltinScene } from '../../shared/types';
import { APPEARANCE_TARGETS, TEXT_APPEARANCE_TARGETS, STYLE_TEXT_FIELDS, validateStyleText, mergeAppearance, commitEditorHistory, stepEditorHistory, snapAppearanceRect, type EditorHistory, type ElementAppearance } from '../../shared/style-appearance';
import { ArchiveGraphics } from './ArchiveGraphics';
import { archiveGraphicLabels, archiveGraphicModes, graphicArchives, type ArchiveGraphicMode } from '../../shared/archive-graphics';
import { STYLE_SCENES, type RuntimeStylePack, type StylePackRef, type StylePackSummary } from '../../shared/style-packs';
import { api, sceneInfo } from '../lib';
import { BroadcastCanvas } from './BroadcastCanvas';
import { loadStylePack, StylePackPreviewProvider } from './useStylePack';
import './style-editor.css';

type Target = keyof typeof APPEARANCE_TARGETS;
const labels: Record<Target, string> = {
  lineupName: '阵容 · 选手名字', lineupCardBlue: '阵容 · 蓝方卡片', lineupCardRed: '阵容 · 红方卡片', lineupTeam: '阵容 · 队名', lineupScoreBlue: '阵容 · 蓝方局分', lineupScoreRed: '阵容 · 红方局分', lineupGame: '阵容 · 局号', lineupCaption: '阵容 · 标题', lineupFooter: '阵容 · 页脚',
  draftName: 'BP · 选手名字', draftTeam: 'BP · 队名', draftTimer: 'BP · 计时', liveName: '局内 · 选手名字', liveNameplate: '局内 · 选手画面名字', liveScoreboard: '局内 · 十人计分板',
  reportName: '赛后 · 选手名字', reportKda: '赛后 · KDA', reportHeadingBlue: '赛后 · 蓝方列标题', reportHeadingRed: '赛后 · 红方列标题', reportTeam: '赛后 · 队名', reportGame: '赛后 · 局号', reportCaption: '赛后 · 标题', reportMetric: '赛后 · 队伍统计', reportGoldLabel: '赛后 · 金币/伤害值',
  scheduleTeam: '赛程 · 队名', scheduleScore: '赛程 · 比分', scheduleTime: '赛程 · 时间', countdownNumber: '待机 · 倒计时', countdownMessage: '待机 · 文案', interviewName: '采访 · 姓名', ticker: '滚动字幕', analysisHeading: '分析 · 标题',
  analysisPanel: '分析 · 面板', analysisName: '分析 · 选手名字', analysisValue: '分析 · 数值', globalScoreboard: '局内 · 完整顶部比分', eventAnnouncement: '事件 · 公告', lFrameRoster: 'L 形 · 左侧选手', lFrameFooter: 'L 形 · 底栏',
  reportChampion:'赛后 · 英雄文字', inhibitorLabel:'水晶 · 名称', inhibitorTime:'水晶 · 计时', championTabName:'边栏 · 选手英雄', lFrameName:'L 形 · 选手姓名', fearlessLane:'Fearless · 分路', fearlessChampion:'Fearless · 英雄', patchText:'局内 · 版本文字',
};
type Rect = { left: number; top: number; width: number; height: number };
const fonts = [['default', '默认'], ['modern', '现代无衬线'], ['serif', '衬线']] as const;
export function StyleEditor({ state, champions, base, initialScene, disabled, onSaved, onClose }: { state: BroadcastState; champions: Champion[]; base: StylePackRef; initialScene: BuiltinScene; disabled: boolean; onSaved: (pack: StylePackSummary) => void; onClose: () => void }) {
  const [history, setHistory] = useState<EditorHistory<RuntimeStylePack> | null>(null), [original, setOriginal] = useState<RuntimeStylePack | null>(null);
  const draft = history?.present ?? null;
  const editGroup = useRef<string | undefined>(undefined), sequence = useRef(0);
  const [snapping, setSnapping] = useState(true), [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [scene, setScene] = useState(initialScene), [target, setTarget] = useState<Target>('liveName'), [scope, setScope] = useState<'scene' | 'all'>('scene');
  const [archiveMode,setArchiveMode]=useState<ArchiveGraphicMode|'none'>('none');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [rects, setRects] = useState<Rect[]>([]), [present, setPresent] = useState<Target[]>([]);
  const host = useRef<HTMLDivElement>(null), drag = useRef<{ pointer: number; x: number; y: number; before: ElementAppearance; target: Target; scale: number; rect: Rect; peers: Rect[]; group: string } | null>(null);
  useEffect(() => { let alive = true; void loadStylePack(base).then(pack => { if (alive) { const copy = structuredClone(pack); setOriginal(copy); setHistory({ past: [], present: { ...copy, name: pack.builtin ? `${pack.name} · 自定义` : pack.name }, future: [] }); } }).catch(e => alive && setError(e.message)); return () => { alive = false; }; }, [base.id, base.revision]);
  function setDraft(next: RuntimeStylePack | null | ((current: RuntimeStylePack | null) => RuntimeStylePack | null), group = editGroup.current) {
    setHistory(current => { if (!current) return current; const value = typeof next === 'function' ? next(current.present) : next; return value ? commitEditorHistory(current, value, group) : current; });
  }
  function step(direction: 'undo' | 'redo') { if (disabled || busy) return; drag.current = null; setGuides({}); editGroup.current = undefined; setHistory(current => current && stepEditorHistory(current, direction)); }
  const appearance = draft ? mergeAppearance(draft.appearance, draft.scenes[scene].appearance) : {};
  const props = appearance[target] ?? {};
  const local = draft ? (scope === 'all' ? draft.appearance : draft.scenes[scene].appearance)?.[target] ?? {} : {};
  let textError = ''; try { if (props.text !== undefined) validateStyleText(props.text); } catch (error) { textError = error instanceof Error ? error.message : '文字模板无效'; }
  function patchTarget(selected: Target, change: Partial<ElementAppearance>, group = editGroup.current) {
    setDraft(current => {
      if (!current) return current;
      const next = structuredClone(current), bucket = scope === 'all' ? next : next.scenes[scene];
      const nextProps = { ...bucket.appearance?.[selected], ...change };
      for (const key of Object.keys(nextProps) as (keyof ElementAppearance)[]) if (nextProps[key] === undefined) delete nextProps[key];
      bucket.appearance = { ...bucket.appearance, [selected]: nextProps };
      return next;
    }, group);
  }
  function clearTarget() {
    setDraft(current => { if (!current) return current; const next = structuredClone(current), bucket = scope === 'all' ? next : next.scenes[scene]; if (bucket.appearance) delete bucket.appearance[target]; return next; });
  }
  useLayoutEffect(() => {
    const root = host.current; if (!root) return;
    const measure = () => {
      const container = root.getBoundingClientRect();
      setRects([...root.querySelectorAll(APPEARANCE_TARGETS[target])].map(node => { const r = node.getBoundingClientRect(); return { left: r.left - container.left, top: r.top - container.top, width: r.width, height: r.height }; }).filter(r => r.width > 0 && r.height > 0));
      setPresent((Object.keys(APPEARANCE_TARGETS) as Target[]).filter(key => root.querySelector(APPEARANCE_TARGETS[key])));
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(root);
    const timer = window.setTimeout(measure, 300);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [draft, scene, target, archiveMode]);
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (disabled || busy || !draft || !(event.target instanceof Element)) return;
    const path: Element[] = []; let node: Element | null = event.target;
    while (node && node !== host.current) { path.push(node); node = node.parentElement; }
    const selectedNode = path.find(n => (Object.keys(APPEARANCE_TARGETS) as Target[]).some(key => n.matches(APPEARANCE_TARGETS[key])));
    const selected = selectedNode && (Object.keys(APPEARANCE_TARGETS) as Target[]).find(key => selectedNode.matches(APPEARANCE_TARGETS[key]));
    if (!selected) return;
    event.preventDefault(); setTarget(selected); event.currentTarget.setPointerCapture(event.pointerId);
    const canvas = event.currentTarget.querySelector('.cast-canvas')?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect(), scale = 1920 / canvas.width;
    const logicalRect = (node: Element) => { const r = node.getBoundingClientRect(); return { left: (r.left - canvas.left) * scale, top: (r.top - canvas.top) * scale, width: r.width * scale, height: r.height * scale }; };
    const peers = [...new Set(Object.values(APPEARANCE_TARGETS).flatMap(selector => [...event.currentTarget.querySelectorAll(selector)]))]
      .filter(node => !node.matches(APPEARANCE_TARGETS[selected]) && !selectedNode!.contains(node) && !node.contains(selectedNode!)).map(logicalRect).filter(r => r.width > 0 && r.height > 0);
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, before: appearance[selected] ?? {}, target: selected, scale, rect: logicalRect(selectedNode!), peers, group: `drag:${++sequence.current}` };
  }
  const dirty = !!draft && !!original && JSON.stringify(draft) !== JSON.stringify(original);
  async function save() {
    if (!draft || busy || disabled || !draft.name.trim()) return;
    setBusy(true); setError('');
    try {
      const value = await api<StylePackSummary>(`/api/style-packs/${base.id}/${base.revision}/derive`, { method: 'POST', body: JSON.stringify({ name: draft.name, palette: draft.palette, fonts: draft.fonts, appearance: draft.appearance ?? {}, scenes: draft.scenes }) });
      onSaved(value);
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); }
    finally { setBusy(false); }
  }
  if (!draft) return <div className="style-editor-loading"><p>{error || '正在读取风格与贴图…'}</p><button className="button" onClick={onClose}>返回风格包</button></div>;
  return <section className="style-editor" aria-label="可视化风格编辑器" onFocusCapture={() => { editGroup.current = `field:${++sequence.current}`; }} onBlurCapture={() => { editGroup.current = undefined; }} onKeyDown={event => {
    const editing = event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]');
    if (editing || event.repeat || event.altKey || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase(); if (key !== 'z' && key !== 'y') return;
    event.preventDefault(); event.stopPropagation(); step(key === 'y' || event.shiftKey ? 'redo' : 'undo');
  }}>
    <header className="se-toolbar"><button type="button" className="button small" disabled={busy} onClick={onClose}>返回风格包</button><label>风格名称<input aria-label="编辑风格名称" value={draft.name} maxLength={80} disabled={disabled || busy} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label>预览场景<select aria-label="预览场景" value={scene} onChange={e => setScene(e.target.value as BuiltinScene)}>{STYLE_SCENES.filter(s => s !== 'teamfight').map(s => <option key={s} value={s}>{sceneInfo[s].name}</option>)}</select></label><button type="button" className="button primary" disabled={disabled || busy || !dirty || !draft.name.trim()} onClick={() => void save()}>{busy ? '保存中…' : '保存新版本'}</button></header>
    <div className="se-edit-actions"><button className="button small" disabled={disabled || busy || !history?.past.length} onClick={() => step('undo')}>撤销</button><button className="button small" disabled={disabled || busy || !history?.future.length} onClick={() => step('redo')}>重做</button><label><input type="checkbox" checked={snapping} onChange={event => setSnapping(event.target.checked)}/>吸附参考线</label><span>Ctrl+Z 撤销 · Ctrl+Y 重做 · 拖动时按 Alt 临时关闭吸附</span></div>
    {error && <p className="se-error" role="alert">{error}</p>}
    {scene==='postgame'&&<label>赛后预览内容<select aria-label="赛后预览内容" value={archiveMode} onChange={e=>setArchiveMode(e.target.value as ArchiveGraphicMode|'none')}><option value="none">当前赛后报告</option>{archiveGraphicModes.map(mode=><option key={mode} value={mode}>{archiveGraphicLabels[mode]}</option>)}</select>{!graphicArchives(state).length&&<span>归档图形需要已保存的有效比赛数据。</span>}</label>}
    <div className="se-layout"><aside className="se-tree" aria-label="风格图层树"><h3>当前场景图层</h3>{(Object.keys(APPEARANCE_TARGETS) as Target[]).filter(key => present.includes(key)).map(key => <button type="button" key={key} aria-pressed={target === key} onClick={() => setTarget(key)}>{labels[key]}</button>)}{!present.length && <p>当前场景等待数据。可切换场景后选择图层。</p>}<details><summary>全部可编辑元素</summary>{(Object.keys(APPEARANCE_TARGETS) as Target[]).map(key => <button type="button" key={key} aria-pressed={target === key} onClick={() => setTarget(key)}>{labels[key]}</button>)}</details></aside>
      <div className="se-canvas-column"><div ref={host} className="se-preview" onPointerDown={begin} onPointerMove={e => { const g = drag.current; if (!g || g.pointer !== e.pointerId || disabled || busy) return; const dx = (e.clientX - g.x) * g.scale, dy = (e.clientY - g.y) * g.scale; const snapped = snapping && !e.altKey ? snapAppearanceRect(g.rect, dx, dy, g.peers, 6 * g.scale) : { dx, dy, guides: {} }; setGuides(snapped.guides); patchTarget(g.target, { x: Math.max(-1920, Math.min(1920, Math.round((g.before.x ?? 0) + snapped.dx))), y: Math.max(-1080, Math.min(1080, Math.round((g.before.y ?? 0) + snapped.dy))) }, g.group); }} onPointerUp={() => { drag.current = null; setGuides({}); }} onPointerCancel={() => { drag.current = null; setGuides({}); }} onLostPointerCapture={() => { drag.current = null; setGuides({}); }}>
        <StylePackPreviewProvider value={draft}>{scene==='postgame'&&archiveMode!=='none'?<ArchiveGraphics state={state} champions={champions} resultId={graphicArchives(state)[0]?.id??''} mode={archiveMode}/>:<BroadcastCanvas state={state} champions={champions} scene={scene}/>}</StylePackPreviewProvider>
        {rects.map((r, i) => <div key={i} className="se-selection" style={r}/>)}{guides.x !== undefined && <i className="se-guide vertical" style={{ left: `${guides.x / 1920 * 100}%` }}/>} {guides.y !== undefined && <i className="se-guide horizontal" style={{ top: `${guides.y / 1080 * 100}%` }}/>}</div><p>点击画面选中元素，拖动调整位置。同类元素同步变化，保存后可准备到预监。</p>
        <details className="se-global"><summary>整套配色与字体</summary><div className="se-palette">{Object.entries(draft.palette).map(([key, value]) => <label key={key}>{key}<input aria-label={`配色 ${key}`} type="color" value={value.slice(0, 7)} disabled={disabled || busy} onChange={e => setDraft({ ...draft, palette: { ...draft.palette, [key]: e.target.value } })}/></label>)}</div><div className="se-palette">{(['body', 'display'] as const).map(key => <label key={key}>{key === 'body' ? '正文字体' : '标题字体'}<select value={draft.fonts[key]} disabled={disabled || busy} onChange={e => setDraft({ ...draft, fonts: { ...draft.fonts, [key]: e.target.value as 'default' | 'modern' | 'serif' } })}>{fonts.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>)}</div></details>
      </div>
      <aside className="se-properties"><h3>{labels[target]}</h3><label>应用范围<select aria-label="样式应用范围" value={scope} onChange={e => setScope(e.target.value as 'scene' | 'all')}><option value="scene">仅当前场景</option><option value="all">全部使用该元素的场景</option></select></label><fieldset disabled={disabled || busy}>
        {(TEXT_APPEARANCE_TARGETS as readonly string[]).includes(target) && <div className="se-text-editor"><label>文字与动态字段<textarea aria-label="文字与动态字段" value={local.text ?? props.text ?? ''} maxLength={240} placeholder="沿用原文字；输入后覆盖" onChange={event => patchTarget(target, { text: event.target.value })}/></label><label>插入动态字段<select aria-label="插入动态字段" value="" onChange={event => { if (event.target.value) patchTarget(target, { text: `${local.text ?? props.text ?? ''}{{${event.target.value}}}` }); }}><option value="">选择字段…</option>{Object.entries(STYLE_TEXT_FIELDS).map(([key, label]) => <option key={key} value={key}>{label} · {key}</option>)}</select></label><button type="button" className="button small" disabled={local.text === undefined} onClick={() => patchTarget(target, { text: undefined })}>恢复继承文字</button><p>{props.text === undefined ? '沿用原文字。' : '已启用自定义文字。'}当前选手/队伍按所在卡片取值，普通标题使用当前选中的选手；缺少数据时显示空白。</p>{textError && <p role="alert" className="se-error">{textError}</p>}</div>}
        {([['color', '文字颜色'], ['backgroundColor', '背景颜色'], ['borderColor', '边框颜色']] as const).map(([key, label]) => <label key={key}>{label}<input aria-label={label} type="color" value={(props[key] ?? '#ffffff').slice(0, 7)} onChange={e => patchTarget(target, { [key]: e.target.value })}/></label>)}
        <label>字体<select aria-label="元素字体" value={props.font ?? ''} onChange={e => patchTarget(target, { font: e.target.value ? e.target.value as 'default' | 'modern' | 'serif' : undefined })}><option value="">沿用风格</option>{fonts.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        {([['fontSize', '字号（画布百分比）', .5, 8, .1], ['fontWeight', '字重', 100, 900, 100], ['letterSpacing', '字距（em）', -.05, .3, .01], ['x', '横向偏移（px）', -1920, 1920, 1], ['y', '纵向偏移（px）', -1080, 1080, 1], ['scale', '缩放', .25, 4, .05], ['opacity', '透明度', 0, 1, .05]] as const).map(([key, label, min, max, step]) => <label key={key}>{label}<input aria-label={label} type="number" value={local[key] ?? props[key] ?? ''} placeholder={key === 'x' || key === 'y' ? '0' : key === 'scale' || key === 'opacity' ? '1' : '沿用'} min={min} max={max} step={step} onChange={e => { const value = e.target.value; if (value === '') patchTarget(target, { [key]: undefined }); else if (Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max) patchTarget(target, { [key]: Number(value) }); }}/></label>)}
        <button type="button" className="button small" onClick={clearTarget}>恢复此元素的继承样式</button></fieldset><p>保存会建立独立的内容版本。已播风格在下次 TAKE 时更新。</p>
      </aside>
    </div>
  </section>;
}
