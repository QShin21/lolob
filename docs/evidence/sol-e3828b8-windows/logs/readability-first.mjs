// New independent Windows sampling; historical geometry is a reference contract only.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root, evidence, source, chromium, browserOptions, sharp, createSeed, captureProgram, start, stop, read, post, action, patch, safeContext, manifest, until } from './harness.mjs';
const output = path.join(evidence, 'readability'); await mkdir(output, { recursive: true });
const baseline = JSON.parse(await readFile(path.join(root, 'docs/evidence/astra-readability/before/measurements.json'), 'utf8')).samples;
const before = await manifest('source-before');
const results = [], samples = [], errors = [], services = [];
let browser, page;
const save = () => writeFile(path.join(output, 'result.json'), JSON.stringify({ source, platform: process.platform, node: process.version, boundary: 'Independent Windows Chrome / actual HTTP and renderer. Synthetic paused seeds, synthetic icon replies, synthetic engine acceptance. No OBS, game, device, audio or audience evidence.', results, samples, errors, work: services.map(s => s.work) }, null, 2));
async function check(id, work) { try { const data = await work(); results.push({ id, status: 'pass', data }); console.log('PASS ' + id); } catch (e) { results.push({ id, status: 'fail', error: e.message, stack: e.stack }); console.error('FAIL ' + id + ': ' + e.message); await page?.screenshot({ path: path.join(output, 'failure-' + id + '.png') }).catch(() => {}); } await save(); }
const selectors = { live: ['.lb-scoreboard', '.lb-pair', '.lb-feed', '.lb-patch', '.lb-player-name', '.lb-cs', '.lb-kda', '.lb-ultimate'], draft: ['.cast-draft-cards', '.cast-draft-card', '.arena-pick-state', '.cast-history-game > span', '.cast-draft-player'] };
async function measure(scene) { const data = {}; for (const selector of selectors[scene]) data[selector] = await page.locator(selector).evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e), range = document.createRange(); range.selectNodeContents(e); const text = range.getBoundingClientRect(); return { text: e.textContent, x: r.x, y: r.y, width: r.width, height: r.height, fontPx: parseFloat(c.fontSize), scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, background: c.backgroundColor, overflow: c.overflow, textOverflow: c.textOverflow, textWidth: text.width, textHeight: text.height, state: e.dataset.state }; })); return data; }
async function fingerprint() { return page.locator('.broadcast-canvas').evaluate(e => [e, ...e.querySelectorAll('*')].map(n => { const r = n.getBoundingClientRect(); const style = c => [c.color, c.backgroundColor, c.fontSize, c.fontFamily, c.opacity, c.content, c.borderColor]; return [n.tagName, n.className, r.x, r.y, r.width, r.height, style(getComputedStyle(n)), style(getComputedStyle(n, '::before')), style(getComputedStyle(n, '::after'))]; })); }
const icon = await sharp({ create: { width: 48, height: 48, channels: 3, background: '#c28b44' } }).png().toBuffer();
try {
  browser = await chromium.launch(browserOptions);
  for (const fixture of ['normal', 'pressure', 'missing']) {
    const seed = createSeed(); seed.paused = true; seed.demoPaused = true; seed.overlay.nativeHud = 'off'; seed.overlay.sponsor = ''; seed.overlay.sponsorLogo = ''; seed.overlay.ticker = false;
    seed.players.forEach((p, i) => { p.items = [1001, 1054, 1036, 1037, 1038, 1042, 3340]; p.summonerSpells = [{ id: 4, name: '闪现' }, { id: 12, name: '传送' }]; p.runeSelection = { keystoneId: 8005, secondaryTreeId: 8200 }; p.ultimate = { state: ['cooldown', 'ready', 'unlearned'][i % 3], cooldownRemaining: 45 }; });
    if (fixture === 'pressure') {
      seed.match.game = 5; seed.match.format = 'BO5'; seed.match.blueScore = seed.match.redScore = 2;
      seed.teams.forEach((t, i) => { t.name = (i ? '红方' : '蓝方') + '跨区域邀请赛合成长名称战队'; t.tag = i ? 'REDLONG' : 'BLUELONG'; });
      seed.players.forEach((p, i) => { p.name = i % 2 ? 'LongPlayerNameToTruncate' : '超长选手名称用于边界校准'; p.kills = 12; p.deaths = 34; p.assists = 56; p.cs = 1234; });
      seed.draftHistory = Array.from({ length: 4 }, (_, i) => ({ seriesId: seed.match.seriesId, game: i + 1, blueTeamId: i % 2 ? seed.match.redTeamId : seed.match.blueTeamId, redTeamId: i % 2 ? seed.match.blueTeamId : seed.match.redTeamId, bluePicks: i % 2 ? [...seed.draft.redPicks] : [...seed.draft.bluePicks], redPicks: i % 2 ? [...seed.draft.bluePicks] : [...seed.draft.redPicks], recordedAt: new Date().toISOString(), source: 'demo' }));
      seed.draft.bluePicks = seed.draft.bluePicks.map((p, i) => i < 2 ? p : ''); seed.draft.redPicks = seed.draft.redPicks.map((p, i) => i < 2 ? p : ''); seed.draft.bluePreselect = ['Ashe']; seed.draft.locked = false; seed.draft.activeTeam = 'blue'; seed.draft.action = '选择英雄';
    }
    if (fixture === 'missing') { seed.mode = 'live'; seed.players = []; seed.economy = []; seed.selectedPlayerId = null; seed.draft.bluePicks = []; seed.draft.redPicks = []; seed.draft.blueBans = []; seed.draft.redBans = []; seed.draft.bluePreselect = []; seed.draft.redPreselect = []; seed.draft.locked = false; seed.draft.activeTeam = 'blue'; seed.draft.action = '选择英雄'; for (const side of ['blue', 'red']) Object.assign(seed.stats[side], { gold: null, objectivesAvailable: false }); }
    const service = await start('readability-' + fixture, seed); services.push(service);
    const seat = await post(service, '/api/control/seat', { name: 'Sol independent Windows readability', role: 'director' }); assert.equal(seat.status, 200); const owner = seat.data.token;
    const context = await safeContext(browser, service, owner, { width: 1920, height: 1080 });
    await context.route('**/api/resources/asset**', route => { const target = new URL(route.request().url()).searchParams.get('url') || ''; if (/item\.json/.test(target)) return route.fulfill({ json: { data: Object.fromEntries([1001, 1054, 1036, 1037, 1038, 1042, 3340].map(id => [id, { name: 'SOL 合成装备 ' + id, gold: { total: 1000 } }])) } }); if (/champion\/.+\.json/.test(target)) { const id = target.match(/champion\/([^/]+)\.json/)[1]; return route.fulfill({ json: { data: { [id]: { spells: [{}, {}, {}, { image: { full: 'SolUltimate.png' } }] } } } }); } return route.fulfill({ contentType: 'image/png', body: icon }); });
    page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.goto(service.base + '/overlay');
    if (fixture === 'missing') await check('missing-live-TAKE-protection', async () => { const s = await read(service); const reply = await post(service, '/api/action', { type: 'take', scene: 'live', expectedConfigVersion: s.production.configVersion, requestId: crypto.randomUUID() }, owner); assert.equal(reply.status, 400); return { status: reply.status, renderingBoundary: 'Subsequent missing live image uses an explicit synthetic on-air signal-loss snapshot.' }; });
    for (const scene of ['live', 'draft']) {
      if (fixture === 'missing') { const s = await read(service); s.programScene = s.previewScene = scene; s.production.program = captureProgram(s); await patch(service, { programScene: scene, previewScene: scene, production: s.production }); } else await action(service, { type: 'take', scene }, owner);
      await page.locator('.cast-scene-' + scene).waitFor(); await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
      for (const [width, height] of [[1920, 1080], [1280, 720], [640, 360]]) await check(`${fixture}-${scene}-${width}`, async () => {
        await page.setViewportSize({ width, height }); await page.waitForTimeout(150); const elements = await measure(scene); const png = `${fixture}-${scene}-${width}.png`;
        await page.screenshot({ path: path.join(output, png), animations: 'disabled' });
        const sample = { fixture, scene, width, height, png, elements }; samples.push(sample);
        const contract = baseline.find(b => b.fixture === 'normal' && b.scene === scene && b.width === width);
        const protectedSelectors = scene === 'live' ? ['.lb-scoreboard', '.lb-pair', '.lb-feed', '.lb-patch'] : ['.cast-draft-cards'];
        let maximumGeometryDelta = 0;
        for (const selector of protectedSelectors) { assert.equal(elements[selector].length, contract.elements[selector].length, selector); elements[selector].forEach((value, i) => { for (const key of ['x', 'y', 'width', 'height']) maximumGeometryDelta = Math.max(maximumGeometryDelta, Math.abs(value[key] - contract.elements[selector][i][key])); if (scene === 'live' && ['.lb-scoreboard', '.lb-pair'].includes(selector)) assert.equal(value.background, 'rgb(0, 0, 0)'); }); }
        assert.ok(maximumGeometryDelta <= 0.02, 'protected geometry changed by ' + maximumGeometryDelta);
        const expected = scene === 'live' ? { '.lb-player-name': 24, '.lb-cs': 24, '.lb-kda': 21.6 } : { '.arena-pick-state': 24, '.cast-history-game > span': 24 };
        for (const [selector, size] of Object.entries(expected)) { assert.ok(elements[selector].length > 0, selector); for (const el of elements[selector]) assert.ok(Math.abs(el.fontPx - size * width / 1920) < 0.02, `${selector}: ${el.fontPx}`); }
        if (scene === 'live') {
          assert.equal(elements['.lb-pair'].length, 5); assert.equal(elements['.lb-player-name'].length, 10);
          for (const selector of ['.lb-cs', '.lb-kda']) for (const el of elements[selector]) { assert.ok(el.scrollWidth <= el.clientWidth + 1, selector + ' scroll overflow'); assert.ok(el.textWidth <= el.width + 1, selector + ' glyph overflow'); }
          if (fixture !== 'missing') { const images = await page.locator('.lb-player-row img').evaluateAll(els => els.map(e => ({ complete: e.complete, width: e.naturalWidth, alt: e.alt }))); assert.ok(images.length >= 120, 'full synthetic icon slots must render'); assert.ok(images.every(i => i.complete && i.width > 0), 'every synthetic icon must decode'); assert.equal(await page.locator('.lb-inventory .lb-item-slot').count(), 60); assert.equal(await page.locator('.lb-spells img').count(), 20); assert.equal(await page.locator('.lb-runes img').count(), 20); if (fixture === 'pressure') { assert.ok(elements['.lb-kda'].every(e => e.text === '12/34/56')); assert.ok(elements['.lb-cs'].every(e => e.text === '1234')); } } else { assert.ok(elements['.lb-player-name'].every(e => e.text === '—')); assert.ok(elements['.lb-cs'].every(e => e.text === '—')); assert.ok(elements['.lb-kda'].every(e => /—/.test(e.text))); }
        } else {
          const states = elements['.arena-pick-state'].map(e => e.state); assert.equal(states.length, 10); if (fixture === 'pressure') { assert.ok(states.includes('locked') && states.includes('preselect') && states.includes('waiting')); assert.equal(await page.locator('.cast-history-game').count(), 8); assert.equal(await page.locator('.cast-history-game.is-pending').count(), 0); const historical = await page.locator('.cast-ban-history.blue .cast-history-game img').evaluateAll(els => els.map(e => e.alt)); assert.equal(historical.length, 20); assert.ok(historical.every(Boolean)); } if (fixture === 'missing') assert.ok(states.includes('choosing') && states.includes('waiting'));
        }
        const dark = await fingerprint(); await page.evaluate(() => document.documentElement.dataset.uiTheme = 'light'); assert.deepEqual(await fingerprint(), dark); await page.evaluate(() => document.documentElement.dataset.uiTheme = 'dark');
        assert.ok(!/NaN|undefined/.test(await page.locator('.broadcast-canvas').innerText())); return { maximumGeometryDelta, fontSizes: Object.fromEntries(Object.keys(expected).map(s => [s, elements[s][0].fontPx])), themeIsolated: true, missingIsSyntheticSignalLoss: fixture === 'missing' };
      });
    }
    if (fixture === 'normal') { await action(service, { type: 'take', scene: 'teamfight' }, owner); await page.locator('.cast-scene-teamfight').waitFor(); for (const [width, height] of [[1920, 1080], [1280, 720], [640, 360]]) await check('transparent-teamfight-' + width, async () => { await page.setViewportSize({ width, height }); assert.equal(await page.locator('.broadcast-canvas').innerText(), ''); const bytes = await page.screenshot({ omitBackground: true, path: path.join(output, `teamfight-${width}-alpha.png`) }); const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); let opaque = 0; for (let i = 3; i < data.length; i += info.channels) if (data[i] !== 0) opaque++; assert.equal(opaque, 0); return { pixels: width * height, nonTransparentPixels: opaque }; }); }
    await context.close(); await stop(service);
  }
  assert.deepEqual(errors, []); const after = await manifest('source-after-readability'); assert.deepEqual(after.files, before.files);
} catch (e) { results.push({ id: 'harness', status: 'fail', error: e.message, stack: e.stack }); console.error(e.stack); }
finally { await browser?.close(); for (const service of services) await stop(service); await save(); }
console.log(JSON.stringify({ checks: results.length, passed: results.filter(r => r.status === 'pass').length, failed: results.filter(r => r.status === 'fail').length, errors: errors.length, screenshots: samples.length }));
if (results.some(r => r.status === 'fail')) process.exitCode = 1;
