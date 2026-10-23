# OBS 切入失败修复记录

## 故障与原因

1.4.1 在 OBS 已连接且来源可用时，TAKE 返回“OBS 操作失败；节目内容未发布”。本机故障回执显示转场已准备好 `RiftCast 节目`，尚未发布节目内容。

转场模块清除场景覆盖设置时发送了 `transitionName: ''` 和 `transitionDuration: 0`。OBS WebSocket 要求用 `null` 清除名称和时长；空名称及 0 毫秒均不满足协议。见 [OBS 官方协议](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md#setscenescenetransitionoverride)。

2026-10-23 在本机 OBS **32.2.2 / WebSocket 5.7.4** 的临时场景复测：旧请求返回 **403**，提示 `transitionName` 不能为空；两个字段改为 `null` 后请求成功，读取结果也为两个 `null`。临时场景在核验后移除。

## 修复

- 硬切、淡化、视频转场统一通过协议正确的请求清除覆盖设置。
- 清理阶段原样恢复已有名称和时长；未设置的字段保持 `null`。
- OBS 错误保留请求名和数值错误码；插件原始消息及请求数据不进入用户错误提示。
- 转场测试模拟 OBS 的名称、时长校验，覆盖未设置、部分设置、完整覆盖设置，以及切入前后失败的回执。

## 验证

- 加严协议校验后，旧实现的 5 项转场测试失败；修复后通过。
- Windows 全量测试 **598 项通过，0 失败，0 跳过**；类型检查和生产构建通过。
- 本机正在运行的安装版加载同一参数修复后，通过实际控制窗口席位依次执行：淡化到 BP、硬切到待机、淡化回 BP。三次回执均为 `applied`、`published: true`，并确认 OBS 目标场景。
- 这次本机验证未启动推流或录制。视频转场由自动化回归覆盖，公开直播接收不在这次验收范围。

原始协议回执、实际切入回执、界面截图和本机修复回滚副本保存在本地 `verification-output/obs-failure-142/`，不随安装包发布。
