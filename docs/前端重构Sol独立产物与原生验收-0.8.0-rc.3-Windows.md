# Sol 独立产物与原生验收：0.8.0-rc.3 Windows

2026-10-15，独立执行者 GPT-6.1 Sol max。**RC3 新包产物审核 7/7、已有设备 ready 分支正式原生验收 17/17 组通过，均 exit 0；默认录音临时切换后，原六角色值已精确恢复，三个播放角色保持，owned OBS/RiftCast 已退出。** 本结论限下述范围；最终混音实听、真实直播伴侣/观众端和隔离安装仍未验证。Astra 负责实现及正式 runner 修正，父线程负责 Git 和发布；本报告由 Sol 独立签认。

受测二进制构建源码固定为 `eab48e23e624c47fe511dbdefd064f6a6d1fe505`，manifest 为 dirty=false、2207 个源码文件，sourceDigest 为 `5bbf66d75b9c383d5608fc56e6a6f749a1efd3514cd6389a92b7a44c0d10ee3e`。后续报告文档提交与该构建来源分开记录。没有为本轮测试修改产品服务、权限、依赖或媒体实现。

## 源码、产物和历史范围

| 阶段 | 受测源码 | 独立结果 |
| --- | --- | --- |
| 小播放器、节目与事务基线（当时0.7.0） | `e3828b807774af2ee7ae9af18f383c8fb8b66f12` | 可读性22/22、控件/事务/五席8/8、身份历史边界2/2、正式前端安全15/15、相关单测34/34；239受保护源码哈希保持。原始失败与85张PNG保留于原报告 |
| RC1 | `7b1234e8c336a1454e5bad1928f042262368dec2` | 产物7/7、安全包内界面3/3；安全界面阶段OBS启动0 |
| RC2 | `daddc81fc5252f639aced2947cbb9a72fdf82941` | 产物7/7、真实OBS custom 9/9；完整随包原生首跑失败，后续诊断及未跑项保留 |
| RC3 | `eab48e23e624c47fe511dbdefd064f6a6d1fe505` | 新包产物7/7、正式原生已有设备ready分支17/17，短录像只读后验通过，6项draft资产digest核对通过 |

基线的图标范围、普通/压力/缺数据、透明像素、纯黑五行与几何、保存待播不变PGM等详见 [e3828b8独立复验](前端重构独立复验-e3828b8-Windows.md)。无变化的完整浏览器/单测组未重复执行；这些历史结果没有被改写为真实游戏或最终音轨证明。

RC3 `package.json`、lock根和lock根包三处版本均为0.8.0-rc.3。删除这三处version后，515依赖包与root锁对象逐项深比较保持；产品实现delta为空，QA差异仅正式release runner的正向等待及上传回执。66个本地文档链接可读。AST逐项证明原47处assert调用全部保留，新增HTTP201一处，源码共48处调用；**17组是本次ready分支的业务结果，含条件分支的48处源码调用没有被宣称全部在运行时执行。** 证据见 [版本和断言核对](evidence/sol-release-windows/rc3/version-audit.json)。

| RC3文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| Setup-x64.exe | 290409455 | `2dda5ff00d7ce86b1e3139de12c01ce9bcb2ed774d8ddcfcdc72f94e80a35210` |
| Windows-x64.zip | 389572247 | `eb10d8e1a827f335c1ebb982794a71e23316f19238af06b15ca89de97f106d32` |

其余产物值见 [产物审核JSON](evidence/sol-release-windows/rc3/artifact-audit.json)。本次构建由父线程正式执行release:win、exit0，Sol从新产物独立只读审核。未运行任何NSIS安装、升级、卸载；旧0.5登记和可用安装隔离环境缺口继续保留。

## 产物审核与真实包内运行

在独立Windows clone `E:\codexdata\lolob-release-20261014` 运行 `node verification-output/release-0.8.0-rc.3/audit-artifacts.mjs`，exit0、7/7，全部本次实际执行，没有复用旧包通过缓存。新树外ZIP目录为 `E:\codexdata\lolob-artifact-0.8.0-rc.3-ax1tYg\zip`。

七组覆盖源码全部哈希/clean来源与产物校验和、7-Zip完整性/路径安全、三份payload逐文件对照、元数据版本、包内生产模块及真实sharp原生加载、OBS/native/source/许可材料、PE架构及用户状态排除。5个服务外部依赖均从包内解析；sharp0.35.5实际加载Windows x64原生模块并生成3×2PNG。OBS32.2.2标记及5个关键runtime文件、对应完整OBS源码、未经修改的VB-CABLE Pack45原归档、自有native源码/二进制及现有GPL/来源说明哈希均核对。该范围没有被扩写为所有第三方材料的法律审查。

ZIP有7067文件，NSISpayload和打包完成的win-unpacked各7068。唯一精确目标差异是 `resources/elevate.exe`，107520B、SHA-256 `9b1fbf0c11c520ae714af8aa9af12cfd48503eedecd7398d8992ee94d1b4dc37`；缓存原件、NSIS和win-unpacked字节相同。锁定app-builder-lib26.15.3的NSIS默认复制逻辑与allowElevation=false分别核对；其余7067文件全部字节一致。真实ZIP运行不需要该helper。RC1首次要求三树完全相同的失败保留于 [原始产物首错](evidence/sol-release-windows/rc1/artifact-audit-first.json)，此后加入精确来源断言，未修改包或泛化忽略其他差异。RC3审核JSON中继承的首错引用指该RC1历史原件。

独立Get-AuthenticodeSignature实查：RC3 Setup与RiftCast.exe均 **NotSigned**，obs64.exe为 **Valid / OBS Project, LLC**，见 [签名原始JSON](evidence/sol-release-windows/rc3/signatures-independent.json)。builder的signing日志没有被当作签名成功。

RC1实际安全包内界面3/3另保留：系统目录PATH、独立userdata、OBS_AUTOSTART0、AUTOCONNECT0、external、LAN0；真实应用/菜单/帮助/health版本一致，保存场景只待播不改变PGM，退出重启保留。首跑帮助locator“帮助与诊断”与实际“使用指南”不符，测试修正后通过；首错与成功原件均在 [RC1最终结果](evidence/sol-release-windows/rc1/safe-package-ui.json)。

## 正式原生执行与安全边界

本次正式runner文件SHA-256为 `e9de8dd4933bb77aec23cc821a7c93c9946819a6dfdf782e6d4c203440bfe111`，与清洁源码一致。执行直接由独立wrapper调用clone的 `scripts/verify-release.mjs --reuse-drivers-only`，未复制改写正式runner、未重试业务动作、未新增skip。

实际外层命令如下；Playwright显式使用现有Windows模块，应用PATH由正式runner限制为系统目录。

```powershell
$env:NODE_OPTIONS='--import=file:///E:/codexdata/lolob-release-20261014/verification-output/release-0.8.0-rc.3/observe-native-http.mjs'
node 'E:\codexdata\lol导播软件\verification-output\release-transport\capture-fixture\with-capture-fixture.cjs' --expected-source 'eab48e23e624c47fe511dbdefd064f6a6d1fe505' --executable 'E:\codexdata\lolob-artifact-0.8.0-rc.3-ax1tYg\zip\RiftCast.exe' --playwright 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs' --target-capture-id '{0.0.1.00000000}.{aacac89b-1344-4a48-aa7e-30e13191c692}' --target-capture-name 'Microphone (EMEET SmartCam C60E 4K)'
```

用户单独授权3个默认录音角色暂由CABLE Output切到已有EMEET，结束精确恢复，3个render角色保持。独立审核的capture-only helper只允许active EMEET/base-CABLE capture，expected-current精确核对，不调用render、驱动安装、注册、RunAs、UAC、重启或推流。wrapper先保存6角色、每步与监控核对render、finally逐项恢复并读回6原值，且绑定清洁源码及包内来源。源码、编译证明、原包装和修后包装保留于 [wrapper证据](evidence/sol-release-windows/rc3/capture-wrapper/with-capture-fixture.cjs)。

首次wrapper前置发现Windows角色联动：role0写入会同时改变role1；旧wrapper随后严格要求role1仍为原CABLE而退出，尚未启动RiftCast/OBS。真实finally已恢复6原值、render未变。保留 [首次失败与恢复](evidence/sol-release-windows/rc3/capture-defaults-J3lSkE/capture-defaults-audit.json)。修后仅接受当前值为原值或同一获准target，已是target时记录并不重复写，最终目标/恢复断言保持；原包装按记录的SHA完整还原并核对一致。

修后wrapper SHA-256为 `0d1c61c5c9f89e5943e010d5f50823c5da33f9a1f35a9f969dd5c5c81375a877`，helper为 `326d3293e76f220ba586a77d2d1e918480304432cc11de6b7d8549e6d8892308`。Sol独立6项VM模拟覆盖正常/子失败/部分写后失败、角色联动及单角色恢复错误仍继续其余角色；明确属于模拟。随后真实一次正式验收完成，外层exit0、childcode0，restorationVerified=true、errors空，前后6角色逐项完全相同；该实际证明见 [真实恢复审计](evidence/sol-release-windows/rc3/capture-defaults-BSQt8k/capture-defaults-audit.json)。当前owned OBS/RiftCast均已退出。

正式安全helper为Node API与浏览器context同时拒绝设备prepare/install/register及stream配置/启动，应用HTTP限loopback（ENABLE_LAN0），隔离APPDATA/LOCALAPPDATA/TEMP/TMP，去除继承的RIFTCAST/Electron/Node覆盖。真实OBS只使用fixture配置和不存在LoL的专用窗口输入；桌面默认音频获授权，麦克风保持静音。录制前GetRecordDirectory的realpath严格等于该fixture的user-data/data/videos。没有触及用户真实OBS配置、赛事或录像。

被动观察层SHA和代码随证据保留，只记录browser/QA Node的cameras、music、output及monitor等请求method/path/时间/status/脱敏error，不记录body、headers、query，不重试或改响应。安全env清除了Electron/OBS子环境的NODE_OPTIONS；Electron main自己发出的http.request monitor不受该观察层覆盖。实际摄像头枚举GET200先于音乐POST201；两个活动输出更改请求400是原保护断言的预期拒绝。此次未观察到引擎busy400，时序原件见 [HTTP时间线](evidence/sol-release-windows/rc3/native-http-24000.jsonl)。

## 本次17组通过与实际像素

[正式smoke-report原件](evidence/sol-release-windows/rc3/smoke-report.json) 记录17组、errors0、blockedRequests0：树外打包版本/迁移与原文件保留；真实OBS32.2.2连接；真实图片上传和待播保存；可见原生PGM投影；真实WAV导入/默认暂停及播放暂停；既有camera/CABLE端点只读复用；伴侣启动且保护活动来源/目标；真实1920×1080摄像头像素/PVW隔离/TAKE；伴侣视频持续时开始停止录制；活动输出关闭确认并取消；深浅主题不变节目颜色；按住停止及RTMP/伴侣目标选择；重复EXE；正常退出owned服务/投影；重启后的设备比对；重启所有输出停止；场景与迁移持久化。

摄像头通过Windows媒体设备实际接收OBS Virtual Camera。蓝PGM样本为[24,79,146,255]、15帧；保存红色待播并预监后仍蓝、40帧；TAKE后红[162,25,34,255]、50帧，尺寸1920×1080，媒体设备报告约30fps。virtualCameraFrameVerified=true；截图 [实际摄像头帧](evidence/sol-release-windows/rc3/virtual-camera-program.png) 已人工审阅。深浅输出页截图均人工查看，按钮、独立停止/录制状态和PGM名称可读；原生/媒体帧证据与HTML界面截图分别记录。

unavailable音频分支本轮未触发，旧安装准备分支受reuse-drivers-only排除；没有把条件未触发写成新增skip。camera/driver单测中的模拟执行属于较早34项测试，不能替代这里的实际设备帧。`companionAudioVerified`、liveGameVerified、liveStreamVerified仍为false；未做最终音轨实听、真实直播伴侣/观众端或长时稳定性验收。

RC2正式custom的9组为独立历史原生结果，源码daddc81：真实窗口枚举、UI分层图片/窗口、保存待播不变PGM、OBS蓝[24,79,146]/绿[74,160,105]实际像素、Enter TAKE、待播编辑/刷新、窗口关闭TAKE保护、回内置场景及删场景保留资产。0页面异常/禁止请求、owned退出，无录制。蓝绿OBS截图与dark/light/1366编辑器三图均人工查看；编辑器窗口占位没有被当作真实捕获。原件见 [custom report](evidence/sol-release-windows/rc2/custom-scenes/report.json)。该无变化脚本未对RC3重复运行。

## 录像文件只读后验

正式runner证明录制状态及目录。本次另清点并保留唯一fixture文件 `2026-10-15 17-02-11.mkv`，77063B、SHA-256 `7ba376c5432c713f0c5709e6ca4309dfe1b465961797738cfc6a4eb656a66aa1`。EBML元数据：Matroska0.133秒，H2641920×1080视频一轨，AAC48kHz/双声道音频一轨。

系统PATH无ffprobe/ffmpeg，未安装工具。使用已有Chrome headless、--mute-audio、video.muted=true/volume0，实际得到2次frame callback/3个解码视频帧，红像素[187,28,40,255]；只读后验exit0，见 [媒体审计](evidence/sol-release-windows/rc3/recording-readonly-audit.json)。首次file://跨源canvas限制导致读取像素失败，原件保留；改为只服务该fixture的loopback只读viewer后通过，没有放宽浏览器权限。此极短样本没有证明长录稳定性、完整音轨内容或实听。录像只留本机fixture，不入Git/Release。

## 首错保留、归因与未验证项

| 原始尝试 | exit及范围 | 分类与当前结论 |
| --- | --- | --- |
| RC1三payload严格等值 | exit1 | 仅NSIS helper有来源的精确目标差异；原件保留，未改包 |
| RC1安全UI帮助locator | exit1，后修测试3/3 exit0 | 旧名称与实际“使用指南”不符；测试定位修正 |
| RC2正式native首跑 | exit1，4组过后音乐超时 | 首错完整保留，后续分支当时未跑 |
| RC2被动诊断1 | exit1，OBS GetRecordDirectory207 | connected早于初始化结束；runner正向就绪条件不足，RC3加强 |
| RC2就绪诊断 | exit1，音乐HTTP400 | scoped fileinput disabled时setInputFiles仍触发；等enabled后真实POST201及音乐组通过，RC3新增201断言 |
| RC2 enabled诊断 | exit1，6组过 | 默认capture为CABLE，产品回采保护拒绝；授权EMEET临时切换后RC3实际ready分支通过 |
| RC2独立尾部 | exit1，2前置过，正常enabled录制点击400 | **待归因。** 有cameras探测时间关联，未实证具体锁持有者；产品未修改，不能称修掉潜在竞争。RC3本次完整运行未复现，不外推永不发生 |
| RC3 wrapper首次前置 | exit1，无app/OBS启动 | Windows录音角色联动与包装严格原值假设不符；6角色真实恢复过，修独立包装后正式一次native通过 |
| RC3录像只读首跑 | exit1，metadata可读，canvas受file同源限制 | 读取器测试来源问题；限定loopbackviewer后静音解码通过，首错保留 |

RC2各次原件分别在 [首跑](evidence/sol-release-windows/rc2/smoke-report-first.json)、[207诊断](evidence/sol-release-windows/rc2/music-diagnostic/smoke-report.json)、[音乐400诊断](evidence/sol-release-windows/rc2/music-diagnostic-ready/music-diagnostics.json)、[CABLE环境诊断](evidence/sol-release-windows/rc2/music-diagnostic-enabled/smoke-report.json)、[录制400尾部](evidence/sol-release-windows/rc2/independent-tail-report.json)。原版本失败结果没有被成功结果覆盖。

本轮仍无NSIS隔离安装/升级/卸载留数据、最终混音实听/接收路由完整性、真实LoL/LCU/OCR、真实手机键盘、真实直播伴侣/观众端或长时稳定性通过结论。设备不可访问分支和驱动安装分支本次未执行；禁止安装/注册/UAC/重启/真实推流一直保持。CompanionAudio.stop恢复托管monitor/tracks；prepare对受管default采集源的device_id钉选可保留，不能称停止即恢复Windows默认值。本轮Windows六角色恢复由独立wrapper另行实际证明。

## GitHub草稿六资产独立核对与证据清单

2026-10-15独立通过已认证只读 `gh api -H 'Accept: application/vnd.github+json' repos/QShin21/lolob/releases/413608496`，exit0。官方API当时返回tag v0.8.0-rc.3、target eab48e23...、draft=true、prerelease=true、6资产均uploaded；逐项ingestion SHA-256与本地新计算hash/大小唯一匹配，总680580422B。README-zh-CN.md与本地使用说明.md字节相同。没有重新下载390MB ZIP；此结果证明审计时草稿资产一致，发布状态随后可变。见 [API原始JSON](evidence/sol-release-windows/rc3/release-api-independent.json) 与 [六资产审计](evidence/sol-release-windows/rc3/remote-assets-independent-audit.json)。

公开证据为显式allowlist的原字节report/script/log/exit及人工查看的必要PNG；清单见 [evidence-manifest.json](evidence/sol-release-windows/evidence-manifest.json)。不含fixture OBS密码/config、seat session、整个userdata/runtime/native目录或录像。完整本机fixture和全部失败继续保留于独立clone的verification-output。新prefix按scoped -text及CR-at-EOL规则保真，原有baseline证据清单保持。Sol已于2026-10-15T09:18:09Z以git cat-file --batch独立读取Git index，134项原件与manifest共135个blob的字节数和SHA全部匹配；独立MD按正常CRLF→LF规则核对正文一致。随后仅追加本次公开状态与该核验事实，134项原件和清单保持。本报告不执行提交或推送。

公开后追加核对（2026-10-15T09:20:11.652Z）：Sol再次只读官方API确认[RC3 pre-release](https://github.com/QShin21/lolob/releases/tag/v0.8.0-rc.3)已公开，draft=false、prerelease=true，published_at=2026-10-15T09:18:38Z；tag对象类型commit、直接指向eab48e23e624c47fe511dbdefd064f6a6d1fe505，6资产ID/文件名/大小/digest与原草稿快照逐项相同。后验API原始JSON与release-publication-independent-audit.json保留在独立clone的verification-output/release-0.8.0-rc.3；原公开证据中的draft=true仍表示当时事实，未改写134项原件或manifest。

独立结论：在已授权、已测范围内，RC3产物和已有设备ready路径可签认。需要保留RC2录制busy待归因及上述现场/安装缺口；没有依据要求改产品实现来通过本次测试，也没有把候选验收扩写为完整稳定版或观众端通过。
