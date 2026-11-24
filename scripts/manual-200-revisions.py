"""The 2.0.0 cover, visual changes, and affected copy in the 1.7.0 chapters."""

# Page 3 is new. Inherited cross-references point to the shifted chapters.
def shift_reference(match):
    first = int(match[1]) + 1
    last = f'–{int(match[2]) + 1}' if match[2] else ''
    return f'<a href="#p{first}">第 {first}{last} 页</a>'


for item in pages[2:]:
    item['body'] = re.sub(r'第 (\d+)(?:–(\d+))? 页', shift_reference, item['body'])

icon = base64.b64encode((ROOT / 'brand' / 'guanlan-icon.svg').read_bytes()).decode()
pages[0].update(
    title='观澜 2.0.0 用户使用手册',
    lead='适用于 Windows x64',
    body='<div class="cover-brand"><img src="data:image/svg+xml;base64,' + icon
    + '" alt="观澜应用图标"><div><div class="cover-wordmark">GUANLAN</div>'
    + '<div class="cover-sub">英雄联盟赛事导播</div></div></div>'
    + fig('studio', '观澜 2.0.0 导播工作台 · 演播室暗场')
    + p('观澜取自《孟子》“观水有术，必观其澜”。观赛时，从每一波攻守读懂局势变化。')
    + p('从比赛准备、BP 与节目制作，到直播输出、赛后归档和团队协作。主控端统一推流，协作者通过局域网或可达公网地址加入。')
    + box('开始阅读', '本版视觉变化见<a href="#p3">第 3 页</a>。首次演练见<a href="#p4">第 4 页</a>，开播检查见<a href="#p36">第 36 页</a>，团队协作见<a href="#p44">第 44–47 页</a>。'))

pages[1]['body'] = (
    p('操作说明与章节承接 1.7.0 手册。2.0.0 刷新了工作台、应用图标和安装外观。操作流程、快捷键与数据格式沿用 1.7.1。')
    + p('工作台截图及裂隙曜金节目示例取自 2.0.0 隔离实例，队伍和对局使用测试资料。历史节目示例沿用 1.0.2，更新弹窗沿用 1.6.0 手册截图。协作会话与监看图沿用 1.7.0 两套隔离实例和真实 OBS 的联调画面，其中 TEAM OBS 与移动方块为合成测试视频。部分旧版截图显示曾用名称。')
    + table(['页码', '内容'], [
        ['3', '2.0.0 工作台主题、Tally、应用图标与裂隙曜金'],
        ['4–7', '快速演练、安装启动、工作台与播控'],
        ['8–15', '队伍、比赛、BP、十人数据和经济资源'],
        ['16–21', '节目场景、风格与自定义场景'],
        ['22–30', '画面、声音、输出、录制、回放与协作概览'],
        ['31–38', '赛后、排障、快捷键、检查表与客户端连接'],
        ['39–43', '自动更新、赛事中心、图形风格、镜头及扩展功能'],
        ['44–47', '团队组建、局域网与公网、协作者操作、恢复与排障']])
    + box('阅读方式', '页码可点击跳转。方括号和引号表示界面名称，“→”表示依次进入。网页版图像可点击查看原图。团队成员先核对预监与回执，再由主控端检查 PGM 和平台接收。'))

for index in (2, 3, 28, 36, 42):
    pages[index]['body'] = pages[index]['body'].replace('1.6.0', '2.0.0').replace('1.7.0', '2.0.0')
pages[3]['body'] = pages[3]['body'].replace(
    '安装后的 2.0.0 可从顶部“检查更新”获取后续正式版本。', '1.6.0 及以上版本可从顶部“检查更新”获取后续正式版本。'
).replace(
    '停止推流、录制及节目输出，退出旧版后运行安装包。', '观澜原名 RiftCast。停止推流、录制及节目输出后退出旧版并覆盖安装，继续使用原数据目录。'
).replace(
    '随后从桌面或开始菜单启动。', '随后从桌面或开始菜单打开“观澜导播”。'
).replace(
    '完整解压已有 Windows x64 便携包', '完整解压 GuanLan-2.0.0-Windows-x64.zip'
)
pages[16]['body'] = pages[16]['body'].replace(
    '六套内置风格包括冰川极光、曜金典藏、霓虹脉冲、朱砂墨韵、瓷白竞速和青花瓷 · 云山雅韵',
    '七套内置风格包括冰川极光、曜金典藏、霓虹脉冲、朱砂墨韵、瓷白竞速、青花瓷 · 云山雅韵和裂隙曜金'
)
pages[16]['body'] = re.sub(
    r'^<figure.*?</figure>', lambda _: fig('style-manager', '图 12　选择裂隙曜金后，右下角可准备到预监', 'style-manager-figure'),
    pages[16]['body'], count=1
)
pages[35]['body'] = pages[35]['body'].replace(
    '本版对应 RiftCast 1.7.0', '本版对应观澜 2.0.0'
).replace('1.7.0 本次验证覆盖', '1.7.0 的协作联调覆盖')
for index, caption, revised in [
    (37, '图 27　桌面客户端应用更新入口', '图 27　桌面客户端更新弹窗（1.6.0 手册截图，显示曾用名称）'),
    (43, '主控端会话和共享设置；合成视频用于联调验证', '1.7.0 主控端会话和共享设置（显示曾用名称，真实 OBS 联调）'),
    (44, '主控画面、协作视角和切换回执；合成测试视频', '1.7.0 主控画面、协作视角和切换回执（显示曾用名称，真实 OBS 联调）'),
]:
    pages[index]['body'] = pages[index]['body'].replace(caption, revised)

# Update inherited display copy while preserving literal installer, executable and data paths.
inherited_brand_copy = {
    '打开 RiftCast，': '打开观澜，',
    'RiftCast 包装边界': '观澜包装边界',
    '1920 × 1080 RiftCast HUD 浏览器来源': '1920 × 1080 的 HUD 浏览器来源',
    '停止 RiftCast RTMP': '停止观澜的 RTMP 推流',
    'RiftCast 内置 OBS': '观澜内置的 OBS',
    '重新打开 RiftCast 和伴侣': '重新打开观澜和直播伴侣',
    '停止 RiftCast 伴侣音画': '停止观澜的伴侣音画',
    '各自电脑的 RiftCast 中': '各自电脑的观澜中',
    'RiftCast 的技术暂停': '观澜的技术暂停',
    '自己的 RiftCast 中': '本机的观澜中',
}
for item in pages[2:]:
    for old, new in inherited_brand_copy.items():
        item['body'] = item['body'].replace(old, new)

pages.insert(2, dict(
    title='2.0.0 工作台与节目的视觉变化',
    lead='控制台焕新，比赛制作与播出步骤沿用 1.7.1。',
    group='开始使用',
    body=table(['变化', '在工作台中使用'], [
        ['深浅主题', '深色为「演播室暗场」，浅色为「日光」。在“连接与输出 → 工作台外观”的“系统外观”中选择，也可点击左栏底部的太阳或月亮图标。主题自动保存，节目继续使用风格包配色。'],
        ['Tally 信号色', '<b class="pgm">红色 PGM</b> 表示正在播出，<b class="pvw">绿色 PVW</b> 表示预监。在双监视器、场景卡片和底部固定栏核对对应标签。'],
        ['应用图标', '在桌面、任务栏和安装程序中，可通过封面所示图标识别观澜。'],
    ])
    + fig('appearance-light', '浅色「日光」下的系统外观选项', 'theme-figure')
    + p('<b>裂隙曜金</b>（rift-signature）是第七套内置节目风格。按“场景库 → 风格包 → 选择裂隙曜金 → 准备到预监 → TAKE”操作。先确认 PVW 已加载新风格，再由主导播切入并核对 PGM。')
    + fig('scene-rift-signature', '裂隙曜金 · 首发对位节目输出（隔离测试资料）', 'signature-figure'),
))

brand_css = """
body{background:#eef1f5;color:#172131}
.sheet h2{color:#0f1b2d}
.kicker,.cover-wordmark{color:#7d5f17}
.lead,figcaption,.footer{color:#4d5d73}
.cover-brand{display:flex;gap:5mm;align-items:center;border-top:2px solid #b79756;padding-top:5mm;margin:5mm 0 6mm}
.cover-brand img{width:25mm;height:25mm}
.cover-wordmark{margin:0 0 1mm;font-size:32px;font-weight:800;letter-spacing:.12em}
.cover-sub{margin:0;font-size:18px}
th{background:#eef1f5;color:#0f1b2d}
#p3 th:first-child{width:27mm}
#p5 th:first-child{width:20mm}
.note{background:#f5f4ee;border-left-color:#b79756}
a{color:#0a67a3}
.content b.pgm{color:#c01f37}
.content b.pvw{color:#0a704b}
.theme-figure img{border-color:#cfd7e2}
.signature-figure img{width:135mm;max-width:100%;margin-inline:auto;background:#070b12}
.signature-figure figcaption{text-align:center}
.style-manager-figure img{width:auto;max-width:100%;max-height:110mm;margin-inline:auto}
@media print{body{background:#fff}.content a{color:#0a67a3}figure a{pointer-events:none}}
"""
