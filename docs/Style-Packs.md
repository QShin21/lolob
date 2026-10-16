# RiftCast 风格包格式 v1

适用于 RiftCast 0.9.4。风格包管理 11 个内置节目的背景、面板贴图、装饰框、配色与字体类别。赛事、队伍、英雄、选手、BP、比分、时间、经济和统计仍由原有数据接口与组件实时绘制。自定义场景继续使用自己的素材。

## 使用

在导播台的场景库点击「风格包」。内置「简陋包」保留 0.9.3 的原有排版与视觉。点击「导出风格包」可得到独立 ZIP，也可直接下载 Release 的 `RiftCast-0.9.4-Jianlou.riftstyle.zip`。

「导入风格包」只安装素材并打开独立效果预览。选择「准备到预监」后，新的外观进入待播配置，当前节目保持原来的风格。回导播台检查预监并执行 TAKE，风格随节目内容一同发布。原有撤回操作保留前一个节目的风格引用。导入与切换需要当前主导播权限，其他席位可查看和导出。

已导入素材保存在应用数据目录的 `style-packs` 子目录中，重启后保留。迁移工作站时导出需要的 ZIP 后在新工作站导入，或备份整个应用数据目录。仅复制 state.json 无法搬走图片。丢失或损坏的包在重启时回退到简陋包，并在管理窗口提示。

## 美术制作

从简陋包导出 ZIP，解压后会得到以下结构：

```text
manifest.json
README.md
assets/
  ink.png
  panel.png
  paper.png
  black.png
  cream.png
```

清单必须位于 ZIP 根目录。Windows 中请选中 manifest.json、README.md 与 assets 文件夹后压缩，不要压缩它们的上级文件夹。删除系统附带的 __MACOSX、.DS_Store 等隐藏文件。扩展名建议为 `.riftstyle.zip`，普通 `.zip` 同样可导入。

先修改 manifest.json 中的 id、name、version。id 使用小写英文字母开头，后续可含数字与连字符，最多 48 字符；`jianlou` 保留给内置包。name 为界面名称，version 为美术版本，例如 1.0.0。author 与 description 用于署名和说明。

替换 assets 中的图片，或在 assets 映射中加入新图片，再将固定槽位指向图片的标识。图片支持 PNG、JPEG、单帧 WebP。透明装饰推荐 PNG。清单只含固定格式的数据，不接受 CSS、HTML、JavaScript、SVG、外部图片地址和字体文件。

全画布按 1920 × 1080 设计，图片贴图按对应槽位拉伸铺满。背景和装饰框建议直接制作成 1920 × 1080。简陋包的一些图片为小尺寸色块，原有渐变、细线和排版通过内置组件及配色令牌保留；制作新包时可以将色块替换为完整美术图。动态文字、队标、英雄头像与符文依旧位于固定版式上，美术应避开这些内容的安全区。v1 不支持移动数据元素或改变其绑定关系。

每个场景的 `background` 放在动态内容后面。`frame` 是叠在节目内容之上的透明装饰层，非透明像素会遮住其下方内容，必须在导入预览中逐项核对。设置为 null 表示保留内置处理。仅赛前倒计时、首发对位、赛程看板、赛后报告允许整幅背景；BP、局内、数据榜和采访必须保留视频采集区域。原生团战视图保持完全透明。

## 清单字段

format 固定为 `riftcast-style-pack`；schemaVersion 固定为 1；canvas 固定为 `{ "width": 1920, "height": 1080 }`。附带的 `style-pack-v1.schema.json` 可用于编辑器外部校验，不要把 schema 文件打进风格 ZIP。

palette 是颜色令牌映射。建议先改 ink（深色底）、panel（面板）、paper（浅色底）、muted（次要文字）、line（分隔线）、blue（蓝方）、red（红方）、accent（强调色）。以 c 开头的字段对应旧视觉中的细分颜色，完整列表见导出的清单。颜色只接受十六进制形式，例如 #102030 或 #102030cc；省略的已知令牌回退到简陋包。部分游戏资源图标与品牌标志保留原始颜色。

fonts 包含 body 和 display，两者可选 default、modern、serif。这些类别使用系统字体回退序列，风格包不携带字体。默认类别保持原有字体；不同操作系统可用字体不同，最终以实际播出主机预监为准。

assets 将图片标识映射到文件，例如 `"championship": "assets/championship.png"`。标识的规则与包 id 相同。图片路径必须是 assets/ 下的单层文件，每个文件仅声明一次，不支持绝对路径、上级目录、链接、远程 URL 或重复文件名。

textures 是全局固定贴图槽。scenes 下必须完整包含下表 11 个 id，每个场景有 background、frame、textures。场景内同名槽优先于全局；显式 null 清除该场景的全局槽，未写则继承全局。

| 场景 id | 节目 | 可用主要槽位 |
| --- | --- | --- |
| standby | 赛前倒计时 | background、frame、header、paper、ticker |
| draft | BP 选人 | frame、cardBlue、cardRed、draftCenter、ticker |
| lineup | 首发对位 | background、frame、header、cardBlue、cardRed、ticker |
| live | 局内计分板 | frame、scoreboard、rowBlue、rowRed、nameplate、ticker |
| economy | 经济曲线 | frame、header、panel、nameplate、ticker |
| ranking | 选手数据榜 | frame、header、panel、nameplate、ticker |
| schedule | 赛程看板 | background、frame、header、ticker |
| postgame | 赛后报告 | background、frame、header、ticker |
| interview | 赛后采访 | frame、panel、nameplate、ticker |
| teamfight | 原生团战视图 | 无，保留游戏原生 HUD |
| gold-ranking | 十人经济排行 | frame、panel、nameplate、ticker |

各槽作用：header 为节目标题栏；panel 为数据面板、采访卡或经济排行底；cardBlue/cardRed 为两队 BP 面板和首发卡；scoreboard 为局内比分条；rowBlue/rowRed 为两方选手行；nameplate 为选手或队伍名牌；ticker 为公告条；paper 为赛前倒计时卡；draftCenter 为 BP 中央信息面板。关闭对应内容开关后，其贴图也不会出现。

下面是清单局部示例，其他必需字段和场景沿用导出的完整模板：

```json
{
  "id": "campus-cup",
  "name": "校园赛美术",
  "version": "1.0.0",
  "assets": {
    "opening": "assets/opening.png",
    "live-frame": "assets/live-frame.png"
  },
  "scenes": {
    "standby": { "background": "opening", "frame": null, "textures": {} },
    "live": { "background": null, "frame": "live-frame", "textures": {} }
  }
}
```

## 容量与一致性

ZIP 最大 48 MiB；清单最大 128 KiB；说明最大 64 KiB；最多 64 张图片；单图文件最大 8 MiB，尺寸每边不超过 4096；所有图合计最多 64M 像素。导入后图片统一解码为静态 PNG，单图仍不得超过 8 MiB，PNG 总容量不得超过 40 MiB。校验文件路径、CRC、格式和引用全部成功后才登记安装，不会执行包内内容。

安装记录上限为 50 个版本。界面暂不提供删除，以免删除节目或撤回快照正在使用的素材。需要清理时先停播并备份应用数据，再移除不再使用的 `style-packs/<id>--<revision>` 目录并重启。

revision 是清单与规范化图片内容的 SHA-256 指纹，与美术作者填写的 version 分开。相同内容重复导入不会新增记录；相同 id 的修改版会成为独立 revision，旧版继续可用，已上节目的快照不会被新版覆盖。导出、导入和重启保留此内容身份。

浏览器会预加载待播贴图，加载期间保持此前完整风格。预监加载失败时显示提示，节目画面不显示风格管理错误信息。断网外链不影响包内贴图；其他原有游戏资源仍遵循应用自己的离线资源策略。现场切换前仍需核对实际 OBS 预监。
