import { useState } from "react";
import type { BroadcastState, Champion, Scene } from "../../shared/types";
import { sceneInfo } from "../lib";
import { TaskTabs } from "./ConsoleUI";
import { SceneCard } from "./SceneCard";
const groups = [
  { id: "all", label: "全部" },
  { id: "favorites", label: "常用" },
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
}) {
  const [group, setGroup] = useState<(typeof groups)[number]["id"]>("all");
  const [favorites, setFavorites] = useState<Scene[]>(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("riftcast-favorite-scenes") ?? "null",
      );
      return Array.isArray(stored)
        ? stored.filter((s) => s in sceneInfo)
        : ["live", "teamfight", "draft", "gold-ranking"];
    } catch {
      return ["live", "teamfight", "draft", "gold-ranking"];
    }
  });
  const save = (next: Scene[]) => {
    setFavorites(next);
    localStorage.setItem("riftcast-favorite-scenes", JSON.stringify(next));
  };
  const scenes =
    group === "favorites"
      ? favorites
      : group === "all"
        ? (Object.keys(sceneInfo) as Scene[])
        : phases[group];
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
      </div>
      <div className="scene-library-grid">
        {scenes.map((scene, index) => (
          <div className="scene-library-item" key={scene}>
            <SceneCard {...props} scene={scene} />
            <div className="scene-library-tools">
              <button
                aria-label={`${favorites.includes(scene) ? "取消常用" : "设为常用"} ${sceneInfo[scene].name}`}
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
                  aria-label={`前移 ${sceneInfo[scene].name}`}
                  onClick={() => {
                    const next = [...favorites];
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
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
