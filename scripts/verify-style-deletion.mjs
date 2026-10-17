import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { isolatedNativeEnvironment, nativeRequestGuard } from './verify-native-safety.mjs';
import { reportFixture } from './report-093-fixture.mjs';
import { checkStyleDeletion, checkDeletedAfterRestart } from './style-deletion-checks.mjs';
const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const dir = path.resolve('verification-output', `release-${version}`, 'deletion'); await mkdir(dir, { recursive: true });
const sandbox = await mkdtemp(path.join(os.tmpdir(), 'riftcast-delete-')), data = path.join(sandbox, 'data'); await mkdir(data);
await writeFile(path.join(data, 'state.json'), JSON.stringify(reportFixture()));
const listener = createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r)); const port = listener.address().port; await new Promise(r => listener.close(r));
const base = `http://127.0.0.1:${port}`, checks = [], errors = [], blocked = []; let service, browser, page, log = '';
async function start() {
  service = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...await isolatedNativeEnvironment(sandbox), PORT: String(port), RIFTCAST_DATA_DIR: data, RIFTCAST_OBS_AUTOSTART: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  service.stdout.on('data', b => { log += b; }); service.stderr.on('data', b => { log += b; });
  for (let i = 0; i < 150; i++) { try { assert.equal((await (await fetch(base + '/api/health')).json()).version, version); return; } catch { if (service.exitCode !== null) throw new Error(log); await new Promise(r => setTimeout(r, 200)); } }
  throw new Error('Service startup timed out: ' + log);
}
async function stop() { if (!service || service.exitCode !== null) return; const done = once(service, 'exit'); service.kill(); await done; service = undefined; }
try {
  await start(); browser = await chromium.launch({ headless: true, channel: process.env.RIFTCAST_BROWSER_CHANNEL || 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } }); await nativeRequestGuard(blocked).attach(context);
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  const removed = await checkStyleDeletion({ page, base, dir, checks });
  await assert.rejects(readFile(path.join(data, 'style-packs', `${removed.ref.id}--${removed.ref.revision}`, 'record.json')), { code: 'ENOENT' });
  await stop(); await start(); await checkDeletedAfterRestart(base, removed, checks);
  assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
  await writeFile(path.join(dir, 'report.json'), JSON.stringify({ status: 'passed', version, checks, errors, blocked }, null, 2)); console.log(checks.join('\n'));
} catch (error) {
  await page?.screenshot({ path: path.join(dir, 'failure.png') }).catch(() => {});
  await writeFile(path.join(dir, 'report.json'), JSON.stringify({ status: 'failed', version, checks, errors: [...errors, String(error)], blocked, log }, null, 2)); throw error;
} finally { await browser?.close(); await stop(); await rm(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); }
