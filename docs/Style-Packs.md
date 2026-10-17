# RiftCast 风格包格式 v1

适用于 RiftCast 1.0.2，继续采用 v1 清单格式。风格包管理 11 个内置节目的背景、面板贴图、装饰框、配色与字体类别。赛事、队伍、英雄、选手、BP、比分、时间、经济和统计仍由原有数据接口与组件实时绘制。自定义场景继续使用自己的素材。

## 使用

在导播台的场景库点击「风格包」。应用内置冰川极光（默认）、曜金典藏、霓虹脉冲、朱砂墨韵和瓷白竞速，首次启动即可选择，全部离线随包提供。每套包含 23 张 PNG 与 11 个预设场景配置。点击「导出风格包」可将所选内置或导入风格导出为独立 ZIP。

内置目录分别为 glacier-aurora、regalia、neon-pulse、vermilion-ink、porcelain-racing。前一版下载的五套 v1.0.0 美术包与本版内置包具有相同的规范化内容指纹；重复导入只返回原内置项，不会再增加一条。修改同 id 的包会得到独立 revision，原内置版本保持不变。建议派生设计使用新的 id。

简陋包已从内置列表、资源目录和导出产物中移除。旧状态中的 jianlou/builtin-v1 引用在预监、节目以及撤回快照中迁移为冰川极光，缺省或无效引用也采用冰川极光。有效自定义风格继续按原 id/revision 恢复。历史赛事、OCR 留存、队伍和自定义场景不因更换默认风格而修改。迁移发生在应用启动时，升级前应停播并备份数据。

「导入风格包」只安装素材并打开独立效果预览。选择「准备到预监」后，新的外观进入待播配置，当前节目保持原来的风格。回导播台检查预监并执行 TAKE，风格随节目内容一同发布。原有撤回操作保留前一个节目的风格引用。导入与切换需要当前主导播权限，其他席位可查看和导出。

已导入素材保存在应用数据目录的 `style-packs` 子目录中，重启后保留。迁移工作站时导出需要的 ZIP 后在新工作站导入，或备份整个应用数据目录。仅复制 state.json 无法搬走图片。丢失或损坏的导入包在重启时回退到冰川极光，并在管理窗口提示。内置资源在启动和打包时按 SHA-256 检查，内置资源缺失或损坏时需修复应用安装。应用不会删除用户数据目录中的自定义素材。

## 美术制作

从任一内置包导出 ZIP，解压后会得到以下结构（其余图片略）：

```text
manifest.json
README.md
assets/
  bg-standby.png
  bg-lineup.png
  bg-postgame.png
  scoreboard.png
  ticker.png
```

清单必须位于 ZIP 根目录。Windows 中请选中 manifest.json、README.md 与 assets 文件夹后压缩，不要压缩它们的上级文件夹。删除系统附带的 __MACOSX、.DS_Store 等隐藏文件。扩展名建议为 `.riftstyle.zip`，普通 `.zip` 同样可导入。

先修改 manifest.json 中的 id、name、version。id 使用小写英文字母开头，后续可含数字与连字符，最多 48 字符；`jianlou` 为已退役标识，不接受导入。name 为界面名称，version 为美术版本，例如 1.0.0。author 与 description 用于署名和说明。

替换 assets 中的图片，或在 assets 映射中加入新图片，再将固定槽位指向图片的标识。图片支持 PNG、JPEG、单帧 WebP。透明装饰推荐 PNG。清单只含固定格式的数据，不接受 CSS、HTML、JavaScript、SVG、外部图片地址和字体文件。

全画布按 1920 × 1080 设计，图片贴图按对应槽位拉伸铺满。背景和装饰框建议直接制作成 1920 × 1080。五套内置风格含完整背景和按槽位制作的面板，渐变、细线和排版仍由贴图、内置组件及配色令牌共同组成。动态文字、队标、英雄头像与符文依旧位于固定版式上，美术应避开这些内容的安全区。v1 不支持移动数据元素或改变其绑定关系。

每个场景的 `background` 放在动态内容后面。`frame` 是叠在节目内容之上的透明装饰层，非透明像素会遮住其下方内容，必须在导入预览中逐项核对。设置为 null 表示保留内置处理。仅赛前倒计时、首发对位、赛程看板、赛后报告允许整幅背景；BP、局内、数据榜和采访必须保留视频采集区域。原生团战视图保持完全透明。

## 清单字段

format 固定为 `riftcast-style-pack`；schemaVersion 固定为 1；canvas 固定为 `{ "width": 1920, "height": 1080 }`。附带的 `style-pack-v1.schema.json` 可用于编辑器外部校验，不要把 schema 文件打进风格 ZIP。

palette 是颜色令牌映射。建议先改 ink（深色底）、panel（面板）、paper（浅色底）、muted（次要文字）、line（分隔线）、blue（蓝方）、red（红方）、accent（强调色）。以 c 开头的字段对应旧视觉中的细分颜色，完整列表见导出的清单。颜色只接受十六进制形式，例如 #102030 或 #102030cc；新导入包省略的已知令牌回退到冰川极光。历史已导入包的规范化清单已记录完整配色，恢复时保留其原配色。部分游戏资源图标与品牌标志保留原始颜色。

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

自定义安装记录上限为 50 个版本，五个内置版本不占用此限额。界面暂不提供删除，以免删除节目或撤回快照正在使用的素材。需要清理时先停播并备份应用数据，再移除不再使用的 `style-packs/<id>--<revision>` 目录并重启。

revision 是清单与规范化图片内容的 SHA-256 指纹，与美术作者填写的 version 分开。相同内容重复导入不会新增记录；相同 id 的修改版会成为独立 revision，旧版继续可用，已上节目的快照不会被新版覆盖。导出、导入和重启保留此内容身份。

浏览器会预加载待播贴图，加载期间保持此前完整风格。预监加载失败时显示提示，节目画面不显示风格管理错误信息。断网外链不影响包内贴图；其他原有游戏资源仍遵循应用自己的离线资源策略。现场切换前仍需核对实际 OBS 预监。


## 删除风格版本（1.0.2）

主导播可选择闲置版本，点击“删除风格包”，核对名称、版本和修订号后确认，或取消操作。自定义版本的本地清单及贴图会被移除，同名其他修订保留。非默认内置风格可从管理列表删除，安装目录的原始素材保留。删除结果在重启后保留；重新导入原 ZIP 可恢复相同修订。需要保留自定义素材时请先导出。

默认“冰川极光”作为安全回退保留。待播配置、当前节目和撤回快照正在引用的版本受到保护，界面会显示对应原因。请先准备其他风格到预监，并在需要时 TAKE 更新节目及撤回快照，再删除旧风格。服务端会在实际删除前重新检查引用及主导播权限。

## 1.0.1 元素外观配置

可选 `appearance` 按用途分别配置文字和底色；`scenes.<节目>.appearance` 覆盖该节目。原有 palette、fonts 与贴图继续生效。优先级为元素场景设置 > 元素全局设置 > 原有样式。场景只覆盖写出的属性；某个元素设为 null 会取消其全局元素设置，回到原有样式。省略 appearance 的旧包保留原内容指纹，导入、导出、重启和 TAKE 继续兼容。包含新字段的包需要 RiftCast 1.0.1 或更新版本。

每个元素支持：

| 属性 | 范围与含义 |
| --- | --- |
| color | 文字颜色，十六进制 RGB/RGBA |
| backgroundColor | 元素底色，十六进制 RGB/RGBA；已有贴图仍绘制在底色上方 |
| borderColor | 已有边框的颜色；不新增边框宽度 |
| font | default、modern、serif，显式选择可覆盖全局字体 |
| fontSize | 0.5–8，单位 cqw，即画布容器宽度的百分之一；1.8 在 1920 宽画布约 34.56px |
| fontWeight | 100–900，100 的整数倍 |
| letterSpacing | -0.05–0.3，单位 em |

配置不调整布局坐标、视频区域和数据绑定。长姓名继续按可用宽度缩放；放大字号后应检查实际预监。原生团战与自定义场景不应用元素覆盖。

青花瓷首发浅底姓名的局部配置示例（合并进原完整清单）：

```json
{
  "appearance": {
    "lineupName": { "color": "#17365e", "font": "modern", "fontSize": 1.8, "fontWeight": 700 },
    "lineupGame": { "color": "#ffffff", "backgroundColor": "#133964" }
  }
}
```

旧青花瓷包升级应用后保留原配置；需导入带以上设置的新修订，再准备到预监并 TAKE。

支持的元素及对应组件如下，选择器供定位用途参考，清单中只填写元素名称：

| 元素名称 | 组件位置 |
| --- | --- |
| `lineupName` | `.rl-info > .fit-name` |
| `lineupCardBlue` | `.rl-card.blue` |
| `lineupCardRed` | `.rl-card.red` |
| `lineupTeam` | `.rl-tag` |
| `lineupScoreBlue` | `.rl-score.blue` |
| `lineupScoreRed` | `.rl-score.red` |
| `lineupGame` | `.rl-game` |
| `lineupCaption` | `.rl-caption` |
| `lineupFooter` | `.rune-lineup footer` |
| `draftName` | `.cast-draft-player` |
| `draftTeam` | `.arena-draft-team-heading` |
| `draftTimer` | `.cast-draft-timer` |
| `liveName` | `.lb-player-name` |
| `liveNameplate` | `.lb-nameplate` |
| `liveScoreboard` | `.lb-scoreboard` |
| `reportName` | `.pr-card > .fit-name` |
| `reportKda` | `.pr-kda` |
| `reportHeadingBlue` | `.pr-table-heading:not(.red)` |
| `reportHeadingRed` | `.pr-table-heading.red` |
| `reportTeam` | `.pr-header > strong` |
| `reportGame` | `.pr-header small` |
| `reportCaption` | `.pr-caption` |
| `reportMetric` | `.pr-metrics` |
| `reportGoldLabel` | `.pr-gold-label` |
| `scheduleTeam` | `.arena-schedule-team` |
| `scheduleScore` | `.arena-schedule-score` |
| `scheduleTime` | `.arena-schedule-time` |
| `countdownNumber` | `.arena-countdown-number` |
| `countdownMessage` | `.arena-countdown-message` |
| `interviewName` | `.cast-interview-name` |
| `ticker` | `.cast-ticker` |
| `analysisHeading` | `.arena-analysis-heading` |
