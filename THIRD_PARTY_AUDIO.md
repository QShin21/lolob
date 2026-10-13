# 音频组件来源与许可

RiftCast 的抖音完整混音使用 VB-Audio Software 的基础版 **VB-CABLE**。

- 官方来源：[VB-CABLE](https://vb-audio.com/Cable/)，亦可通过 [www.vb-cable.com](https://www.vb-cable.com/) 访问。
- VB-CABLE 是 donationware。欢迎参与捐赠；如果使用后觉得有帮助或用于专业用途，请通过 [VB-Audio 商店](https://shop.vb-audio.com/en/win-apps/2-vb-cable.html) 支付相应许可。
- [官方分发许可](https://vb-audio.com/Services/licensing.htm) 中的 “VB-CABLE Distribution with other product” 允许在用户能识别其来源、了解 donationware 模式并能支付许可的情况下随应用分发和安装基础版。专业批量分发须遵循该页面的数量许可要求。
- 随包保留未经修改的官方 VBCABLE_Driver_Pack45.zip，SHA-256：b950e39f01af1d04ea623c8f6d8eb9b6ea5c477c637295fabf20631c85116bfb。解压后保留全部文件及原始 readme.txt。安装前校验压缩包哈希和官方安装程序的 Windows 数字签名。
- VB-CABLE A+B、C+D 未随包分发。
- Windows 驱动需要管理员授权。官方要求安装或卸载后重启；RiftCast 不会自动重启计算机。

RiftCast 自行实现的节目音频桥接库、设备工具、Lua 加载器及其构建脚本采用 GPL-2.0-or-later，源码位于 scripts/native 和 scripts/build-audio-bridge.cjs，并随 release 提供。桥接库使用随包的 OBS Studio 32.2.2 API，从节目音轨 1 取得最终混音，再用 Windows WASAPI 以 48 kHz 双声道送入 VB-CABLE。对应 OBS 源码和 GPL 文本随包保留。
