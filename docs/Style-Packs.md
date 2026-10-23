# RiftCast 风格包格式 v1

适用于 RiftCast 1.4.0，继续采用 v1 清单格式。风格包管理 11 个内置节目的背景、面板贴图、装饰框、配色、字体、元素位置和文字模板。赛事、队伍、英雄、选手、BP、比分、时间、经济和统计由数据接口与组件实时绘制。自定义场景继续使用自己的素材。

## 使用

在导播台的场景库点击「风格包」。应用内置青花瓷 · 云山雅韵（默认）、冰川极光、曜金典藏、霓虹脉冲、朱砂墨韵和瓷白竞速，首次启动即可选择，全部离线随包提供。每套包含 23 张 PNG 与 11 个预设场景配置。点击「导出风格包」可将所选内置或导入风格导出为独立 ZIP。

内置目录分别为 glacier-aurora、regalia、neon-pulse、vermilion-ink、porcelain-racing、qinghua-celestial。前一版下载的五套 v1.0.0 美术包与本版内置包具有相同的规范化内容指纹；重复导入只返回原内置项，不会再增加一条。修改同 id 的包会得到独立 revision，原内置版本保持不变。建议派生设计使用新的 id。

简陋包已从内置列表、资源目录和导出产物中移除。旧状态中的 jianlou/builtin-v1 引用在预监、节目以及撤回快照中迁移为青花瓷，缺省或无效引用也采用青花瓷。有效自定义风格继续按原 id/revision 恢复。历史赛事、OCR 留存、队伍和自定义场景不因更换默认风格而修改。迁移发生在应用启动时，升级前应停播并备份数据。

「导入风格包」只安装素材并打开独立效果预览。选择「准备到预监」后，新的外观进入待播配置，当前节目保持原来的风格。回导播台检查预监并执行 TAKE，风格随节目内容一同发布。原有撤回操作保留前一个节目的风格引用。导入与切换需要当前主导播权限，其他席位可查看和导出。

已导入素材保存在应用数据目录的 `style-packs` 子目录中，重启后保留。迁移工作站时导出需要的 ZIP 后在新工作站导入，或备份整个应用数据目录。仅复制 state.json 无法搬走图片。丢失或损坏的导入包在重启时回退到青花瓷，并在管理窗口提示。内置资源在启动和打包时按 SHA-256 检查，内置资源缺失或损坏时需修复应用安装。应用不会删除用户数据目录中的自定义素材。

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

全画布按 1920 × 1080 设计，图片贴图按对应槽位拉伸铺满。背景和装饰框建议直接制作成 1920 × 1080。六套内置风格含完整背景和按槽位制作的面板，渐变、细线和排版由贴图、内置组件及配色令牌共同组成。1.4.0 可通过可视化编辑器调整 47 类语义元素的位置、缩放和透明度；元素继续使用所属组件的数据。美术应避开视频区域，并在实际节目预监中核对调整后的内容。

每个场景的 `background` 放在动态内容后面。`frame` 是叠在节目内容之上的透明装饰层，非透明像素会遮住其下方内容，必须在导入预览中逐项核对。设置为 null 表示保留内置处理。仅赛前倒计时、首发对位、赛程看板、赛后报告允许整幅背景；BP、局内、数据榜和采访必须保留视频采集区域。团战视图的游戏区域保持透明，底部十人状态栏使用风格包配色。

## 清单字段

format 固定为 `riftcast-style-pack`；schemaVersion 固定为 1；canvas 固定为 `{ "width": 1920, "height": 1080 }`。附带的 `style-pack-v1.schema.json` 可用于编辑器外部校验，不要把 schema 文件打进风格 ZIP。

palette 是颜色令牌映射。建议先改 ink（深色底）、panel（面板）、paper（浅色底）、muted（次要文字）、line（分隔线）、blue（蓝方）、red（红方）、accent（强调色）。以 c 开头的字段对应旧视觉中的细分颜色，完整列表见导出的清单。颜色只接受十六进制形式，例如 #102030 或 #102030cc；新导入包省略的已知令牌回退到青花瓷。历史已导入包的规范化清单已记录完整配色，恢复时保留其原配色。部分游戏资源图标与品牌标志保留原始颜色。

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
| teamfight | 团战视图 | 无整幅贴图；十人状态栏使用 palette，游戏区域透明 |
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

自定义安装记录上限为 50 个版本，五个内置版本不占用此限额。1.0.2 可在风格包窗口删除闲置版本；默认风格、待播、当前节目与撤回快照引用的版本受保护。请使用界面删除并按提示处理引用，具体流程见下方“删除风格版本”。

revision 是清单与规范化图片内容的 SHA-256 指纹，与美术作者填写的 version 分开。相同内容重复导入不会新增记录；相同 id 的修改版会成为独立 revision，旧版继续可用，已上节目的快照不会被新版覆盖。导出、导入和重启保留此内容身份。

浏览器会预加载待播贴图，加载期间保持此前完整风格。预监加载失败时显示提示，节目画面不显示风格管理错误信息。断网外链不影响包内贴图；其他原有游戏资源仍遵循应用自己的离线资源策略。现场切换前仍需核对实际 OBS 预监。


## 删除风格版本（1.0.2）

主导播可选择闲置版本，点击“删除风格包”，核对名称、版本和修订号后确认，或取消操作。自定义版本的本地清单及贴图会被移除，同名其他修订保留。非默认内置风格可从管理列表删除，安装目录的原始素材保留。删除结果在重启后保留；重新导入原 ZIP 可恢复相同修订。需要保留自定义素材时请先导出。

默认“冰川极光”作为安全回退保留。待播配置、当前节目和撤回快照正在引用的版本受到保护，界面会显示对应原因。请先准备其他风格到预监，并在需要时 TAKE 更新节目及撤回快照，再删除旧风格。服务端会在实际删除前重新检查引用及主导播权限。

## 元素外观配置

可选 `appearance` 按用途分别配置文字和底色；`scenes.<节目>.appearance` 覆盖该节目。原有 palette、fonts 与贴图继续生效。优先级为元素场景设置 > 元素全局设置 > 原有样式。场景只覆盖写出的属性；某个元素设为 null 会取消其全局元素设置，回到原有样式。省略 appearance 的旧包保留原内容指纹，导入、导出、重启和 TAKE 继续兼容。基础外观字段自 1.0.1 支持；位置、缩放、透明度、文字模板和新增分析元素需要 1.4.0。

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
| x | -1920–1920，相对原始位置的横向偏移，单位为 1920 × 1080 画布像素 |
| y | -1080–1080，相对原始位置的纵向偏移，单位同上 |
| scale | 0.25–4，元素缩放比例 |
| opacity | 0–1，元素透明度 |
| text | 最多 240 字符的纯文字模板，仅下方列出的 31 个文字目标支持 |

位置和缩放作用于对应语义元素；例如更改 `liveName` 会一起调整十个局内选手姓名。同类元素保持各自的比赛数据上下文。长姓名继续按可用宽度缩放；放大字号或移动元素后应检查实际预监。视频采集区域由节目布局管理。团战与自定义场景不应用元素覆盖。

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
| `draftName` | `.cast-draft-player,.fhd-picks article > strong` |
| `draftTeam` | `.arena-draft-center-team` |
| `draftTimer` | `.cast-draft-timer` |
| `liveName` | `.lb-player-name` |
| `liveNameplate` | `.lb-nameplate` |
| `liveScoreboard` | `.lb-scoreboard` |
| `reportName` | `.pr-card > .fit-name,.pr-gold-label > .fit-name,.ag-damage-name > strong` |
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
| `analysisPanel` | `.broadcast-analysis` |
| `analysisName` | `.ba-player-data strong` |
| `analysisValue` | `.ba-player-data b` |
| `globalScoreboard` | `.ba-global-scoreboard` |
| `eventAnnouncement` | `.ba-announcement` |
| `lFrameRoster` | `.llf-rosters` |
| `lFrameFooter` | `.llf-footer` |
| `reportChampion` | `.pr-champion-text,.ag-champion-text` |
| `inhibitorLabel` | `.ba-inhibitors > div > span` |
| `inhibitorTime` | `.ba-inhibitors > div > b` |
| `championTabName` | `.ct-details > strong` |
| `lFrameName` | `.llf-team article strong` |
| `fearlessLane` | `.ag-fearless-lane` |
| `fearlessChampion` | `.ag-fearless-champion` |
| `patchText` | `.lb-patch > b` |

## 1.4.0 可视化编辑与动态文字

在「风格包」选择风格并打开「可视化编辑」，选择节目和元素后直接拖动，或输入属性数值。开启「吸附参考线」时，元素边缘和中心可对齐画布及其他语义元素；青色参考线显示当前吸附位置，按住 Alt 可暂时关闭吸附。一次连续拖动或一次输入框编辑作为一步历史，最多保留 100 步。可使用撤销／重做按钮，或在文字输入框外按 Ctrl+Z／Ctrl+Y。保存会创建新修订；准备到预监并 TAKE 后应用于节目。

文字编辑支持 `lineupName`、`lineupTeam`、`lineupGame`、`lineupCaption`、`lineupFooter`、`draftName`、`liveName`、`countdownMessage`、`interviewName`、`ticker`、`reportName`、`reportKda`、`reportTeam`、`reportGame`、`reportCaption`、`reportGoldLabel`、`scheduleTeam`、`scheduleScore`、`scheduleTime`、`analysisHeading`、`analysisName`、`analysisValue`、`lFrameFooter`、`reportChampion`、`inhibitorLabel`、`inhibitorTime`、`championTabName`、`lFrameName`、`fearlessLane`、`fearlessChampion`、`patchText`。其他目标显示对应的外观属性。`text` 可混合任意普通文字与下表占位符，留空字符串会显示空文字，删除属性会恢复原内容。

| 占位符 | 数据来源 |
| --- | --- |
| `{{matchTitle}}`、`{{matchSubtitle}}` | 比赛标题、副标题 |
| `{{game}}`、`{{format}}` | 当前局号、赛制 |
| `{{blueTeamName}}`、`{{redTeamName}}` | 当前蓝方、红方队名 |
| `{{blueScore}}`、`{{redScore}}` | 当前蓝方、红方比分 |
| `{{teamName}}`、`{{teamTag}}` | 当前元素所属队伍的名称、简称 |
| `{{playerName}}`、`{{playerRole}}`、`{{championName}}` | 当前元素所属选手的姓名、位置、英雄名称 |
| `{{lane}}` | 所在分路 |
| `{{timer}}` | 当前位置计时 |
| `{{value}}` | 当前位置数值 |
| `{{label}}` | 当前位置标题 |
| `{{scheduledAt}}` | 赛程时间（北京时间） |
| `{{matchStatus}}` | 赛程状态 |
| `{{patch}}` | 游戏版本 |
| `{{kills}}` | 选手击杀 |
| `{{deaths}}` | 选手死亡 |
| `{{assists}}` | 选手助攻 |

选手卡片使用该卡片的选手；队名使用所属队伍；全局文字使用当前选中的选手。没有对应上下文的字段显示空文字。赛程使用该行比赛的标题、双方、比分和北京时间；水晶使用实际受影响一侧和剩余计时；Fearless 分路与英雄使用所选归档的历史选用。风格编辑器选择“赛后报告”后可在“赛后预览内容”切换归档图形并编辑，使用最近的有效存档。模板随数据变化自动更新，只接受表内字段，禁止嵌套花括号。内容按纯文字渲染，例如 `<img>` 会直接显示为文字。系统不会执行模板中的 HTML 或脚本。

下面的局部配置为十个局内姓名添加队伍简称，并设置首发标题；其他清单字段沿用导出的完整模板：

```json
{
  "appearance": {
    "liveName": { "x": 12, "y": -4, "scale": 1.1, "opacity": 0.95, "text": "{{teamTag}} · {{playerName}}" }
  },
  "scenes": {
    "lineup": { "appearance": { "lineupCaption": { "text": "{{matchTitle}} · 第 {{game}} 局首发" } } }
  }
}
```

公开的 `style-pack-v1.schema.json` 同步包含 47 个语义目标、数值边界和文字字段白名单，支持 JSON Schema Draft 2020-12 校验器。

## 1.0.4 布局兼容

青花瓷 · 云山雅韵现为第六套内置风格及新安装默认风格。已经保存的有效风格选择继续保留。BP 卡片仅显示选手 ID，队名元素 `draftTeam` 改为中间的 `.arena-draft-center-team`。所有内置及导入包共用逐局禁用堆叠；本局 Ban 放在最后一行，历史选用按队伍 ID 跟随换边。局内计分板高度为画布的 27.84444%，文字和图标放大，设备画面与 OBS 坐标同步调整。旧素材按新容器尺寸适配，无需重新导入。

## 1.1.1 动态 BP 卡片

当前选人卡片横向放大并以侧色发光边框突出，同侧其他卡片收缩。锁定后收回固定卡位。禁用阶段、等待客户端和最终锁定状态不放大。`cardBlue`、`cardRed` 贴图现在按每张卡片铺设，随卡片尺寸自适应；六套内置和既有导入风格共用此布局，无需重导或更换内容指纹。导出的风格 ZIP 附带新版使用说明。

英雄图由应用共享的三套独立图库提供：`draftCompact`（360×760）、`draftExpanded`（800×800）和 `draftReveal`（1200×426），共 173 位英雄、519 张 WebP。扩大框使用上半身构图。风格包不重复包含英雄素材；Release 另提供 Compact / Expanded / LockReveal 三个素材 ZIP，可单独取用。

锁定特写从英雄卡片展开至本队整侧展示区，3 秒后收回；中央信息与对侧仍保留。特写边框沿用当前风格蓝／红方配色，不叠加额外全画布背景。页面首次载入、重复采样及换位不触发旧锁定动画。

## 1.1.2 团战与赛后伤害

六套内置风格共用团战十人状态栏，底色、边线和伤害框文字使用各包 palette；中立资源计时保持统一的资源识别色。团战保留透明游戏区域，继续将 teamfight 的 background、frame 和 textures 设为 null。

赛后报告新增第三页「伤害对比」，沿用该包 postgame 的背景、装饰框、字体和布局。左右伤害条共用十人最大伤害值，蓝方从左向中间、红方从右向中间延伸。页面 1、2 保留。已有 v1 风格包可直接使用。
