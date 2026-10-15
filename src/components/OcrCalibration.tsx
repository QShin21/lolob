import { useEffect, useRef, useState } from "react";
import type { EconomyOcrConfig, EconomyRoi } from "../../shared/types";
const defaultPlayers = { x: 0, y: 0.4, width: 1, height: 0.6 };
export function OcrCalibration({
  config,
  onChange,
}: {
  config: EconomyOcrConfig;
  onChange: (config: EconomyOcrConfig) => void;
}) {
  const [stamp, setStamp] = useState<number | undefined>(undefined),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const frame = useRef<HTMLDivElement>(null),
    drag = useRef<
      | {
          key: "blue" | "red" | "players";
          resize: boolean;
          startX: number;
          startY: number;
          roi: EconomyRoi;
        }
      | undefined
    >(undefined);
  const regions = {
    blue: config.blue,
    red: config.red,
    players: config.players?.region ?? defaultPlayers,
  };
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!stamp) return;
    const controller = new AbortController();
    let objectUrl = "";
    setUrl("");
    void (async () => {
      try {
        const response = await fetch(`/api/obs/game-frame?t=${stamp}`, { signal: controller.signal });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail.error || `游戏采样失败（${response.status}）`);
        }
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('采样接口未返回图片');
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '采样失败');
      }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [stamp]);
  function update(key: keyof typeof regions, roi: EconomyRoi) {
    onChange(
      key === "players"
        ? {
            ...config,
            players: {
              enabled: config.players?.enabled ?? config.enabled,
              region: roi,
            },
          }
        : { ...config, [key]: roi },
    );
  }
  return (
    <div className="ocr-calibration">
      <div className="inline-buttons">
        <button
          className="button"
          onClick={() => {
            setLoaded(false);
            setError("");
            setStamp(Date.now());
          }}
        >
          载入当前游戏采样图
        </button>
        <span>
          {loaded
            ? `画面采集于 ${new Date(stamp!).toLocaleTimeString("zh-CN")}`
            : stamp && !error
              ? "正在读取游戏捕获…"
              : "连接 OBS 并选择游戏窗口，或完整显示游戏供屏幕采样"}
        </span>
      </div>
      <p>
        拖动识别框调整位置，拖动右下角调整大小。校准与 OCR 共用原始游戏采样。OBS 采样失败时尝试可见游戏窗口；请保持游戏窗口完整可见且未被遮挡。
      </p>
      {error && (
        <p role="alert" className="request-error">
          {error}
        </p>
      )}
      <div className="ocr-frame" ref={frame}>
        {url && (
          <img
            src={url}
            alt="OCR 校准用当前游戏捕获"
            onLoad={() => setLoaded(true)}
            onError={() =>
              setError(
                "游戏采样图解码失败，请重新载入。",
              )
            }
          />
        )}{" "}
        {!stamp && <div className="empty-state">载入画面后显示识别框</div>}
        {loaded &&
          (Object.keys(regions) as (keyof typeof regions)[]).map((key) => {
            const roi = regions[key];
            return (
              <div
                key={key}
                className={`ocr-box ${key}`}
                style={{
                  left: `${roi.x * 100}%`,
                  top: `${roi.y * 100}%`,
                  width: `${roi.width * 100}%`,
                  height: `${roi.height * 100}%`,
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = {
                    key,
                    resize: (e.target as HTMLElement).classList.contains(
                      "ocr-handle",
                    ),
                    startX: e.clientX,
                    startY: e.clientY,
                    roi: { ...roi },
                  };
                }}
                onPointerMove={(e) => {
                  const d = drag.current,
                    rect = frame.current?.getBoundingClientRect();
                  if (!d || d.key !== key || !rect) return;
                  const dx = (e.clientX - d.startX) / rect.width,
                    dy = (e.clientY - d.startY) / rect.height;
                  update(
                    key,
                    d.resize
                      ? {
                          ...d.roi,
                          width: Math.max(
                            0.005,
                            Math.min(1 - d.roi.x, d.roi.width + dx),
                          ),
                          height: Math.max(
                            0.005,
                            Math.min(1 - d.roi.y, d.roi.height + dy),
                          ),
                        }
                      : {
                          ...d.roi,
                          x: Math.max(
                            0,
                            Math.min(1 - d.roi.width, d.roi.x + dx),
                          ),
                          y: Math.max(
                            0,
                            Math.min(1 - d.roi.height, d.roi.y + dy),
                          ),
                        },
                  );
                }}
                onPointerUp={() => {
                  drag.current = undefined;
                }}
                onPointerCancel={() => {
                  drag.current = undefined;
                }}
              >
                {key === "blue"
                  ? "蓝方经济"
                  : key === "red"
                    ? "红方经济"
                    : "十人计分板"}
                <i className="ocr-handle" />
              </div>
            );
          })}
      </div>
      {loaded && (
        <div className="ocr-crops">
          {(["blue", "red"] as const).map((key) => (
            <div key={key}>
              <small>{key === "blue" ? "蓝方" : "红方"}区域放大</small>
              <svg
                viewBox={`${regions[key].x * 1000} ${regions[key].y * 562.5} ${regions[key].width * 1000} ${regions[key].height * 562.5}`}
                role="img"
                aria-label={`${key === "blue" ? "蓝方" : "红方"}经济裁切预览`}
              >
                <image
                  href={url}
                  x="0"
                  y="0"
                  width="1000"
                  height="562.5"
                  preserveAspectRatio="none"
                />
              </svg>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
