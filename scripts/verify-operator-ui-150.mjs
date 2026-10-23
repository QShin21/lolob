// Built operator UI against its own disposable HTTP service. Synthetic data is
// labelled in the report; no live client, OBS, media device or platform is used.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const evidence = path.join(root, 'verification-output', 'operator-ui-1.5.0');
await mkdir(evidence, { recursive: true });
const { createFixture } = await tsImport('../server/test-support/fixture.ts', import.meta.url);
const { ensureProduction, captureProgram } = await tsImport('../shared/production.ts', import.meta.url);
const seed = createFixture();
seed.paused = true;
seed.phase = 'draft';
ensureProduction(seed).draftMode = 'manual';
seed.match.title = '2026 峡谷邀请赛 · 秋季冠军争夺战 · 完整操作验收样本';
for (let n = 4; n < 8; n++) seed.teams.push({ ...structuredClone(seed.teams[n % 4]),
  id: `fixture-team-${n}`, name: ['风起云涌电子竞技俱乐部', '极光之翼', '远山征途', '破晓新星'][n - 4],
  tag: `T${n + 1}`, players: seed.teams[n % 4].players.map((p, i) => ({ ...p, id: `fixture-team-${n}:${i}` })) });
for (const team of seed.teams) for (const [index, player] of team.players.entries()) player.account = `${team.tag}Player${index + 1}`;
for (const match of seed.schedule) match.title = `UI 验收 · ${match.title}`;
seed.assets = Array.from({ length: 20 }, (_, i) => ({ id: `fixture-asset-${i}`, name: `赛事素材 ${String(i + 1).padStart(2, '0')} · ${i % 2 ? '选手定妆照' : '赛季赞助与品牌'}`,
  url: `/uploads/operator-fixture-${i}.svg`, type: 'image/svg+xml', createdAt: new Date().toISOString(), width: 320, height: 180, category: ['logo', 'player', 'sponsor', 'other'][i % 4] }));
ensureProduction(seed).program = captureProgram(seed);
const dataDir = await mkdtemp(path.join(tmpdir(), 'riftcast-operator-ui-150-'));
await mkdir(path.join(dataDir, 'uploads'));
for (const [i, asset] of seed.assets.entries()) await writeFile(path.join(dataDir, 'uploads', path.basename(asset.url)),
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${['#163253', '#294d4c', '#55354d', '#2e3f64'][i % 4]}"/><circle cx="256" cy="36" r="82" fill="#ffffff" opacity=".08"/><text x="24" y="102" fill="white" font-family="sans-serif" font-size="36">RIFT ${String(i + 1).padStart(2, '0')}</text></svg>`);
await writeFile(path.join(dataDir, 'state.json'), JSON.stringify(seed));
const port = 52000 + Math.floor(Math.random() * 10000), base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: root, windowsHide: true,
  env: { ...process.env, PORT: String(port), ENABLE_LAN: '0', RIFTCAST_DATA_DIR: dataDir,
    RIFTCAST_AUTO_CONNECT: '0', RIFTCAST_OBS_AUTOSTART: '0', RIFTCAST_OFFLINE: '1' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
const checks = [], screenshots = [], measurements = [], contrast = [], errors = [], actionLog = [];
let browser, page;
const until = async (check, label) => { for (let n = 0; n < 100; n++) { if (await check()) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };
const state = () => fetch(base + '/api/state').then(r => r.json());
const passed = (id, detail, data = {}) => { checks.push({ id, status: 'passed', detail, ...data }); console.log(`${id}: ${detail}`); };
const shot = async (name, target = page, fullPage = false) => { const file = `${name}.png`; await target.screenshot({ path: path.join(evidence, file), fullPage }); screenshots.push(file); return file; };
const freezeMotion = target => target.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
const fits = async (label, target = page) => assert.equal(await target.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${label}: root horizontal overflow`);
const route = async label => { await page.locator('.control-rail').getByRole('button', { name: label, exact: true }).click(); await page.getByText('正在载入页面…', { exact: true }).waitFor({ state: 'hidden' }); };
const setTheme = async (theme, target = page) => {
  if (await target.locator('html').getAttribute('data-ui-theme') !== theme) {
    await target.evaluate(value => { localStorage.setItem('riftcast-ui-theme', value); window.dispatchEvent(new StorageEvent('storage', { key: 'riftcast-ui-theme', newValue: value, storageArea: localStorage })); }, theme);
  }
  await until(async () => await target.locator('html').getAttribute('data-ui-theme') === theme, `theme ${theme}`);
};
const settingsTask = async id => { await page.locator(`#settings-nav-${id}`).click(); await page.locator('.settings-task-scroll').evaluate(el => el.scrollTo(0, 0)); };
const inViewport = async (locator, label, bottom = 0) => {
  const box = await locator.boundingBox(), size = locator.page().viewportSize();
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height - bottom + 1, `${label}: outside viewport ${JSON.stringify(box)}`);
  return box;
};
const sampleContrast = async (locator, label, theme) => {
  await locator.waitFor({ state: 'visible' });
  const value = await locator.evaluate(el => {
    const rgb = v => (v.match(/[\d.]+/g) || []).map(Number);
    const composite = (fg, bg) => { const a = fg[3] ?? 1; return fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a)); };
    let bg = [255, 255, 255]; const nodes = []; for (let node = el; node; node = node.parentElement) nodes.unshift(node);
    for (const node of nodes) bg = composite(rgb(getComputedStyle(node).backgroundColor), bg);
    const css = getComputedStyle(el), fg = composite(rgb(css.color), bg);
    const luminance = color => color.map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((a, x, i) => a + x * [.2126, .7152, .0722][i], 0);
    const a = luminance(fg), b = luminance(bg);
    return { color: css.color, background: bg.map(Math.round), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), fontSize: css.fontSize };
  });
  contrast.push({ theme, label, ...value });
  assert.ok(value.ratio >= 4.5, `${theme} ${label}: contrast ${value.ratio.toFixed(2)} < 4.5`);
};

try {
  await until(async () => { try { return (await fetch(base + '/api/health')).ok; } catch { return false; } }, 'isolated service ready');
  assert.equal((await fetch(base + '/api/health').then(r => r.json())).version, version);
  const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
  browser = await chromium.launch({ headless: true, ...(process.env.RIFTCAST_CHROMIUM_PATH ? { executablePath: process.env.RIFTCAST_CHROMIUM_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' });
  await context.route('**/*', request => {
    const url = new URL(request.request().url());
    if (url.origin !== base) return request.abort();
    if (url.pathname === '/api/resources/asset') return request.fulfill({ json: { data: {} } });
    return request.continue();
  });
  context.on('page', tab => tab.on('pageerror', error => errors.push(error.message)));
  context.on('request', request => { if (new URL(request.url()).pathname === '/api/action') actionLog.push(request.postDataJSON()); });
  page = await context.newPage(); await page.goto(base); await page.locator('.director-workspace').waitFor(); await freezeMotion(page);
  await until(() => page.evaluate(() => !!sessionStorage.getItem('riftcast-seat-token')), 'operator seat ready');
  const initialProgram = (await state()).production.program;
  assert.equal((await state()).teams.length, 8); assert.equal((await state()).assets.length, 20);
  assert.equal((await state()).players.length, 10); assert.equal((await state()).draft.bluePicks.length, 5);
  passed('fixture', 'isolated versioned service, eight teams, twenty local image assets and complete ten-player BP input');

  // First-use guide stays compact. Two complete rows must be usable before dismissing it.
  for (const theme of ['dark', 'light']) {
    await setTheme(theme);
    for (const [width, height] of [[1366, 768], [1366, 736], [1440, 900], [1920, 1080], [1080, 768]]) {
      await page.setViewportSize({ width, height }); await fits(`studio ${theme} ${width}×${height}`);
      const metric = await page.locator('.scene-bank-grid').evaluate(el => {
        const grid = el.getBoundingClientRect(); const cards = [...el.querySelectorAll('.scene-bank-item')].slice(0, 6).map(x => { const r = x.getBoundingClientRect(); return { y: r.y, bottom: r.bottom, height: r.height }; });
        return { grid: { top: grid.top, bottom: grid.bottom, height: grid.height }, cards, monitorHeight: document.querySelector('.monitor-surface')?.getBoundingClientRect().height };
      });
      if (width === 1366) {
        assert.ok(metric.grid.height >= (height === 736 ? 112 : 128), `scene height ${metric.grid.height}`);
        assert.ok(metric.cards.length === 6 && metric.cards.every(x => x.y >= metric.grid.top && x.bottom <= metric.grid.bottom), 'first two rows completely visible');
        await inViewport(page.locator('.broadcast-status'), 'fixed programme controls');
        const iconTarget = await page.locator('.scene-bank-tools button').first().boundingBox();
        assert.ok(iconTarget.width >= 32 && iconTarget.height >= 32, 'scene icon target at least 32px');
        const outputLabels = await page.locator('.broadcast-status .output-signals b').evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
        assert.ok(outputLabels.every(size => size >= 12), 'output status labels at least 12px');
      }
      measurements.push({ surface: 'studio', theme, width, height, firstUseGuide: true, ...metric });
      await shot(`studio-${theme}-${width}x${height}`);
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  for (const kind of ['program', 'preview']) await page.locator(`.monitor-pane.${kind}`).getByRole('button', { name: '查看场景排版', exact: true }).click();
  for (const theme of ['dark', 'light']) { await setTheme(theme); await shot(`studio-layout-${theme}-1366`); }
  assert.deepEqual((await state()).production.program, initialProgram, 'layout inspection and themes preserve PGM');
  passed('UI-01', 'first-use guide, two full scene rows and persistent programme controls at 1366×768 and 1366×736; responsive 1080/1440/1920 and populated layout screenshots');

  await route('连接与输出'); await settingsTask('collaboration');
  const collaboration = page.locator('.settings-task-pane:not([hidden])');
  await collaboration.getByLabel('接管理由', { exact: true }).fill('隔离 UI 1.5.0 操作路径验收');
  await collaboration.getByRole('button', { name: '凭理由接管主导播席', exact: true }).click();
  await until(async () => !!(await state()).production.control, 'control claimed');
  passed('control', 'actual collaboration form claims the disposable service control seat');

  const taskIds = ['data', 'video', 'audio', 'output', 'graphics', 'transitions', 'cinematics', 'vdo', 'resources', 'audience', 'integrations', 'demo', 'collaboration', 'diagnostics', 'appearance'];
  const graphicsTasks = ['身份与品牌', '局内与分析', '赛前倒计时', '选手画面', '原生 HUD', '临场图形'];
  for (const theme of ['dark', 'light']) {
    await setTheme(theme);
    for (const id of taskIds) {
      await settingsTask(id); await fits(`settings ${id} ${theme}`);
      await inViewport(page.locator(`#settings-nav-${id}`), `selected settings ${id}`, 64);
      assert.equal(await page.locator(`#settings-nav-${id}`).getAttribute('aria-selected'), 'true');
      if (id === 'resources') await sampleContrast(page.locator('.resource-progress strong'), 'resource progress title', theme);
      if (id === 'diagnostics') await sampleContrast(page.locator('.settings-task-heading p'), 'diagnostics description', theme);
      if (id === 'demo') await sampleContrast(page.locator('.demo-workspace>header>p').first(), 'demo explanatory text', theme);
      if (id === 'audience') await sampleContrast(page.locator('.twitch-audience-workspace').locator('p').first(), 'audience explanatory text', theme);
      if (id === 'audio') {
        const mixer = await page.locator('.settings-mixer-pane .audio-channel-bank').boundingBox();
        assert.ok(mixer && mixer.y < 320 && mixer.y + mixer.height < 660, 'mixer usable on first screen');
        assert.equal(await page.locator('.settings-engine-pane').isVisible(), false);
        await page.getByRole('button', { name: '采集设备', exact: true }).click();
        assert.equal(await page.locator('.settings-engine-pane').isVisible(), true);
        await page.getByRole('button', { name: '收起采集设备', exact: true }).click();
      }
      await shot(`settings-${id}-${theme}`);
      if (id === 'graphics') for (const name of graphicsTasks) {
        await page.getByRole('tab', { name, exact: true }).click(); await fits(`graphics ${name} ${theme}`);
        await inViewport(page.getByRole('tablist', { name: '节目包装子任务' }), 'graphics subtask navigation', 64);
        const shared = ['身份与品牌', '局内与分析'].includes(name);
        assert.equal(await page.getByRole('button', { name: '保存基础包装到待播', exact: true }).isVisible(), shared, `${name}: visible save scope`);
        measurements.push({ surface: 'graphics', task: name, theme, ...await page.locator('.settings-task-scroll').evaluate(el => ({ clientHeight: el.clientHeight, scrollHeight: el.scrollHeight })) });
        await shot(`graphics-${graphicsTasks.indexOf(name) + 1}-${theme}`);
      }
    }
  }
  await settingsTask('data'); await page.locator('#settings-nav-data').focus(); await page.keyboard.press('End');
  assert.equal(await page.locator('#settings-nav-appearance').evaluate(el => el === document.activeElement), true);
  await inViewport(page.locator('#settings-nav-appearance'), 'keyboard End selected item', 64);
  await page.keyboard.press('Home'); assert.equal(await page.locator('#settings-nav-data').evaluate(el => el === document.activeElement), true);
  await page.getByLabel('搜索设置任务', { exact: true }).fill('声音');
  assert.equal(await page.getByRole('tablist', { name: '连接与输出任务' }).getByRole('tab').count(), 1);
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  assert.equal(await page.locator('#settings-nav-audio').evaluate(el => el === document.activeElement), true, 'filtered result remains keyboard reachable');
  await page.keyboard.press('Enter'); assert.equal(await page.locator('#settings-nav-audio').getAttribute('aria-selected'), 'true');
  await page.getByLabel('清空任务搜索', { exact: true }).click();
  assert.equal(await page.getByRole('tablist', { name: '连接与输出任务' }).getByRole('tab').count(), 15);
  passed('UI-03', 'all fifteen settings tasks in four groups, search, keyboard Home/End and current item visibility in both themes');
  passed('UI-05', 'programme mixer fits first screen; collection devices expand separately in both themes');

  // Keep a shared draft open while an independent editor commits its own fields.
  await settingsTask('graphics'); await page.getByRole('tab', { name: '身份与品牌', exact: true }).click();
  await page.getByLabel('赞助商 / 品牌名称', { exact: true }).fill('1.5.0 独立保存范围验收');
  await page.getByRole('tab', { name: '选手画面', exact: true }).click();
  await page.getByLabel('左下角游戏版本', { exact: false }).fill('26.99');
  await page.getByRole('button', { name: '保存底部配置', exact: true }).click();
  await until(async () => (await state()).overlay.patchVersion === '26.99', 'independent player panel save');
  assert.notEqual((await state()).overlay.sponsor, '1.5.0 独立保存范围验收');
  await page.getByRole('tab', { name: '赛前倒计时', exact: true }).click();
  await page.getByRole('button', { name: '开始倒计时', exact: true }).click();
  await until(async () => !!(await state()).overlay.countdownEnd, 'independent countdown save');
  const countdownEnd = (await state()).overlay.countdownEnd;
  await page.getByRole('tab', { name: '身份与品牌', exact: true }).click();
  await page.getByRole('button', { name: '核对后保留本地修改', exact: true }).click();
  const actionIndex = actionLog.length;
  await page.getByRole('button', { name: '保存基础包装到待播', exact: true }).click();
  await until(async () => (await state()).overlay.sponsor === '1.5.0 独立保存范围验收', 'shared brand save');
  const saved = await state(); assert.equal(saved.overlay.patchVersion, '26.99'); assert.equal(saved.overlay.countdownEnd, countdownEnd);
  const patch = actionLog.slice(actionIndex).find(action => action.type === 'set-overlay');
  assert.deepEqual(Object.keys(patch.patch), ['sponsor']); assert.equal(typeof patch.expectedConfigVersion, 'number');
  assert.deepEqual(saved.production.program, initialProgram, 'all configuration edits remain pending');
  await shot('graphics-save-scope');
  passed('UI-04', 'six packaging tasks; independent player and countdown saves survive shared draft conflict/rebase; final patch contains only sponsor with expectedConfigVersion; PGM unchanged', { submittedPatch: patch.patch });

  await route('BP 与阵容');
  for (const theme of ['dark', 'light']) {
    await setTheme(theme);
    for (const name of ['BP 总览', '最终归属', '接管与客户端差异', '规则与历史']) {
      const tab = page.getByRole('tablist', { name: 'BP 工作区' }).getByRole('tab', { name, exact: true });
      await inViewport(tab, `BP task ${name}`, 64); await tab.click(); await fits(`BP ${name} ${theme}`);
      await shot(`bp-${['BP 总览', '最终归属', '接管与客户端差异', '规则与历史'].indexOf(name)}-${theme}`);
    }
  }
  await page.getByRole('tab', { name: 'BP 总览', exact: true }).click();
  const slot = page.locator('.bp-pick-row').first(); await slot.click(); await page.locator('dialog.bp-champion-dialog').waitFor();
  await inViewport(page.locator('dialog.bp-champion-dialog'), 'BP champion picker');
  await shot('dialog-bp-picker'); await page.keyboard.press('Escape');
  assert.equal(await slot.evaluate(el => el === document.activeElement), true, 'Escape restores BP slot focus');
  assert.equal(actionLog.filter(a => a.type === 'take').length, 0);
  passed('UI-02', 'four BP workspaces always in first screen; populated draft, ownership, sync and history; picker Escape restores focus without TAKE');

  await route('赛事与素材'); await page.getByRole('tab', { name: /战队与选手/ }).click();
  assert.equal(await page.locator('.manage-roster-player').count(), 5);
  await page.locator('.manage-roster').evaluate(el => el.scrollTo(0, 10000));
  const lastPlayer = await page.locator('.manage-roster-player').last().boundingBox();
  const rosterViewport = await page.locator('.manage-roster').boundingBox();
  assert.ok(lastPlayer.y >= rosterViewport.y && lastPlayer.y + lastPlayer.height <= rosterViewport.y + rosterViewport.height + 1, 'last player can be fully revealed above footer');
  await page.locator('.manage-roster').evaluate(el => el.scrollTo(0, 0));
  await shot('management-roster-summary');
  await page.locator('.manage-object[data-kind="team"]').first().click();
  await page.getByLabel('选手 1 游戏账号', { exact: true }).fill('operator-ui-account');
  await page.getByRole('button', { name: '保存战队', exact: true }).click();
  await until(async () => (await state()).teams[0].players[0].account === 'operator-ui-account', 'team edit saved');
  for (const theme of ['dark', 'light']) {
    await setTheme(theme);
    for (const label of ['赛事中心', '独立对阵', '战队与选手', '图片素材', '赛季统计', '赛后图形', '比赛记录']) {
      await page.getByRole('tab', { name: new RegExp(label) }).first().click(); await fits(`management ${label} ${theme}`);
      await shot(`management-${['赛事中心', '独立对阵', '战队与选手', '图片素材', '赛季统计', '赛后图形', '比赛记录'].indexOf(label)}-${theme}`);
    }
  }
  await page.getByRole('tab', { name: /赛事中心/ }).click(); await page.getByRole('button', { name: '建立整届赛事', exact: true }).first().click();
  await inViewport(page.locator('.tournament-create-footer'), 'tournament initial action area', 64);
  await page.getByRole('button', { name: '定位待补充项', exact: true }).click();
  assert.equal(await page.getByLabel('赛事名称', { exact: true }).evaluate(el => el === document.activeElement), true);
  await page.getByLabel('赛事名称', { exact: true }).fill('1.5.0 八队全流程验收赛事');
  assert.match(await page.locator('.tournament-create-footer').innerText(), /8 支队伍/);
  const beforeScroll = await page.locator('.tournament-create-footer').boundingBox();
  await page.locator('.tournament-create-body').evaluate(el => el.scrollTo(0, 10000));
  const afterScroll = await page.locator('.tournament-create-footer').boundingBox();
  assert.equal(afterScroll.y, beforeScroll.y, 'creation footer remains pinned');
  await shot('tournament-eight-team-create'); await page.getByRole('button', { name: '生成整届赛事', exact: true }).click();
  await until(async () => (await state()).tournaments?.length === 1, 'eight-team tournament saved');
  assert.equal((await state()).tournaments[0].config.teamIds.length, 8);
  await shot('tournament-eight-team-created');
  passed('UI-07', 'selected team has five-player roster and account status; actual edit/save works; all seven management tasks rendered with twenty image assets');
  passed('UI-10', 'eight-team tournament creation has pinned summary and submit area, missing-field focus and actual create/save');

  for (const theme of ['dark', 'light']) {
    await setTheme(theme); await route('实时数据'); await fits(`data ${theme}`); await shot(`data-${theme}`);
    await route('赛后收尾'); await fits(`postgame ${theme}`); await shot(`postgame-${theme}`);
    await route('使用指南'); await fits(`help ${theme}`);
    await inViewport(page.locator('.guide-primary-action'), 'guide destination action', 64);
    const parentScroll = await page.locator('.guide-workbench').evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight }));
    assert.ok(parentScroll.scroll <= parentScroll.height + 1, 'help parent has no second scrollbar');
    await shot(`help-${theme}`);
  }
  await page.getByRole('navigation', { name: '帮助任务', exact: true }).getByRole('button', { name: /准备一场比赛/ }).click();
  await page.locator('.guide-primary-action').click(); await page.locator('.manage-workbench').waitFor();
  passed('UI-09', 'help destination is immediately visible and usable; parent adds no competing scroll area');

  await route('导播工作台'); await page.getByRole('button', { name: '新建场景', exact: true }).click();
  await page.locator('dialog.custom-scene-dialog').waitFor(); await inViewport(page.locator('dialog.custom-scene-dialog'), 'custom scene editor');
  await shot('dialog-custom-scene'); await page.getByRole('button', { name: '返回导播台，关闭场景编辑器', exact: true }).click();
  await page.getByRole('button', { name: '故障报告', exact: true }).click(); await page.locator('.app-operation-dialog').waitFor();
  await inViewport(page.locator('.app-operation-dialog'), 'diagnostic report dialog'); await shot('dialog-diagnostic-report'); await page.keyboard.press('Escape');
  await sampleContrast(page.getByRole('button', { name: '故障报告', exact: true }), 'available toolbar button', 'light');

  // Restricted seat gets the actual VDO permissions message, preserving backend authorisation.
  const makeSeat = role => page.evaluate(async role => {
    const response = await fetch('/api/control/seat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-seat-token': sessionStorage.getItem('riftcast-seat-token') }, body: JSON.stringify({ name: `UI 验收 ${role}`, role, fresh: true }) });
    if (!response.ok) throw Error('fixture role creation failed'); return (await response.json()).token;
  }, role);
  const readonlyToken = await makeSeat('readonly'); const restricted = await context.newPage();
  await restricted.goto(base + '?seat=' + encodeURIComponent(readonlyToken)); await restricted.locator('.control-rail').waitFor(); await freezeMotion(restricted);
  await restricted.locator('.control-rail').getByRole('button', { name: '连接与输出', exact: true }).click(); await restricted.locator('#settings-nav-vdo').click();
  for (const theme of ['dark', 'light']) { await setTheme(theme, restricted); await sampleContrast(restricted.locator('.vdo-workspace [role="alert"]'), 'VDO permission feedback', theme); await shot(`settings-vdo-permission-${theme}`, restricted); }
  await restricted.close();

  // Read-only response fixtures exercise the two empty-state destinations.
  const emptyState = { ...await state(), players: [], assets: [] };
  const emptyContext = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' });
  await emptyContext.route('**/api/state', request => request.fulfill({ json: emptyState }));
  await emptyContext.route('**/api/resources/asset?**', request => request.fulfill({ json: { data: {} } }));
  await emptyContext.routeWebSocket('**/ws', () => {});
  const empty = await emptyContext.newPage(); await empty.goto(base + '#data'); await freezeMotion(empty);
  await empty.getByRole('button', { name: '打开数据连接', exact: true }).click();
  await until(async () => await empty.locator('#settings-nav-data').getAttribute('aria-selected') === 'true', 'empty data target activated');
  assert.equal(await empty.locator('#settings-nav-data').getAttribute('aria-selected'), 'true', 'empty data action opens connection task');
  await empty.locator('.control-rail').getByRole('button', { name: '赛事与素材', exact: true }).click();
  await empty.getByRole('tab', { name: /图片素材/ }).click();
  await empty.getByRole('button', { name: '选择图片导入', exact: true }).waitFor(); await shot('empty-assets-action', empty);
  const chooser = empty.waitForEvent('filechooser'); await empty.getByRole('button', { name: '选择图片导入', exact: true }).click();
  assert.equal(await (await chooser).element().getAttribute('type'), 'file'); await emptyContext.close();
  passed('empty-states', 'empty data opens its connection task; empty image library opens the actual file chooser (read-only response fixture)');

  const ownerToken = await page.evaluate(() => sessionStorage.getItem('riftcast-seat-token'));
  for (const [role, label] of [['readonly', '只读席'], ['data', '资料席'], ['subtitle', '字幕席'], ['replay', '回放席'], ['director', '主导播席']]) {
    const token = role === 'director' ? ownerToken : role === 'readonly' ? readonlyToken : await makeSeat(role);
    const remote = await context.newPage(); await remote.setViewportSize({ width: 390, height: 844 });
    await remote.goto(base + '/remote?seat=' + encodeURIComponent(token)); await remote.getByRole('heading', { name: label, exact: true }).waitFor(); await freezeMotion(remote);
    for (const theme of ['dark', 'light']) {
      await setTheme(theme, remote);
      for (const width of [390, 430]) {
        await remote.setViewportSize({ width, height: 844 }); await fits(`${role} ${theme} ${width}`, remote);
        if (role !== 'readonly') {
          assert.equal(await remote.locator('.remote-monitor').isVisible(), false, 'editable seat opens task');
          const tasks = await remote.locator('.remote-role-task').boundingBox();
          assert.ok(tasks && tasks.y < 420, `remote ${role} task starts near top`);
        }
        if (role === 'director') {
          for (const y of [0, 10000]) { await remote.evaluate(y => scrollTo(0, y), y); await inViewport(remote.locator('.remote-take-dock'), 'director fixed TAKE dock'); }
        } else assert.equal(await remote.locator('.remote-take-dock').count(), 0);
        const summaries = await remote.locator('summary:visible').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, height: node.getBoundingClientRect().height })));
        assert.ok(summaries.every(item => item.height >= 44), `${role}: summary touch targets ${JSON.stringify(summaries)}`);
        await remote.evaluate(() => scrollTo(0, 0)); await shot(`remote-${role}-${theme}-${width}`, remote);
      }
    }
    if (role === 'subtitle') {
      const input = remote.getByLabel('待播字幕', { exact: true }); await input.fill('手机席位草稿 · 切换监看后保持');
      await input.evaluate(el => { window.__operatorDraft = el; });
      await remote.getByRole('tab', { name: '节目与预监', exact: true }).click();
      await remote.getByRole('tab', { name: '当前席位任务', exact: true }).click();
      assert.equal(await input.evaluate(el => el === window.__operatorDraft), true); assert.equal(await input.inputValue(), '手机席位草稿 · 切换监看后保持');
    }
    await remote.close();
  }
  passed('UI-08', 'all five remote roles at 390/430 in both themes; editable tasks open first, subtitle node/draft persist through monitor switching, only current director has fixed TAKE');
  passed('UI-11', 'resource progress, VDO permission feedback, diagnostics, demo, audience and available toolbar text meet 4.5:1 contrast', { samples: contrast.length });
  assert.equal(actionLog.filter(a => a.type === 'take').length, 0, 'UI inspection and saved drafts send no TAKE');
  assert.deepEqual(errors, [], 'no browser runtime errors');
  passed('UI-06', 'shared operator typography, 32px icon targets and dialogs exercised with keyboard, themes and responsive layouts; zero unexpected TAKE or browser runtime errors');
  const proofPrefixes = { 'UI-01': ['studio-'], 'UI-02': ['bp-', 'dialog-bp'], 'UI-03': ['settings-'], 'UI-04': ['graphics-'], 'UI-05': ['settings-audio'], 'UI-06': ['dialog-', 'studio-', 'remote-'], 'UI-07': ['management-'], 'UI-08': ['remote-'], 'UI-09': ['help-'], 'UI-10': ['tournament-'], 'UI-11': ['settings-resources', 'settings-vdo', 'settings-diagnostics', 'settings-demo', 'settings-audience'], 'empty-states': ['empty-'] };
  for (const check of checks) check.evidence = screenshots.filter(file => (proofPrefixes[check.id] || []).some(prefix => file.startsWith(prefix)));
  await rm(path.join(evidence, 'failure.png'), { force: true });
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify({ version, status: 'passed', checks, measurements, contrast, screenshots, errors,
    boundary: 'Built Chromium operator UI and a disposable real HTTP service with synthetic ten-player/eight-team/twenty-image data. OBS, Riot clients, physical audio/video devices and streaming platforms were disabled. Actual engine pixels and platform acceptance are outside this report.' }, null, 2));
  console.log(`Operator UI ${version}: ${checks.length} checks passed; ${screenshots.length} screenshots. ${evidence}`);
} catch (error) {
  await page?.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify({ version, status: 'failed', error: String(error), stack: error.stack, checks, measurements, contrast, screenshots, errors }, null, 2));
  throw error;
} finally {
  await browser?.close();
  if (child.exitCode === null) { child.send({ type: 'riftcast-shutdown' }); await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 4000); child.once('exit', () => { clearTimeout(timer); resolve(); }); }); }
  const absolute = path.resolve(dataDir);
  assert.ok(absolute.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(absolute).startsWith('riftcast-operator-ui-150-'));
  await rm(absolute, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
