import { useState } from "react";
import { Image, Search, Upload } from "lucide-react";
import type { StateContext } from "../../shared/types";
import { programState } from "../../shared/production";
import { playerFeedPairs } from "../../shared/player-feeds";
import "./asset-workspace.css";

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
  for (const scene of state.customScenes ?? [])
    if (
      scene.sources.some(
        (s) =>
          s.kind === "image" &&
          state.assets.find((a) => a.id === s.assetId)?.url === url,
      )
    )
      names.push(`场景：${scene.name}`);
  return names;
}
export function AssetLibrary({
  state,
  notify,
  disabled = false,
}: Pick<StateContext, "state" | "notify"> & { disabled?: boolean }) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<keyof typeof categories>("other"),
    [filter, setFilter] = useState("all");
  const [progress, setProgress] = useState<number | null>(null),
    [current, setCurrent] = useState(""),
    [selectedId, setSelectedId] = useState("");
  const [focus, setFocus] = useState({ x: 50, y: 35 }),
    [failures, setFailures] = useState<string[]>([]),
    [retry, setRetry] = useState<File[]>([]);
  async function upload(files: File[]) {
    if (disabled || progress !== null || !files.length) return;
    const errors: string[] = [],
      failed: File[] = [];
    setProgress(0);
    setFailures([]);
    setRetry([]);
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
          errors.push(`${file.name}：格式不支持或超过 8 MB`);
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
                reject(Error(message));
              }
            };
            xhr.onerror = () =>
              reject(Error("连接中断；请先核对素材列表是否已接收"));
            xhr.timeout = 120000;
            xhr.ontimeout = () =>
              reject(Error("上传超时；请先核对素材列表是否已接收"));
            xhr.send(body);
          });
        } catch (e) {
          errors.push(
            `${file.name}：${e instanceof Error ? e.message : "上传失败"}`,
          );
          failed.push(file);
        }
      }
      setFailures(errors);
      setRetry(failed);
      notify(
        errors.length
          ? `${files.length - errors.length} 张已导入。请检查失败项。`
          : `${files.length} 张图片已导入素材库`,
        errors.length ? "error" : "success",
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
  const selected = assets.find((a) => a.id === selectedId) ?? assets[0],
    onAir = programState(state);
  return (
    <section className="asset-workspace" aria-label="本地图片素材">
      <header className="asset-workspace-toolbar">
        <label className="domain-search">
          <Search size={15} />
          <input
            aria-label="搜索图片素材"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文件名"
          />
        </label>
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
        <span>{assets.length} 张</span>
        <label>
          导入分类
          <select
            value={category}
            disabled={progress !== null}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          >
            {Object.entries(categories).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="button asset-upload-button">
          <Upload size={15} />
          {progress === null ? "批量导入图片" : "正在导入…"}
          <input
            aria-label="批量导入图片"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={disabled || progress !== null}
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
      </header>
      {progress !== null && (
        <div className="asset-transfer" role="status">
          <span>{current}</span>
          <progress max={100} value={progress} />
          <small>上传传输进度；文件仍须通过服务器校验。</small>
        </div>
      )}
      {!!failures.length && (
        <div className="domain-note error" role="alert">
          {failures.map((message) => (
            <p key={message}>{message}</p>
          ))}
          {!!retry.length && (
            <>
              <p>
                先在列表核对文件是否已经收到，确认未收到后再重试，避免重复导入。
              </p>
              <button
                className="button small"
                disabled={disabled || progress !== null}
                onClick={() => void upload(retry)}
              >
                核对后重试失败文件
              </button>
            </>
          )}
        </div>
      )}
      <div className="asset-workspace-stage">
        <div className="asset-list domain-scroll">
          {assets.map((asset) => (
            <button
              className="asset-object"
              key={asset.id}
              aria-pressed={asset.id === selected?.id}
              onClick={() => {
                setSelectedId(asset.id);
                setFocus({ x: 50, y: 35 });
              }}
            >
              <img src={asset.url} alt="" loading="lazy" />
              <span>
                <strong>{asset.name}</strong>
                <small>
                  {categories[asset.category ?? "other"]} ·{" "}
                  {asset.width && asset.height
                    ? `${asset.width} × ${asset.height}`
                    : "尺寸未提供"}
                </small>
                <small>
                  {references(state, asset.url).length} 项待播引用 /{" "}
                  {references(onAir, asset.url).length} 项节目引用
                </small>
              </span>
            </button>
          ))}
          {!assets.length && (
            <div className="domain-empty">
              <Image size={30} />
              <strong>
                {state.assets.length ? "没有匹配的素材" : "导入比赛素材"}
              </strong>
              <p>
                PNG、JPEG、WebP、GIF；单张上限 8
                MB。队标、人物与赞助商图片按实际授权导入。
              </p>
            </div>
          )}
        </div>
        <aside
          className="asset-review domain-scroll"
          aria-label="素材构图与引用"
        >
          {selected ? (
            <>
              <header>
                <h2>{selected.name}</h2>
                <span>
                  {selected.width && selected.height
                    ? `${selected.width} × ${selected.height} · ${(selected.width / selected.height).toFixed(2)}:1`
                    : "旧素材，打开文件核对尺寸"}
                </span>
              </header>
              <div className="asset-crops">
                <figure>
                  <img src={selected.url} alt="完整素材" />
                  <figcaption>完整素材 · 棋盘格检查透明</figcaption>
                </figure>
                <figure>
                  <img
                    src={selected.url}
                    alt="选手竖幅裁切预览"
                    style={{ objectPosition: `${focus.x}% ${focus.y}%` }}
                  />
                  <figcaption>人物竖幅裁切预览</figcaption>
                </figure>
              </div>
              <label>
                水平焦点 {focus.x}%
                <input
                  type="range"
                  min={0}
                  max={100}
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
                  min={0}
                  max={100}
                  value={focus.y}
                  onChange={(e) =>
                    setFocus({ ...focus, y: Number(e.target.value) })
                  }
                />
              </label>
              <p>
                这里只检查构图。照片焦点在选手画面设置保存，队标使用完整图片。
              </p>
              <dl className="domain-facts">
                <div>
                  <dt>待播引用</dt>
                  <dd>
                    {references(state, selected.url).join("、") || "尚未引用"}
                  </dd>
                </div>
                <div>
                  <dt>节目引用</dt>
                  <dd>
                    {references(onAir, selected.url).join("、") || "尚未引用"}
                  </dd>
                </div>
              </dl>
              <a
                className="button small"
                href={selected.url}
                target="_blank"
                rel="noreferrer"
              >
                打开原始素材
              </a>
              <small>
                上传文件保存在本机；取消选择或移除场景图层不会删除素材。
              </small>
            </>
          ) : (
            <div className="domain-empty">
              选择素材后检查尺寸、透明区域、裁切和节目引用。
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
