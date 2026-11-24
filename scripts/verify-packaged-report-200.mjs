import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isolatedNativeEnvironment, nativeRequestGuard } from './verify-native-safety.mjs';
import { stylePackFixture } from './style-pack-fixture.mjs';
import { checkDeletedAfterRestart, checkStyleDeletion } from './style-deletion-checks.mjs';
import { reportFixture, amounts, counts } from './report-093-fixture.mjs';

const version = '2.0.0';
const defaultPack = 'qinghua-celestial';
const damage = [12400, 7600, 16900, 14000, 4300, 29600, 16000, 15200, 24700, 5000];
const damageTypes = [6400, 5000, 1000];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readyStyle = id => `[data-style-pack="${id}"][data-style-status="ready"]`;

async function verifyFrozenReports({ page, base, state, restored, dir }) {
  await page.goto(base + '/overlay?preview=1');
  const players = page.locator('.pr-gold-player');
  await players.last().waitFor();
  assert.equal(await players.count(), 10);
  assert.equal(await page.locator('.pr-metrics>div').count(), 8);
  for (const [sideIndex, side] of ['blue', 'red'].entries()) {
    const expected = amounts.slice(sideIndex * 5, sideIndex * 5 + 5).map(value => `${(value / 1000).toFixed(1)}k`);
    assert.deepEqual(await page.locator(`.pr-gold-player.${side} .pr-gold-label>b`).allInnerTexts(), expected);
    for (const [row, key] of ['towers', 'dragons', 'barons', 'voidgrubs'].entries()) {
      assert.equal(await page.locator('.pr-metrics>div').nth(row + 2).locator('b').nth(sideIndex).innerText(), String(counts[side][key]));
    }
  }
  assert.doesNotMatch(await page.locator('.pr-overview').innerText(), /对英雄伤害|DAMAGE/);
  const goldShares = await page.locator('.pr-gold-comparison').first().locator('i')
    .evaluateAll(bars => bars.map(bar => bar.getBoundingClientRect().width));
  assert.ok(Math.abs(goldShares[0] / (goldShares[0] + goldShares[1]) - amounts[0] / (amounts[0] + amounts[5])) < 0.001);
  await page.screenshot({ path: path.join(dir, 'packaged-report.png') });

  const token = await page.evaluate(() => sessionStorage.getItem('riftcast-seat-token'));
  const setPage = async postgamePage => {
    const latest = await state();
    const response = await fetch(base + '/api/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-seat-token': token },
      body: JSON.stringify({
        type: 'set-overlay', patch: { postgamePage },
        expectedConfigVersion: latest.production.configVersion, requestId: crypto.randomUUID(),
      }),
    });
    assert.equal(response.status, 200, await response.text());
  };
  await setPage(2);
  await page.locator('.pr-card img[src*="postgameMatchup"]').last().waitFor();
  assert.equal(await page.locator('.pr-card img[src*="postgameMatchup"]').count(), 10);
  assert.equal(await page.locator('.pr-ring').count(), 30);
  await setPage(3);
  await page.locator('.pr-damage').waitFor();
  const barWidths = await page.locator('.pr-damage .pr-bar').evaluateAll(bars => bars.map(bar => ({
    width: bar.firstElementChild.getBoundingClientRect().width / bar.getBoundingClientRect().width,
    types: [...bar.querySelectorAll('.pr-damage-composition > i')].map(segment =>
      segment.getBoundingClientRect().width / segment.parentElement.getBoundingClientRect().width),
  })));
  const orderedDamage = damage.slice(0, 5).flatMap((value, i) => [value, damage[i + 5]]);
  assert.equal(barWidths.length, 10);
  for (const [i, bar] of barWidths.entries()) {
    assert.ok(Math.abs(bar.width - orderedDamage[i] / Math.max(...damage)) < 0.002, `Damage bar ${i}`);
  }
  assert.equal(barWidths[0].types.length, 3);
  for (const [i, ratio] of barWidths[0].types.entries()) {
    assert.ok(Math.abs(ratio - damageTypes[i] / damage[0]) < 0.002, `Damage composition segment ${i}`);
  }
  assert.ok(barWidths.slice(1).every(bar => bar.types.length === 0));
  assert.deepEqual(await players.locator('.pr-gold-label>b').allInnerTexts(), orderedDamage.map(value => `${(value / 1000).toFixed(1)}K`));
  assert.equal(await page.locator('.pr-gold-comparison').count(), 0);
  await page.screenshot({ path: path.join(dir, 'packaged-damage-report.png') });
  await setPage(1);
  await page.locator('.pr-gold-comparison').first().waitFor();
  assert.deepEqual((await state()).gameResults, restored.gameResults, 'Changing preview report pages must preserve frozen results');
}

// The same renderer/service checks can run against a disposable source service.
// start(seed) opens a new window and, when given a seed, writes it before boot.
export async function verifyRendererFlows({ base, dir, start, stop, check }) {
  const state = async () => (await fetch(base + '/api/state')).json();
  const packs = async () => (await fetch(base + '/api/style-packs')).json();
  const builtins = JSON.parse(await readFile('shared/style-pack-catalog.json', 'utf8')).entries.map(entry => entry.manifest);
  assert.equal(builtins.length, 7);
  assert.equal(builtins.find(pack => pack.id === 'rift-signature')?.name, '裂隙曜金');

  let page = await start();
  const fresh = await state();
  assert.equal(fresh.mode, 'live');
  assert.equal(fresh.overlay.stylePack.id, defaultPack);
  assert.equal(fresh.settings.pollInterval, 500);
  assert.equal(fresh.gameTime, 0);
  for (const field of ['players', 'events', 'schedule']) assert.deepEqual(fresh[field], []);
  assert.equal(await page.locator('.director-demo-controls,.cast-demo').count(), 0);
  await page.screenshot({ path: path.join(dir, 'packaged-live-only-start.png') });
  await stop();
  check('Fresh start is live-only with empty telemetry, a 500 ms interval and the Qinghua default.');

  const fixture = reportFixture();
  fixture.gameResults[0].snapshot.players.forEach((player, i) => { player.damageDealt = damage[i]; });
  Object.assign(fixture.gameResults[0].snapshot.players[0], {
    telemetryDamageSource: 'packets', telemetryDamageSince: 0,
    telemetryDamage: {
      toChampions: damage[0],
      physicalToChampions: damageTypes[0], magicToChampions: damageTypes[1], trueToChampions: damageTypes[2],
    },
  });
  page = await start(fixture);
  const restored = await state();
  assert.equal(restored.finishedGameId, fixture.finishedGameId);
  assert.equal(restored.phase, 'postgame');
  const result = restored.gameResults.find(item => item.id === fixture.finishedGameId);
  assert.ok(result);
  assert.equal(result.winner, 'red');
  assert.deepEqual(result.snapshot.ocrMatch, fixture.gameResults[0].snapshot.ocrMatch);
  for (const id of ['Camille', 'Gnar', 'KogMaw']) {
    for (const variant of ['draftCompact', 'draftExpanded', 'draftReveal', 'postgameMatchup']) {
      const art = `champion-art/${id}-${variant}.webp`;
      const response = await fetch(`${base}/${art}`);
      assert.equal(response.status, 200, art);
      assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(await readFile(path.join('public', art))), art);
    }
  }
  await page.getByRole('button', { name: '故障报告', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="脱敏故障报告内容"]')?.value.length > 0);
  const report = JSON.parse(await page.getByLabel('脱敏故障报告内容').inputValue());
  assert.equal(report.version, version);
  assert.equal(report.schema, 'riftcast-local-diagnostic-v1');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await verifyFrozenReports({ page, base, state, restored, dir });
  check('The service restores the saved result and OCR archive. All three report pages, observed damage composition, local diagnostics and champion crop hashes pass.');

  await page.goto(base);
  await page.getByRole('button', { name: '风格包', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('.style-pack-choice').nth(6).waitFor();
  assert.equal(await dialog.locator('.style-pack-choice').count(), 7);
  assert.doesNotMatch(await dialog.innerText(), /简陋包/);
  assert.deepEqual((await packs()).packs.map(pack => pack.id).sort(), builtins.map(pack => pack.id).sort());
  for (const { id, name } of builtins) {
    await dialog.locator('.style-pack-choice').filter({ hasText: name }).click();
    await dialog.locator(readyStyle(id)).waitFor();
  }
  await dialog.locator('.style-pack-choice').filter({ hasText: '裂隙曜金' }).click();
  await dialog.locator(readyStyle('rift-signature')).waitFor();
  await dialog.getByRole('button', { name: '准备到预监', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.style-pack-buses')?.textContent.includes('新风格待 TAKE'));
  assert.equal((await state()).overlay.stylePack.id, 'rift-signature');
  assert.equal((await state()).production.program.overlay.stylePack.id, defaultPack);
  check('All seven built-ins are visible and load. 裂隙曜金 stages independently of the programme.');

  await dialog.locator('input[type=file]').setInputFiles({
    name: 'fixture.riftstyle.zip', mimeType: 'application/zip', buffer: await stylePackFixture(),
  });
  const imported = dialog.locator('.style-pack-choice[aria-pressed=true]').filter({ hasText: '验证用赛事风格' });
  await imported.waitFor();
  await dialog.getByRole('button', { name: '准备到预监', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.style-pack-buses b')][1]?.textContent === '验证用赛事风格');
  const styled = await state(), ref = styled.overlay.stylePack;
  assert.equal(ref.id, 'verification-cup');
  assert.equal(styled.production.program.overlay.stylePack.id, defaultPack);
  assert.deepEqual(styled.gameResults, restored.gameResults);
  const archive = await fetch(`${base}/api/style-packs/${ref.id}/${ref.revision}/export`);
  assert.equal(archive.status, 200);
  assert.equal(Buffer.from(await archive.arrayBuffer()).readUInt32LE(0), 0x04034b50);
  await page.screenshot({ path: path.join(dir, 'packaged-style-manager.png') });
  await page.goto(base + '/overlay?preview=1');
  await page.locator(readyStyle(ref.id)).waitFor();
  assert.equal(await page.locator('.pr-gold-player').count(), 10);
  await page.screenshot({ path: path.join(dir, 'packaged-style-preview.png') });
  await stop();
  page = await start();
  const restart = await state();
  assert.deepEqual(restart.overlay.stylePack, ref);
  assert.equal(restart.production.program.overlay.stylePack.id, defaultPack);
  assert.equal((await packs()).packs.length, 8);
  await page.goto(base + '/overlay?preview=1');
  await page.locator(readyStyle(ref.id)).waitFor();
  check('The imported ZIP round-trips through the style API. Its assets return after restart and PVW stays independent of PGM.');

  const deletionChecks = [];
  const removed = await checkStyleDeletion({ page, base, dir, checks: deletionChecks });
  await stop();
  page = await start();
  await checkDeletedAfterRestart(base, removed, deletionChecks, page);
  for (const item of deletionChecks) check(item);

  await page.goto(base + '/#manage');
  await page.getByRole('button', { name: '建立整届赛事', exact: true }).first().click();
  await page.getByLabel('赛事名称', { exact: true }).fill('打包赛事验收');
  await page.getByLabel('赛事形式', { exact: true }).selectOption('double-elimination');
  await page.getByRole('button', { name: '生成整届赛事', exact: true }).click();
  await page.locator('.tournament-header').waitFor();
  const tournamentState = await state(), tournament = tournamentState.tournaments.at(-1);
  assert.equal(tournament.config.format, 'double-elimination');
  assert.ok(tournamentState.schedule.some(match => match.tournament?.tournamentId === tournament.id));
  const tournamentZip = await fetch(`${base}/api/tournaments/${tournament.id}/export?format=zip`);
  assert.equal(tournamentZip.status, 200);
  assert.equal(Buffer.from(await tournamentZip.arrayBuffer()).readUInt32LE(0), 0x04034b50);
  await page.screenshot({ path: path.join(dir, 'packaged-tournament.png') });
  check('The tournament UI creates a double-elimination schedule and the service exports its ZIP.');

  await page.getByRole('button', { name: '连接与输出', exact: true }).click();
  await page.getByRole('tab', { name: '镜头制作', exact: true }).click();
  await page.locator('.cinematic-workspace').waitFor();
  await page.locator('.global-shortcuts').waitFor();
  await page.screenshot({ path: path.join(dir, 'packaged-cinematics.png') });
  await page.getByRole('tab', { name: '协作', exact: true }).click();
  await page.getByRole('button', { name: '建立协作', exact: true }).waitFor();
  const collaboration = await (await fetch(base + '/api/collaboration')).json();
  assert.equal(collaboration.mode, 'idle');
  assert.equal(collaboration.connected, false);
  await page.getByRole('tab', { name: '数据集成', exact: true }).click();
  await page.getByRole('button', { name: '生成数据接口密钥', exact: true }).click();
  const key = await page.getByLabel('本次生成的密钥').inputValue();
  const data = await fetch(base + '/api/integrations/data', { headers: { Authorization: `Bearer ${key}` } });
  assert.equal(data.status, 200);
  assert.equal((await data.json()).schemaVersion, 1);
  await page.getByRole('tab', { name: '观众互动', exact: true }).click();
  await page.locator('.twitch-audience-workspace').waitFor();
  await page.goto(base + '/overlay/season?metric=kda');
  await page.locator('.season-overlay-ranking').waitFor();
  await page.goto(base + '/overlay/archive?mode=team&result=' + encodeURIComponent(result.id));
  await page.locator('.ag-mode-team .ag-metrics article').first().waitFor();
  await page.goto(base + '/overlay/twitch');
  await page.locator('.twitch-audience-overlay').waitFor();
  assert.equal(await page.locator('.control-rail').count(), 0);
  check('Cinematics, idle collaboration, authenticated data, and standalone season, archive and Twitch overlays load.');
}

async function main() {
  assert.equal(process.platform, 'win32');
  assert.equal(process.arch, 'x64');
  const modulePath = process.env.RIFTCAST_PLAYWRIGHT_MODULE;
  const { _electron } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
  const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dir = path.resolve('verification-output', `release-${version}`);
  await mkdir(dir, { recursive: true });
  const sandbox = await mkdtemp(path.join(tmpdir(), 'riftcast-200-package-'));
  const appRoot = path.join(sandbox, 'app'), userData = path.join(sandbox, 'user');
  // The portable build uses the same executable name that the legacy updater restarts.
  const data = path.join(userData, 'data'), executable = path.join(appRoot, 'RiftCast.exe');
  const listener = createServer().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const env = {
    ...await isolatedNativeEnvironment(sandbox),
    PATH: ['System32', '', 'System32/WindowsPowerShell/v1.0'].map(folder => path.join(process.env.SystemRoot, folder)).join(path.delimiter),
    PORT: String(port), RIFTCAST_USER_DATA_DIR: userData, RIFTCAST_OBS_AUTOSTART: '0',
  };
  const checks = [], errors = [], blocked = [];
  const check = detail => { checks.push(detail); console.log(detail); };
  let application, page;

  let stopped = false;
  async function stop() {
    // After a clean close Playwright disposes the application handle, so process() must not be asked again.
    if (stopped) return;
    const child = application?.process();
    if (!child || child.exitCode !== null) return;
    let timer;
    try {
      await Promise.race([application.close(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Packaged application did not shut down within 60 seconds')), 60_000);
      })]);
      stopped = true;
    } catch (error) {
      assert.equal(path.resolve(child.spawnfile).toLowerCase(), executable.toLowerCase());
      if (child.exitCode === null) {
        execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function start(seed) {
    if (seed) await writeFile(path.join(data, 'state.json'), JSON.stringify(seed));
    application = await _electron.launch({ executablePath: executable, args: [], env, timeout: 90_000 });
    stopped = false;
    await nativeRequestGuard(blocked).attach(application.context());
    page = await application.firstWindow({ timeout: 90_000 });
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForURL(base + '/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.getByRole('button', { name: '风格包', exact: true }).waitFor();
    assert.equal(await page.title(), '观澜 · 英雄联盟赛事导播');
    await page.waitForFunction(() => !!sessionStorage.getItem('riftcast-seat-token') && !!sessionStorage.getItem('riftcast-seat-info'));
    const health = await (await fetch(base + '/api/health')).json();
    assert.equal(health.version, version);
    const metadata = await application.evaluate(({ app }) => ({
      name: app.getName(), version: app.getVersion(), packaged: app.isPackaged, userData: app.getPath('userData'),
    }));
    assert.deepEqual(metadata, { name: '观澜', version, packaged: true, userData });
    const update = await page.evaluate(() => window.riftcastDesktop.update('status'));
    assert.equal(update.currentVersion, version);
    assert.equal(update.phase, 'idle');
    return page;
  }

  try {
    await cp(path.join('release', version, 'win-unpacked'), appRoot, { recursive: true });
    await mkdir(data, { recursive: true });
    const manifest = JSON.parse(await readFile(path.join(appRoot, 'resources/release-manifest.json'), 'utf8'));
    assert.equal(manifest.product, 'GuanLan');
    assert.equal(manifest.version, version);
    assert.equal(manifest.sourceRevision, sourceRevision);
    assert.equal(manifest.workingTreeDirty, false);
    const bundled = path.join(appRoot, 'resources/app');
    for (const file of [
      'scripts/observer-telemetry-worker.ps1', 'scripts/native/observer-reader.cs',
      'scripts/read-spectator-gold.ps1', 'scripts/spectator-ocr-worker.ps1', 'scripts/spectator-portrait-matcher.cs',
      'electron/update-launcher.ps1', 'electron/update-bootstrap.ps1',
    ]) {
      assert.equal(hash(await readFile(path.join(bundled, file))), hash(await readFile(file)), file);
    }
    await assert.rejects(access(path.join(bundled, 'server/test-support')), { code: 'ENOENT' });
    assert.doesNotMatch(await readFile(path.join(bundled, 'server/index.mjs'), 'utf8'), /function tickDemo|function createFixture|fixture-series/);
    check('Packaged manifest matches HEAD, observer and updater scripts match source, and test fixtures are absent.');

    await verifyRendererFlows({ base, dir, start, stop, check });
    await page.goto(base + '/#settings');
    await page.getByRole('tab', { name: '镜头制作', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '启用后台快捷键', exact: true }).isEnabled(), true);
    const shortcuts = await page.evaluate(() => window.riftcastDesktop.globalShortcuts({ action: 'status' }));
    assert.equal(shortcuts.enabled, false);
    assert.deepEqual(shortcuts.registered, []);
    check('The isolated EXE runs without development Node on PATH. Updater and background shortcuts start idle.');

    await stop();
    assert.deepEqual(errors, []);
    assert.deepEqual(blocked, []);
    await writeFile(path.join(dir, 'packaged-report.json'), JSON.stringify({
      status: 'passed', version, sourceRevision, checks, errors, blocked,
      fixture: 'Synthetic archive, packaged service and IPC. No live game, device installation, OBS execution or platform streaming.',
    }, null, 2) + '\n');
  } catch (error) {
    await page?.screenshot({ path: path.join(dir, 'packaged-report-failure.png'), timeout: 5000 }).catch(() => {});
    await cp(path.join(userData, 'logs', 'director.log'), path.join(dir, 'packaged-startup.log')).catch(() => {});
    await writeFile(path.join(dir, 'packaged-report.json'), JSON.stringify({
      status: 'failed', version, sourceRevision, checks, errors: [...errors, String(error)], blocked,
    }, null, 2) + '\n');
    throw error;
  } finally {
    // A locked temp file must not hide the verification result: the runner discards the sandbox anyway.
    try { await stop(); } finally { await rm(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 1000 }).catch(error => console.warn(`Sandbox cleanup skipped: ${error.message}`)); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
