import { useState } from "react";
import type { BroadcastState, Champion, Scene, CustomScene, StateContext } from "../../shared/types";
import { sceneDetails, sceneInfo } from "../lib";
import { Plus } from "lucide-react";
import { CustomSceneEditor } from "./CustomSceneEditor";
import { TaskTabs } from "./ConsoleUI";
import { SceneCard } from "./SceneCard";
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
} & Pick<StateContext, 'send' | 'notify' | 'seat'>) {
  const [editor, setEditor] = useState<CustomScene | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CustomScene | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = !props.seat || props.seat.role === 'director' && (!props.state.production?.control || props.state.production.control.owner === props.seat.id);
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
  return (
    <section className="scene-library panel" aria-label="场景库">
      <div className="scene-library-heading">
        <h2>场景库</h2>
        <TaskTabs
          items={groups}
          value={group}
          onChange={setGroup}
          label="场景阶段"
        />
        <small>选择预监后，核对并切入</small>
        <button className="button small primary" disabled={!canEdit} onClick={() => setEditor('new')}><Plus size={15} />新建自定义场景</button>
      </div>
      {editor && <CustomSceneEditor {...props} initial={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}
      {deleting && <div className="custom-delete-prompt" role="alert"><span>删除「{deleting.name}」？已上传素材会保留。</span><button className="button small" disabled={busy} onClick={() => setDeleting(null)}>取消</button><button className="button small" disabled={busy} onClick={async () => { setBusy(true); try { await props.send({ type: 'delete-custom-scene', id: deleting.id }); setDeleting(null); props.notify('自定义场景已删除'); } catch { /* send reports failure */ } finally { setBusy(false); } }}>确认删除</button></div>}
      <div className="scene-library-grid">
        {scenes.map((scene, index) => (
          <div className="scene-library-item" key={scene}>
            <SceneCard {...props} scene={scene} />
            <div className="scene-library-tools">
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
                  disabled={index === 0}
                  aria-label={`前移 ${sceneDetails(props.state,scene).name}`}
                  onClick={() => {
                    const next = favorites.filter(s => allScenes.includes(s));
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
              {scene.startsWith('custom:') && <><button className="custom-scene-edit" disabled={!canEdit} aria-label={`编辑 ${sceneDetails(props.state,scene).name}`} onClick={() => setEditor(custom.find(s => s.id === scene)!)}>编辑</button><button disabled={!canEdit || props.state.programScene === scene} title={props.state.programScene === scene ? '请先切入其他节目场景' : '删除场景'} aria-label={`删除 ${sceneDetails(props.state,scene).name}`} onClick={() => setDeleting(custom.find(s => s.id === scene)!)}>删除</button></>}
            </div>
          </div>
        ))}
      </div>
      {!scenes.length && <p className="muted" style={{ padding: '0 20px 16px' }}>{group === 'custom' ? '还没有自定义场景，点击「新建自定义场景」添加图片或应用窗口。' : '此分组暂无场景。'}</p>}
    </section>
  );
}
