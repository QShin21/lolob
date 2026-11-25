"""The 2.1.0 cover, visual changes, and affected copy in the 1.7.0 chapters."""

# Page 3 sits before the inherited chapters. Link their shifted page references.
def shift_reference(match):
    first = int(match[1]) + 1
    last = f'–{int(match[2]) + 1}' if match[2] else ''
    return f'<a href="#p{first}">第 {first}{last} 页</a>'


for item in pages[2:]:
    item['body'] = re.sub(r'第 (\d+)(?:–(\d+))? 页', shift_reference, item['body'])

icon = base64.b64encode((ROOT / 'brand' / 'guanlan-icon.svg').read_bytes()).decode()
pages[0].update(
    title='观澜 2.1.0 用户使用手册',
    lead='适用于 Windows x64',
    body='<div class="cover-brand"><img src="data:image/svg+xml;base64,' + icon
    + '" alt="观澜应用图标"><div><div class="cover-wordmark">GUANLAN</div>'
    + '<div class="cover-sub">英雄联盟赛事导播</div></div></div>'
    + fig('studio', '观澜 2.1.0 导播工作台 · 墨与信号')
    + p('观澜取自《孟子》“观水有术，必观其澜”。观赛时，从每一波攻守读懂局势变化。')
    + p('从比赛准备、BP 与节目制作，到直播输出、赛后归档和团队协作。主控端统一推流，协作者通过局域网或可达公网地址加入。')
    + box('开始阅读', '本版视觉变化见<a href="#p3">第 3 页</a>。首次演练见<a href="#p4">第 4 页</a>，开播检查见<a href="#p36">第 36 页</a>，团队协作见<a href="#p44">第 44–47 页</a>。'))

pages[1]['body'] = (
    p('章节与操作说明沿用 2.0.0 手册。2.1.0 重做了导播工作台界面，操作流程、快捷键与数据格式保持不变。')
    + p('工作台截图从 2.1.0 隔离实例重新截取，队伍和对局使用测试资料。历史节目示例沿用 1.0.2，更新弹窗沿用 1.6.0 手册截图。协作会话与监看图沿用 1.7.0 两套隔离实例和真实 OBS 的联调画面，其中 TEAM OBS 与移动方块为合成测试视频。部分旧版截图显示曾用名称。')
    + table(['页码', '内容'], [
        ['3', '2.1.0 界面变化'],
        ['4–7', '快速演练、安装启动、工作台与播控'],
        ['8–15', '队伍、比赛、BP、十人数据和经济资源'],
        ['16–21', '节目场景、风格与自定义场景'],
        ['22–30', '画面、声音、输出、录制、回放与协作概览'],
        ['31–38', '赛后、排障、快捷键、检查表与客户端连接'],
        ['39–43', '自动更新、赛事中心、图形风格、镜头及扩展功能'],
        ['44–47', '团队组建、局域网与公网、协作者操作、恢复与排障']])
    + box('阅读方式', '页码可点击跳转。方括号和引号表示界面名称，“→”表示依次进入。网页版图像可点击查看原图。团队成员先核对预监与回执，再由主控端检查 PGM 和平台接收。'))

for index in (2, 3, 28, 36, 42):
    pages[index]['body'] = pages[index]['body'].replace('1.6.0', '2.1.0').replace('1.7.0', '2.1.0')
pages[3]['body'] = pages[3]['body'].replace(
    '安装后的 2.1.0 可从顶部“检查更新”获取后续正式版本。', '1.6.0 及以上版本可从顶部“检查更新”获取后续正式版本。'
).replace(
    '停止推流、录制及节目输出，退出旧版后运行安装包。', '观澜原名 RiftCast。停止推流、录制及节目输出后退出旧版并覆盖安装，继续使用原数据目录。'
).replace(
    '随后从桌面或开始菜单启动。', '随后从桌面或开始菜单打开“观澜导播”。'
).replace(
    '完整解压已有 Windows x64 便携包', '完整解压 GuanLan-2.1.0-Windows-x64.zip'
)
pages[16]['body'] = re.sub(
    r'^<figure.*?</figure>', lambda _: fig('style-manager', '图 12　选中风格后预览效果，可在右下角准备到预监', 'style-manager-figure'),
    pages[16]['body'], count=1
)
pages[35]['body'] = pages[35]['body'].replace(
    '本版对应 RiftCast 1.7.0', '本版对应观澜 2.1.0'
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

pages[2]['body'] = pages[2]['body'].replace(
    '看 PVW 标签和“下一次切入”变化。', '看底部播出条右端的 PVW 场景和待播变化。'
).replace(
    '核对实际 PVW 合成，点击 <b>切入节目</b> 或按 <b>Ctrl+Enter</b>。检查回执、PGM 内容和节目版本；',
    '核对实际 PVW 合成，点击底部播出条右端的 <b>切入节目</b> 或按 <b>Ctrl+Enter</b>。在播出条左端检查回执和节目版本，再核对 PGM 画面；'
)
pages[4]['body'] = pages[4]['body'].replace(
    '<td>顶部</td><td>当前节目比赛身份、蓝红方、比分、局号、席位与同步状态。</td>',
    '<td>顶栏</td><td>左侧是页面标题，中部比分可打开赛事资料，右侧是席位、同步和应用操作。新设备的“开始引导”也在这里。</td>'
).replace(
    '导播台、BP 阵容、数据、赛事、输出、收尾、帮助；底部切换工作台深浅主题。',
    '导航按钮依次显示“导播台”“BP 阵容”“数据”“赛事”“输出”“收尾”“帮助”。左栏底部可切换工作台主题。'
).replace(
    '<tr><td>监视器下方</td><td>节目回执、节目版本、待播差异和切入按钮。失败原因会在这里或通知中出现。</td></tr>',
    ''
).replace(
    '<td>底部固定栏</td><td>跨页查看 PGM/PVW、RTMP、摄像头、节目声音及 REC；可回到比赛或技术暂停。</td>',
    '<td>底部播出条</td><td>左端查看 PGM 场景、回执与节目版本；中间查看 RTMP、摄像头、节目声音及 REC，可回到比赛或技术暂停；右端查看 PVW、待播变化并切入节目。</td>'
)
pages[5]['body'] = pages[5]['body'].replace(
    '查看保存回执和底部待播变化。', '查看保存回执，并点击底部播出条右端的待播变化查看明细。'
).replace(
    '当前主导播点击“切入节目”。', '当前主导播点击底部播出条右端的“切入节目”。'
).replace(
    '检查“节目回执”：请求已送达后还要看 OBS 应用结果。',
    '查看播出条左端的节目回执：请求已送达后还要看 OBS 应用结果。'
).replace(
    '需要人工核对的项目按实际看到的结果确认。',
    '在播出条的“核对 / 应急”中按实际音画确认。'
)
pages[32]['body'] = pages[32]['body'].replace('检查应用回执。', '检查底部播出条左端的应用回执。')

pages.insert(2, dict(
    title='2.1.0 界面变化',
    lead='全新工作台界面，沿用原有比赛制作与播出步骤。',
    group='开始使用',
    body=table(['变化', '在工作台中使用'], [
        ['新设计「墨与信号」', '界面骨架使用墨与纸两种无彩色，色相只表示信号：<b class="pgm">朱砂红 PGM</b>、<b class="pvw">石绿 PVW</b>、琥珀待处理，以及蓝红两队。'],
        ['深色「墨」与浅色「素」', '在“连接与输出 → 工作台外观 → 系统外观”中选择，或点击左栏底部的太阳／月亮按钮。主题自动保存，节目输出保留风格包配色。'],
        ['切入节目的位置', '所有页面的“切入节目”（TAKE）都在底部播出条右端，紧邻左侧 PVW 场景和“N 类待播变化”。点击待播变化可查看下次切入将应用的内容。播出条最左端显示 PGM 场景、回执和节目版本。快捷键仍是 <b>Ctrl+Enter</b>。'],
        ['页面标题与比分', '页面标题在顶栏左侧，当前比赛比分在顶栏中部。点击比分可打开赛事资料。'],
        ['应用图标', '新标志由朱砂圆点和两道水纹组成。可通过封面所示图标识别桌面、任务栏及安装程序中的观澜。'],
    ])
    + fig('appearance-light', '浅色「素」下的系统外观选项')
    + fig('deck', '底部播出条：PGM 回执、输出状态、应急操作与切入节目'),
))

brand_css = """
body{background:#eef0f2;color:#15171a}
.sheet h2,.sheet h3,.kicker,.cover-wordmark{color:#15171a}
.lead,figcaption,.footer{color:#43474e}
.cover-brand{display:flex;gap:5mm;align-items:center;border-top:2px solid #15171a;padding-top:5mm;margin:5mm 0 6mm}
.cover-brand img{width:25mm;height:25mm}
.cover-wordmark{margin:0 0 1mm;font-size:32px;font-weight:800;letter-spacing:.12em}
.cover-sub{margin:0;font-size:18px}
th{background:#eef0f2;color:#15171a}
#p3 th:first-child{width:34mm}
#p5 th:first-child{width:20mm}
.note{background:#f6f7f8;border-left-color:#858991}
a,.toc a{color:#1d5abb}
.content b.pgm{color:#c02e18}
.content b.pvw{color:#0d7239}
figure img{border-color:#d1d4d9}
.style-manager-figure img{width:auto;max-width:100%;max-height:110mm;margin-inline:auto}
@media print{body{background:#fff}.content a{color:#1d5abb}figure a{pointer-events:none}}
"""
