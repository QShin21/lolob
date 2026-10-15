// Acceptance-runner guards only; production permissions and routes stay unchanged.
import assert from 'node:assert/strict';
import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export async function isolatedNativeEnvironment(sandbox, inherited = process.env) {
  const env = { ...inherited };
  for (const key of Object.keys(env)) {
    if (/^(RIFTCAST_|ELECTRON_|NODE_OPTIONS$|NODE_PATH$|ENABLE_LAN$|PORT$|APPDATA$|LOCALAPPDATA$|TEMP$|TMP$)/i.test(key)) delete env[key];
  }
  const roaming = path.join(sandbox, 'appdata'), local = path.join(sandbox, 'localappdata'), temp = path.join(sandbox, 'temp');
  await Promise.all([roaming, local, temp].map(dir => mkdir(dir, { recursive: true })));
  return { ...env, ENABLE_LAN: '0', APPDATA: roaming, LOCALAPPDATA: local, TEMP: temp, TMP: temp, RIFTCAST_AUTO_CONNECT: '0', RIFTCAST_OFFLINE: '1' };
}

export function applyRunnerEnvironment(env) {
  // Only this dedicated runner process changes; the invoking shell is unaffected.
  for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
  Object.assign(process.env, env);
}

export function nativeRequestBlockReason(method, url, body, blockDevicePreparation = true) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return undefined;
  const route = decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname).replace(/\/+$/, '').toLowerCase();
  if (blockDevicePreparation && /^\/api\/obs\//.test(route) && /\/(?:prepare|install|uninstall|register|unregister)(?:\/|$)/.test(route)) return 'Device installation, registration and preparation are forbidden in this acceptance run';
  if (/^\/api\/obs\/stream(?:\/|$)/.test(route)) return 'Stream settings and real platform output are forbidden in this acceptance run';
  if (route === '/api/obs/engine/output' && !['stop-stream', 'start-record', 'stop-record', 'start-virtual-camera', 'stop-virtual-camera'].includes(body?.action)) return 'Unapproved output action (including start-stream) is forbidden in this acceptance run';
  return undefined;
}

export function nativeRequestGuard(blocked, blockDevicePreparation = true) {
  const inspect = (method, url, body) => {
    const reason = nativeRequestBlockReason(method, url, body, blockDevicePreparation);
    if (reason) blocked.push({ method, path: new URL(url, 'http://127.0.0.1').pathname, reason });
    return reason;
  };
  return {
    assertAllowed(method, url, body) { const reason = inspect(method, url, body); assert.ok(!reason, reason); },
    async attach(context) {
      await context.route('**/api/**', async route => {
        const request = route.request();
        let body;
        try { body = request.postDataJSON(); } catch { /* Multipart uploads are not device actions. */ }
        const reason = inspect(request.method(), request.url(), body);
        if (reason) await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: reason }) });
        else await route.fallback();
      });
    },
  };
}

export async function assertFixtureRecordingPath(directory, expectedDirectory) {
  assert.equal(typeof directory, 'string', 'OBS must return its actual recording directory');
  const actual = await realpath(directory), expected = await realpath(expectedDirectory);
  assert.equal(path.resolve(actual).toLowerCase(), path.resolve(expected).toLowerCase(), 'OBS recording directory must be the isolated fixture videos directory');
  return actual;
}
