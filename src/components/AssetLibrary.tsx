import { useEffect, useRef, useState } from "react";
import type { Asset, StateContext } from "../../shared/types";
import { programState } from "../../shared/production";
import { playerFeedPairs } from "../../shared/player-feeds";
const categories = {
  logo: "队标",
  player: "选手照片",
  sponsor: "赞助商",
  other: "其他",
};
function references(state: StateContext["state"], url: string) {
  const names: string[] = [];
  for (const t of state.teams) {
    if (t.logo === url) names.push(`${t.tag} 队标`);
    for (const p of t.players)
      if (p.portrait === url) names.push(`${p.name} 照片`);
  }
  if (state.overlay.sponsorLogo === url) names.push("赞助商");
  playerFeedPairs(state.overlay).forEach((pair, i) =>
    Object.entries(pair).forEach(([side, f]) => {
      if (f.imageUrl === url)
        names.push(`${side === "blue" ? "蓝" : "红"}方 ${i + 1} 号画面`);
    }),
  );
  return names;
}
export function AssetLibrary({
  state,
  notify,
}: Pick<StateContext, "state" | "notify">) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<keyof typeof categories>("other"),
    [filter, setFilter] = useState("all"),
    [progress, setProgress] = useState<number | null>(null),
    [current, setCurrent] = useState(""),
    [selected, setSelected] = useState<Asset>(),
    [focus, setFocus] = useState({ x: 50, y: 35 });
  const inspector = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) {
      inspector.current?.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      inspector.current?.focus({ preventScroll: true });
    }
  }, [selected?.id]);
  async function upload(files: File[]) {
    const failures: string[] = [];
    setProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrent(`${i + 1}/${files.length} · ${file.name}`);
        if (
          file.size > 8 * 1024 * 1024 ||
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            file.type,
          )
        ) {
          failures.push(`${file.name}：格式不支持或超过 8 MB`);
          continue;
        }
        try {
          await new Promise<void>((resolve, reject) => {
            const body = new FormData();
            body.append("file", file);
            body.append("category", category);
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/assets");
            const token =
                new URLSearchParams(location.search).get("token") ||
                sessionStorage.getItem("riftcast-control-token"),
              seat = sessionStorage.getItem("riftcast-seat-token");
            if (token) xhr.setRequestHeader("X-Control-Token", token);
            if (seat) xhr.setRequestHeader("X-Seat-Token", seat);
            xhr.upload.onprogress = (e) =>
              setProgress(
                Math.round(
                  ((i + (e.lengthComputable ? e.loaded / e.total : 0)) /
                    files.length) *
                    100,
                ),
              );
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else {
                let message = "上传失败";
                try {
                  message = JSON.parse(xhr.responseText).error ?? message;
                } catch {}
                reject(new Error(message));
              }
            };
            xhr.onerror = () => reject(new Error("连接中断"));
            xhr.timeout = 120000;
            xhr.ontimeout = () => reject(new Error("上传超时"));
            xhr.send(body);
          });
        } catch (e) {
          failures.push(
            `${file.name}：${e instanceof Error ? e.message : "上传失败"}`,
          );
        }
      }
      notify(
        failures.length
          ? `${files.length - failures.length} 张已导入。${failures.join("；")}`
          : `${files.length} 张图片已导入素材库`,
        failures.length ? "error" : "success",
      );
    } finally {
      setProgress(null);
      setCurrent("");
    }
  }
  const assets = state.assets.filter(
    (a) =>
      (filter === "all" || (a.category ?? "other") === filter) &&
      a.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="panel asset-library">
      <div className="panel-head">
        <h2>本地图片素材</h2>
        <span className="badge">{assets.length} 张</span>
      </div>
      <div className="asset-toolbar">
        <input
          aria-label="搜索图片素材"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索文件名"
        />
        <select
          aria-label="素材分类筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">全部分类</option>
          {Object.entries(categories).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <label>
          导入分类{" "}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          >
            {Object.entries(categories).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="button primary">
          批量导入图片
          <input
            aria-label="批量导入图片"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={progress !== null}
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {progress !== null && (
        <div role="status">
          <p>{current}</p>
          <progress
            className="asset-upload-progress"
            max="100"
            value={progress}
          />
        </div>
      )}
      {!assets.length && (
        <div className="empty-state">
          上传队标、选手照片或赞助商图片。支持 PNG / JPEG / WebP / GIF，单张最大
          8 MB。
        </div>
      )}
      <div className="asset-browser-grid">
        {assets.map((asset) => (
          <article className="asset-browser-card" key={asset.id}>
            <img src={asset.url} alt={asset.name} loading="lazy" />
            <strong>{asset.name}</strong>
            <small className="asset-dimensions">
              {categories[asset.category ?? "other"]} ·{" "}
              {asset.width && asset.height
                ? `${asset.width} × ${asset.height} · ${(asset.width / asset.height).toFixed(2)}:1`
                : "旧素材 · 打开检查尺寸"}
            </small>
            <small>
              待播引用：{references(state, asset.url).join("、") || "尚未引用"}
            </small>
            <small>
              节目引用：
              {references(programState(state), asset.url).join("、") ||
                "尚未引用"}
            </small>
            <button
              className="button small"
              onClick={() => {
                setSelected(asset);
                setFocus({ x: 50, y: 35 });
              }}
            >
              检查构图与透明区域
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <div className="asset-inspector" ref={inspector} tabIndex={-1}>
          <h3>{selected.name} · 构图预览</h3>
          <p>
            棋盘格显示透明区域；照片在选手画面设置中保存焦点，队标使用完整图片。
          </p>
          <div className="crop-comparison">
            <img
              src={selected.url}
              alt="完整素材"
              style={{
                objectFit: "contain",
                background:
                  "repeating-conic-gradient(#314349 0% 25%,#223339 0% 50%) 0/18px 18px",
              }}
            />
            <img
              src={selected.url}
              alt="选手竖幅裁切预览"
              style={{ objectPosition: `${focus.x}% ${focus.y}%` }}
            />
          </div>
          <label>
            水平焦点 {focus.x}%
            <input
              type="range"
              min="0"
              max="100"
              value={focus.x}
              onChange={(e) =>
                setFocus({ ...focus, x: Number(e.target.value) })
              }
            />
          </label>
          <label>
            垂直焦点 {focus.y}%
            <input
              type="range"
              min="0"
              max="100"
              value={focus.y}
              onChange={(e) =>
                setFocus({ ...focus, y: Number(e.target.value) })
              }
            />
          </label>
          <button className="button" onClick={() => setSelected(undefined)}>
            关闭检查
          </button>
        </div>
      )}
    </section>
  );
}
