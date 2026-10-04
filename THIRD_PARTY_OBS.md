# OBS Studio 第三方组件声明

RiftCast 随桌面工作台准备并启动 OBS Project 提供的 OBS Studio Windows x64 便携运行时。OBS Studio 的原始可执行文件、动态库、插件和数据文件保持官方 ZIP 中的内容。导播软件通过独立进程及 OBS WebSocket 控制它，运行时配置存放在本项目的 `runtime/obs-studio/config` 中。

固定版本为 **OBS Studio 32.2.2**（官方稳定版，2026 年 10 月 4 日核查）。

- 官方项目与版权信息：[OBS Project / obs-studio](https://github.com/obsproject/obs-studio)
- 官方发布与 SHA-256 校验表：[OBS Studio 32.2.2 release](https://github.com/obsproject/obs-studio/releases/tag/32.2.2)
- 官方二进制：[OBS-Studio-32.2.2-Windows-x64.zip](https://github.com/obsproject/obs-studio/releases/download/32.2.2/OBS-Studio-32.2.2-Windows-x64.zip)
- 二进制大小：187851583 字节；SHA-256：`4d6e40e3ab155f56b30de517380566a206d74b63cdf5ad49aa596924768f97e1`
- 对应版本完整源码包：[OBS-Studio-32.2.2-Sources.tar.gz](https://github.com/obsproject/obs-studio/releases/download/32.2.2/OBS-Studio-32.2.2-Sources.tar.gz)
- 源码包 SHA-256：`ec81fb66b03e75ddb3076b576f62679c39262e0e9960cef3e17a40dc5d68e6b4`
- 原始许可证：[32.2.2/COPYING](https://github.com/obsproject/obs-studio/blob/32.2.2/COPYING)，本地完整副本：`third-party/OBS-COPYING`，准备后的运行时副本：`runtime/obs-studio/COPYING`。

OBS Studio 使用 GNU General Public License version 2 or later。OBS 的第三方依赖和插件包含各自的许可与版权声明；准备脚本保留官方 ZIP 中的所有这些文件。本项目新增的运行时标记、便携模式标记、配置和此声明是 RiftCast 集成文件。OBS 软件按许可证中的条款提供，无附加保证。

项目源码中包含固定官方下载地址和许可副本。桌面首次启动、`npm run setup:obs` 会从 OBS Project 官方发布地址下载二进制，经大小及 SHA-256 校验后解压。离线拷贝已经准备好的项目时，应一并保留此声明、完整许可证及官方运行时内的许可文件。若制作并对外分发包含 OBS 二进制的安装包，应随包提供同版本完整对应源码，保留许可证及依赖声明，并遵守 COPYING 中的分发条款。

源码中的下载清单位于 `scripts/obs-runtime.json`。运行时位于 `runtime/obs-studio`，完整 ZIP 缓存位于 `runtime/.cache`。安装过程不会搜索或更改 Windows 已安装的 OBS Studio。
