# RiftCast 用户手册维护与发布

1.6.0 的 PDF 在本目录，依据 1.0.2 图文手册修订。界面截图来自隔离环境；历史节目示例在手册中注明。手册源为 `scripts/build-user-manual-160.py` 与 `scripts/manual-160-revisions.py`，截图在 `images/`。

## 后续版本

1. 以最近发布的手册为基准，对照本版更新、实际界面和受影响的操作流程。只修改受影响章节，并更新必要的目录、页码和截图。
2. 内容没有变化时，保留上一版 PDF 的原始内容，发布说明标明沿用的手册版本。文件可按目标版本命名，以便对应 Release。
3. 内容变化时，保留未变章节；更新版本、截图和对应操作，生成 PDF，检查全文、目录、链接、分页及每页渲染。
4. 用 `node scripts/publish-user-manual.mjs <版本号> <已检查的PDF路径>` 添加到对应正式 Release。脚本保留同名不同内容，校验 GitHub 的大小和 SHA-256，重新下载并核验。
5. 在 Release 说明加入手册下载链接及沿用版本说明（如适用），检查原有安装包仍在。将手册源和本次修订提交并推送现有 `new` 分支。

## 重新生成 1.6.0

安装依赖并构建应用后，配置 `RIFTCAST_PLAYWRIGHT_MODULE` 指向 Playwright 的 `index.mjs`；运行 `node scripts/capture-user-manual-160.mjs` 可在隔离服务内重新截取工作台。更新弹窗截图使用打包版及隔离用户目录。节目示例沿用旧版素材并已标注。

运行 `python -X utf8 scripts/build-user-manual-160.py`，再运行 `node scripts/render-user-manual-160.mjs` 生成 PDF。检查 `verification-output/user-manual-1.6.0/layout.json`，并将 PDF 全部页面渲染为图片进行视觉复核；最后抽查目录链接、文本及页数。
