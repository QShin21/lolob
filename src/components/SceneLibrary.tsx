import { StylePackManager } from './StylePackManager';
import { styleRef } from '../../shared/style-packs';
import {PostgamePageControl} from './PostgamePageControl';
import { useRef, useState } from "react";
import type { BroadcastState, Champion, Scene, CustomScene, StateContext } from "../../shared/types";
import { sceneDetails, sceneInfo } from "../lib";
import { Palette, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { CustomSceneEditor } from "./CustomSceneEditor";
import { TaskTabs } from "./ConsoleUI";
import { SceneCard } from "./SceneCard";
import { customSceneFacts } from './custom-scene-status';
const groups = [
  { id: "all", label: "全部" },
  { id: "favorites", label: "常用" },
  { id: "custom", label: "自定义" },
  { id: "pregame", label: "赛前 / BP" },
  { id: "live", label: "局内" },
  { id: "postgame", label: "赛后" },
] as const;
const phases: Record<string, Scene[]> = {
  pregame: ["standby", "draft", "lineup", "schedule"],
  live: ["live", "teamfight", "gold-ranking", "economy", "ranking"],
  postgame: ["postgame", "interview"],
};
export function SceneLibrary(props: {
  state: BroadcastState;
  sampledState: BroadcastState;
  champions: Champion[];
  onSelect: (scene: Scene) => void;
} & Pick<StateContext, 'send' | 'notify' | 'seat' | 'connected'>) {
  const [styleManager, setStyleManager] = useState(false);
  const [editor, setEditor] = useState<CustomScene | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CustomScene | null>(null);
  const [busy, setBusy] = useState(false);
  const deletingActive = useRef(false);
  const [deleteError, setDeleteError] = useState('');
  const canEdit = props.connected !== false && !!props.seat && props.seat.role === 'director' && props.state.production?.control?.owner === props.seat.id;
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<(typeof groups)[number]["id"]>("all");
  const [favorites, setFavorites] = useState<Scene[]>(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("riftcast-favorite-scenes") ?? "null",
      );
      return Array.isArray(stored)
        ? stored.filter((s) => typeof s === 'string' && (s in sceneInfo || s.startsWith('custom:')))
        : ["live", "teamfight", "draft", "gold-ranking"];
    } catch {
      return ["live", "teamfight", "draft", "gold-ranking"];
    }
  });
  const save = (next: Scene[]) => {
    setFavorites(next);
    try { localStorage.setItem("riftcast-favorite-scenes", JSON.stringify(next)); } catch { props.notify('浏览器未允许保存常用场景，下次打开可能恢复默认', 'warning'); }
  };
  const custom = props.state.customScenes ?? [];
  const allScenes = [...Object.keys(sceneInfo) as Scene[], ...custom.map(s => s.id)];
  const scenes =
    group === "favorites"
      ? favorites.filter(s => allScenes.includes(s))
      : group === "all"
        ? allScenes
        : group === 'custom' ? custom.map(s => s.id) : phases[group];
  const visibleScenes = scenes.filter(scene => sceneDetails(props.state, scene).name.toLowerCase().includes(query.trim().toLowerCase()));
  const deleteReason = deleting ? customSceneFacts(deleting, props.state).deleteReason : '';
  return (
    <section className="scene-bank" aria-label="场景库">
      <div className="scene-bank-heading">
        <h2>场景库</h2>
        <label className="scene-bank-search"><Search size={13}/><input aria-label="搜索场景" placeholder="搜索场景" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <TaskTabs
          items={groups}
          value={group}
          onChange={setGroup}
          label="场景阶段"
        />

        <button className="button small" title={`待播风格：${styleRef(props.state.overlay.stylePack).name}`} onClick={() => setStyleManager(true)}><Palette size={15}/>风格包</button>
        <button className="button small primary" disabled={!canEdit || custom.length >= 50} title={custom.length >= 50 ? '最多 50 个自定义场景' : !canEdit ? '由当前主导播编辑' : '新建自定义场景'} onClick={() => setEditor('new')}><Plus size={15} />新建场景</button>
      </div>
      {styleManager && <StylePackManager {...props} onClose={() => setStyleManager(false)}/>}
      {editor && <CustomSceneEditor {...props} initial={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}
      {deleting && <div className="custom-delete-prompt" role="alert"><span><strong>{deleteReason || `删除「${deleting.name}」？`}</strong><small>已上传素材和借用的 OBS 输入都会保留。</small>{deleteError && <small>{deleteError}</small>}</span><button className="button small" disabled={busy} onClick={() => setDeleting(null)}>取消</button><button className="button small" disabled={busy || !canEdit || !!deleteReason} onClick={async () => { if (deletingActive.current || deleteReason || !canEdit) return; deletingActive.current = true; setBusy(true); setDeleteError(''); try { await props.send({ type: 'delete-custom-scene', id: deleting.id }); setDeleting(null); props.notify('自定义场景已删除'); } catch (e) { setDeleteError(e instanceof Error ? e.message : '删除未完成，请核对引用与权限后重试'); } finally { deletingActive.current = false; setBusy(false); } }}>确认删除</button></div>}
      <PostgamePageControl state={props.state} send={props.send} />
<div className="scene-bank-grid">
        {visibleScenes.map((scene, index) => (
          <div className="scene-bank-item" key={scene}>
            <SceneCard {...props} scene={scene} />
            <div className="scene-bank-tools">
              <button
                aria-label={`${favorites.includes(scene) ? "取消常用" : "设为常用"} ${sceneDetails(props.state,scene).name}`}
                aria-pressed={favorites.includes(scene)}
                onClick={() =>
                  save(
                    favorites.includes(scene)
                      ? favorites.filter((s) => s !== scene)
                      : [...favorites, scene],
                  )
                }
              >
                {favorites.includes(scene) ? "★" : "☆"}
              </button>
              {group === "favorites" && (
                <button
                  disabled={favorites.filter(s => allScenes.includes(s)).indexOf(scene) === 0}
                  aria-label={`前移 ${sceneDetails(props.state,scene).name}`}
                  onClick={() => {
                    const next = favorites.filter(s => allScenes.includes(s));
                    const index = next.indexOf(scene);
                    [next[index - 1], next[index]] = [
                      next[index],
                      next[index - 1],
                    ];
                    save(next);
                  }}
                >
                  ←
                </button>
              )}
              {scene.startsWith('custom:') && <><button className="custom-scene-edit" disabled={!canEdit} title="编辑场景" aria-label={`编辑 ${sceneDetails(props.state,scene).name}`} onClick={() => setEditor(custom.find(s => s.id === scene)!)}><Pencil size={13}/></button><button disabled={!canEdit} title={customSceneFacts(custom.find(s => s.id === scene)!, props.state).deleteReason || '删除场景'} aria-label={`删除 ${sceneDetails(props.state,scene).name}`} onClick={() => { setDeleteError(''); setDeleting(custom.find(s => s.id === scene)!); }}><Trash2 size={13}/></button></>}
            </div>
          </div>
        ))}
      </div>
      {!visibleScenes.length && <p className="muted" style={{ padding: '0 20px 16px' }}>{group === 'custom' ? '还没有自定义场景，点击「新建场景」添加图片或应用窗口。' : query ? '没有匹配的场景，试试其他名称。' : '此分组暂无场景。'}</p>}
      <div className="scene-bank-note"><span>单击只准备预监，核对后切入节目</span><span>{allScenes.length} 个场景 · {custom.length} / 50 自定义</span></div>
    </section>
  );
}
