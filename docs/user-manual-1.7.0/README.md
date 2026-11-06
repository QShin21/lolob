# RiftCast 1.7.0 用户使用手册

- [PDF 阅读与打印](RiftCast-1.7.0-用户使用手册.pdf)
- [离线网页版](RiftCast-1.7.0-用户使用手册.html)

以 1.6.0 的 42 页手册为基础，更新封面、版本、协作概览和相关检查项，增加第 43–46 页团队协作操作说明。其余章节继续沿用。新增截图使用 1.7.0 隔离实例及真实 OBS，视频为合成测试画面。

运行 `node scripts/verify-collaboration-170.mjs --obs` 获取新增截图，再运行 `python -X utf8 scripts/build-user-manual-170.py`、`node scripts/render-user-manual-170.mjs`。Playwright 路径使用 `RIFTCAST_PLAYWRIGHT_MODULE` 指定。检查布局报告并将 PDF 全页渲染后核对。

发布时把本版 PDF 上传至 v1.7.0 GitHub Release，并提供下载入口。使用 `node scripts/publish-user-manual.mjs 1.7.0 <已核对的PDF>` 检查上传大小、SHA-256 和重新下载后的内容。手册后续维护流程沿用 [1.6.0 维护说明](../user-manual-1.6.0/README.md)。
