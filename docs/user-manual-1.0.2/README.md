# RiftCast 1.0.2 图文用户使用手册

- [PDF 阅读与打印](RiftCast-1.0.2-用户使用手册.pdf)
- [离线网页版](RiftCast-1.0.2-用户使用手册.html)

手册共 37 页，包含 26 幅界面及节目示例图。PDF 支持搜索、目录跳转和书签；HTML 内嵌全部图片，可单独复制、双击打开并点击图片放大，不依赖导播服务或网络。

## 内容导航

| 页码 | 内容 |
| --- | --- |
| 3–6 | 快速演练、安装启动、工作台、保存与 TAKE |
| 7–9 | 战队选手、赛事赛程、图片与英雄素材 |
| 10–14 | BP、系列赛禁选、实时数据、经济与资源 OCR |
| 15–20 | 十一种节目、局内画面、风格管理、元素外观、自定义场景 |
| 21–25 | OBS 画面、混音音乐、RTMP、抖音直播伴侣 |
| 26–29 | 录制、游戏录像与精彩片段、字幕包装、协作 |
| 30–32 | 胜方与终局、两页报告、归档、下一局与重赛 |
| 33–36 | 排障、快捷键、开播及收尾检查表、数据维护 |
| 37 | 附录：连接本机 LCU、Live Client 和 Replay API |

## 内容基准与截图

编制日期：2026-10-18。版本核对采用 `package.json` 1.0.2、GitHub 已发布的 `v1.0.2` 和 `new` 分支源码 `d0f6f1f`。

截图取自实际构建的浏览器界面。赛事、局内数据使用隔离演示资料，两页赛后报告采用已有测试构造的示例记录；连接与输出页保留未连接状态。截图未开启真实 OBS、设备准备、录制或平台推流。真实游戏、物理音视频设备与平台观众端效果应在播出环境中检查。

`images/` 保留原始截图，两个交付文件均可独立分发。`manual-content.json` 提供章节索引，内容源位于 `scripts/build-user-manual.py`。

## 维护与重新生成

1. UI 发生变化时，先构建当前源码：`npm run build`。
2. 运行 `node scripts/capture-user-manual.mjs` 重新截图。脚本使用临时数据、独立端口，关闭 LAN、真实采集和 OBS 自动启动，并阻止浏览器发出原生设备写操作。
3. 运行 `python scripts/build-user-manual.py` 生成离线 HTML 与章节索引，仅使用 Python 标准库。
4. 运行 `node scripts/render-user-manual.mjs` 检查图片与页脚重叠，并生成 PDF。
5. 渲染 PDF 全部页面，检查实际分页、图文清晰度及目录。浏览器页面尺寸检查无法替代 PDF 分页复核。

截图和 PDF 渲染需要 Playwright 及可用的 Microsoft Edge。通过 `RIFTCAST_PLAYWRIGHT_MODULE` 指定 Playwright 的 `index.mjs` 入口；普通环境也可使用已安装的 `playwright` 包。截图脚本自动选择可用的回环端口。

验证中间结果保存在被 Git 忽略的 `verification-output/user-manual-1.0.2/`。手册制作未改变生产用户资料与设备配置。
