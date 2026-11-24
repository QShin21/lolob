# 观澜 2.0.0 用户使用手册

- [PDF 阅读与打印](观澜-2.0.0-用户使用手册.pdf)
- [离线网页版](观澜-2.0.0-用户使用手册.html)

共 47 页。沿用 1.7.0 手册的章节与操作，第 3 页介绍两套工作台主题、Tally、应用图标和裂隙曜金。工作台及裂隙曜金首发对位取自 2.0.0 构建的隔离实例，队伍和对局使用测试资料。历史节目、桌面端更新弹窗、真实 OBS 协作会话与监看图沿用前版素材，部分截图显示曾用名称。出处见目录与图注。

## 重新生成

从仓库根目录运行。先准备项目依赖和 Playwright，设置 `RIFTCAST_PLAYWRIGHT_MODULE` 指向 Playwright 的 `index.mjs`。截图和 PDF 默认使用 Edge，也可用 `RIFTCAST_BROWSER_EXECUTABLE` 指向 Chromium。Linux 打印需要可用的简体中文字体，例如 Noto Sans CJK SC。更新美术稿后使用同一条命令序列。

```sh
npm run build &&
node scripts/capture-user-manual-200.mjs &&
python3 -X utf8 scripts/build-user-manual-200.py &&
node scripts/render-user-manual-200.mjs &&
pdfinfo "docs/user-manual-2.0.0/观澜-2.0.0-用户使用手册.pdf" &&
pdftoppm -r 150 -png "docs/user-manual-2.0.0/观澜-2.0.0-用户使用手册.pdf" verification-output/user-manual-2.0.0/page
```

手册生成器读取 `images/`、前版章节修订和 `brand/guanlan-icon.svg`，生成自包含 HTML 和 `manual-content.json`。截图步骤校验当前界面的可见文字。PDF 步骤校验目录跳转、发布链接、全部图像及分页布局。检查 `verification-output/user-manual-2.0.0/layout.json` 和 47 张逐页 PNG，核对版面、图片与页码。

## 发布

Windows 发布流程将已审阅并提交的 PDF 作为 `GuanLan-2.0.0-User-Manual.pdf` 上传至 v2.0.0，在发布说明顶部提供下载入口。流程核对草稿和正式版资产的大小与 SHA-256，并重新下载手册校验。其他维护事项见 [1.6.0 维护说明](../user-manual-1.6.0/README.md)。
