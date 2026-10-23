const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash, randomUUID } = require('node:crypto');
const path = require('node:path');

const repository = 'QShin21/lolob';
const releaseApi = `https://api.github.com/repos/${repository}/releases/latest`;
const versionParts = value => /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) ? value.replace(/^v/, '').split('.').map(Number) : null;
function newer(version, current) {
  const a = versionParts(version), b = versionParts(current);
  if (!a || !b || [...a, ...b].some(n => !Number.isSafeInteger(n))) throw new Error('版本号格式无效');
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function releaseInfo(value) {
  if (!value || value.draft !== false || value.prerelease !== false || !versionParts(value.tag_name)) throw new Error('发布信息未包含正式版本');
  const assets = Array.isArray(value.assets) ? value.assets.filter(a => typeof a?.name === 'string' && /\.exe$/i.test(a.name)) : [];
  if (assets.length !== 1) throw new Error('正式发布需包含唯一 Windows 安装包');
  const asset = assets[0];
  if (!/^RiftCast[-A-Za-z0-9_.]{1,150}\.exe$/i.test(asset.name) || !Number.isSafeInteger(asset.size) || asset.size < 2 || asset.size > 3 * 1024 ** 3 || !/^sha256:[a-f0-9]{64}$/i.test(asset.digest ?? '')) throw new Error('安装包缺少有效的文件名、大小或官方 SHA-256，暂不能下载');
  const url = new URL(asset.browser_download_url);
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash || url.pathname !== `/${repository}/releases/download/${encodeURIComponent(value.tag_name)}/${encodeURIComponent(asset.name)}`) throw new Error('安装包来源与当前仓库不一致');
  return { version: value.tag_name.replace(/^v/, ''), name: asset.name, size: asset.size, sha256: asset.digest.slice(7).toLowerCase(), url: url.href, publishedAt: typeof value.published_at === 'string' ? value.published_at : '' };
}
async function fileDigest(file) {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('同名下载路径不是普通文件');
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return { size: info.size, sha256: hash.digest('hex') };
}
function createUpdateService({ currentVersion, downloadsDir, fetch: fetcher = globalThis.fetch }) {
  let status = { phase: 'idle', currentVersion, received: 0, total: 0, detail: '手动检查正式发布版本' }, active, controller;
  const snapshot = () => structuredClone(status);
  const change = patch => { status = { ...status, ...patch }; };
  const begin = (phase, detail, operation) => {
    if (active) throw new Error('已有更新操作正在进行');
    controller = new AbortController();
    const signal = controller.signal;
    change({ phase, detail, path: undefined, received: 0 });
    active = operation(signal).catch(error => {
      change({ phase: signal.aborted ? 'cancelled' : 'error', detail: signal.aborted ? '已取消，可重新检查或下载' : error.message });
    }).finally(() => { active = undefined; controller = undefined; });
    return snapshot();
  };
  async function fetchAsset(url, signal) {
    for (let redirects = 0; redirects <= 4; redirects++) {
      const response = await fetcher(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'RiftCast-Updater', Accept: 'application/octet-stream' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = new URL(response.headers.get('location') ?? '', url);
        await response.body?.cancel();
        if (next.protocol !== 'https:' || next.username || next.password || !['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(next.hostname)) throw new Error('安装包重定向来源不受信任');
        url = next.href; continue;
      }
      if (!response.ok || !response.body) throw new Error(`安装包下载失败（HTTP ${response.status}）`);
      return response;
    }
    throw new Error('安装包重定向次数过多');
  }
  const check = () => begin('checking', '正在查询当前仓库的正式发布', async signal => {
    change({ release: undefined, total: 0 });
    const response = await fetcher(releaseApi, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'RiftCast-Updater', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!response.ok) throw new Error(`版本查询失败（HTTP ${response.status}），请稍后重试`);
    const chunks = []; let size = 0;
    if (!response.body) throw new Error('发布信息为空');
    for await (const chunk of response.body) { size += chunk.length; if (size > 2 * 1024 * 1024) throw new Error('发布信息过大'); chunks.push(chunk); }
    const release = releaseInfo(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const available = newer(release.version, currentVersion);
    change({ phase: available ? 'available' : 'current', release, total: release.size, detail: available ? `发现正式版本 ${release.version}` : '当前安装版本已覆盖最新正式发布' });
  });
  const download = () => {
    const release = status.release;
    if (!release || !newer(release.version, currentVersion)) throw new Error('请先检查可用的新版本');
    return begin('downloading', '正在下载到系统下载目录', async signal => {
      await fs.mkdir(downloadsDir, { recursive: true });
      const target = path.join(downloadsDir, release.name), temporary = path.join(downloadsDir, `.RiftCast-${randomUUID()}.download`);
      const matches = async () => { try { const found = await fileDigest(target); if (found.size !== release.size || found.sha256 !== release.sha256) throw new Error('下载目录已有同名不同内容文件，已保留原文件；请先更名后重试'); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
      let handle, reader;
      const timeout = setTimeout(() => controller?.abort(), 20 * 60 * 1000);
      try {
        if (await matches()) { signal.throwIfAborted(); change({ phase: 'ready', received: release.size, path: target, detail: '已核验下载目录中的同版本安装包' }); return; }
        signal.throwIfAborted();
        const response = await fetchAsset(release.url, signal), declared = response.headers.get('content-length');
        if (declared && Number(declared) !== release.size) { await response.body.cancel(); throw new Error('下载响应大小与官方资产记录不一致'); }
        handle = await fs.open(temporary, 'wx', 0o600); reader = response.body.getReader();
        let received = 0;
        for (;;) {
          signal.throwIfAborted();
          const result = await reader.read(); if (result.done) break;
          received += result.value.length;
          if (received > release.size) throw new Error('下载大小超过官方资产记录');
          await handle.writeFile(result.value); change({ received, total: release.size });
        }
        await handle.sync(); await handle.close(); handle = undefined;
        signal.throwIfAborted(); change({ phase: 'verifying', detail: '正在校验安装包大小与 SHA-256' });
        const digest = await fileDigest(temporary);
        if (digest.size !== release.size || digest.sha256 !== release.sha256) throw new Error('安装包完整性校验失败，请重新下载');
        signal.throwIfAborted();
        // Hard-link publication fails on an existing name; it never replaces an older user file.
        try { await fs.link(temporary, target); } catch (error) { if (error.code !== 'EEXIST' || !await matches()) throw error; }
        change({ phase: 'ready', path: target, detail: '下载完成，大小与 SHA-256 已核验；可在停播后自行运行安装器' });
      } finally {
        clearTimeout(timeout); await reader?.cancel().catch(() => {}); await handle?.close().catch(() => {}); await fs.unlink(temporary).catch(() => {});
      }
    });
  };
  return { status: snapshot, check, download, cancel() { controller?.abort(); return snapshot(); }, async settled() { await active; return snapshot(); }, readyPath() { return status.phase === 'ready' ? status.path : undefined; } };
}
module.exports = { createUpdateService, releaseInfo, newer, releaseApi };
