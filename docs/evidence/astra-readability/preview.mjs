// Implementation self-review only: real isolated renderer, synthetic state, no OBS/devices.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { chromium } from '../sol-cbbcc7c/playwright-system.mjs';

const folder = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(folder, '../../..');
const stage = process.argv[2];
if (!['before', 'after'].includes(stage)) throw Error('Use before or after');
const output = path.join(folder, stage); await mkdir(output, { recursive: true });
const { createSeed } = await tsImport(path.join(root, 'server/state.ts'), import.meta.url);
const samples = [], errors = [], delay = ms => new Promise(r => setTimeout(r, ms));
for (const fixture of ['normal', 'pressure']) {
  const seed = createSeed(); seed.paused = true; seed.overlay.nativeHud = 'off';
  if (fixture === 'pressure') {
    seed.match.game = 5; seed.match.format = 'BO5';
    seed.draftHistory = Array.from({ length: 4 }, (_, i) => ({ ...seed.draftHistory[0], game: i + 1 }));
    seed.players.forEach((p, i) => {
      p.name = i % 2 ? 'LongPlayerNameToTruncate' : '超长选手名称用于边界校准';
      p.kills = 12; p.deaths = 34; p.assists = 56; p.cs = 1234;
      p.ultimate = { state: i % 3 === 0 ? 'cooldown' : i % 3 === 1 ? 'ready' : 'unlearned', cooldownRemaining: 45 };
    });
    seed.draft.bluePicks = seed.draft.bluePicks.map((p, i) => i < 2 ? p : '');
    seed.draft.bluePreselect = [seed.players[2].championId];
    seed.draft.locked = false; seed.draft.activeTeam = 'blue'; seed.draft.action = '选择英雄';
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'lolob-astra-type-'));
  await writeFile(path.join(dir, 'state.json'), JSON.stringify(seed));
  const net = createServer(); await new Promise(r => net.listen(0, '127.0.0.1', r)); const port = net.address().port; await new Promise(r => net.close(r));
  const base = `http://127.0.0.1:${port}`;
  const service = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: root, env: { ...process.env, PORT: String(port), ENABLE_LAN: '0', RIFTCAST_DATA_DIR: dir, RIFTCAST_AUTO_CONNECT: '0', RIFTCAST_OBS_AUTOSTART: '0', RIFTCAST_OFFLINE: '1', RIFTCAST_OBS_MODE: 'external' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  service.stdout.resume(); service.stderr.resume();
  let browser;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await delay(80); }
    const seat = await fetch(base + '/api/control/seat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Astra typography self-review', role: 'director' }) }).then(r => r.json());
    browser = await chromium.launch({ headless: true }); const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.goto(base + '/overlay');
    for (const scene of ['live', 'draft']) {
      const state = await fetch(base + '/api/state').then(r => r.json());
      const reply = await fetch(base + '/api/action', { method: 'POST', headers: { 'content-type': 'application/json', 'x-seat-token': seat.token }, body: JSON.stringify({ type: 'take', scene, expectedConfigVersion: state.production.configVersion, requestId: crypto.randomUUID() }) });
      if (!reply.ok) throw Error(await reply.text());
      await page.locator('.cast-scene-' + scene).waitFor(); await page.waitForTimeout(500);
      for (const [width, height] of [[1920, 1080], [1280, 720], [640, 360]]) {
        await page.setViewportSize({ width, height });
        const png = `${fixture}-${scene}-${width}.png`; await page.screenshot({ path: path.join(output, png), animations: 'disabled' });
        const selectors = scene === 'live' ? ['.lb-scoreboard', '.lb-pair', '.lb-feed', '.lb-patch', '.lb-player-name', '.lb-cs', '.lb-kda', '.lb-ultimate'] : ['.cast-draft', '.arena-draft-history', '.cast-ban-history', '.cast-draft-cards', '.arena-pick-state', '.cast-history-game > span', '.cast-draft-player'];
        const elements = {};
        for (const selector of selectors) elements[selector] = await page.locator(selector).evaluateAll(els => els.map(e => {
          const r = e.getBoundingClientRect(), c = getComputedStyle(e);
          return { text: e.textContent, x: r.x, y: r.y, width: r.width, height: r.height, fontPx: parseFloat(c.fontSize), scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, background: c.backgroundColor };
        }));
        samples.push({ fixture, scene, width, height, png, elements });
      }
    }
  } finally {
    await browser?.close(); service.send({ type: 'riftcast-shutdown' }); await delay(200); if (service.exitCode === null) service.kill('SIGTERM');
  }
}
await writeFile(path.join(output, 'measurements.json'), JSON.stringify({ stage, source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(), boundary: 'Astra implementation self-review. Synthetic paused seed; real HTTP and renderer. No real game, OBS, virtual camera, audio or external network.', samples, errors }, null, 2));
console.log(JSON.stringify({ stage, screenshots: samples.length, errors }));
