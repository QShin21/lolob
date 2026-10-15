# 抖音窗口接入验证（2026-10-15）

交付版本：0.8.0-rc.4。通过 Electron 独立管理 OBS Program 投影，标题为「RiftCast 节目输出」。原生 HWND 具有 APPWINDOW 样式、无 owner、非子窗口，使用独立属性标记，避免被导播台预监复用或回收。重复打开复用同一窗口；人工关闭后可重新打开。导航/刷新保留输出；退出清理并提示活动输出。

## 已验证

- `npm test`：303 项全部通过，包含窗口音频路径不注册、不启停虚拟摄像头的回归。
- `node --test scripts/test-program-window.cjs`：3 项通过，覆盖独立所有权、人工关闭后重建、临时查询失败与延迟关闭的恢复。
- `node scripts/test-obs-projector-helper.cjs`：编译、自检与所有权拒绝通过。
- `node scripts/verify-native-preview-visibility.mjs --desktop`：13 项通过，含 Windows 采集真实节目像素、独立窗口与嵌入预监隔离、刷新保留窗口。
- `npm run release:win`：安装包和 ZIP 生成成功。
- `node scripts/verify-release.mjs --reuse-drivers-only --window-only`：源码目录外的打包 EXE 通过 12 项检查。使用隔离数据与 OBS，无 Node/npm/编译器 PATH；验证导入、窗口 UI、关闭、重启和数据保留。
- Computer Use 在直播伴侣 13.1.1.502547155 的「场景二」添加窗口素材，列表包含 `obs64.exe RiftCast 节目输出`，预览出现测试节目文字与青色背景。显示鼠标、3D 兼容、兼容性捕获均未勾选；未出现格式错误；全程未点击开始直播。

## 现场限制

直播伴侣保留了测试窗口素材；隔离测试窗口已关闭。使用新版正式输出时须重新选择窗口目标。未替换当前已安装的旧版 RiftCast，也未改动用户赛事数据。

最初的完整旧摄像头验收在音频启动阶段未通过：VB-CABLE 已是 Windows 默认音频设备，现有音频防反馈检查阻止启动。窗口专项验收保持虚拟摄像头、音频桥与直播推流停止，结果通过。此结果不证明伴侣声音或观众端接收。节目混音仍需正确设置真实默认播放/录音设备并试听。

未验证正式开播、观众端、动态帧率和音画同步。真实窗口静态采集及窗口生命周期已验证。安装包未签名。

机器可读证据在 `verification-output/native-preview-visibility/desktop/report.json` 与 `verification-output/release-0.8.0-rc.4/smoke-report.json`，Windows 采集像素在前者目录的 `program-window-capture.png`。
