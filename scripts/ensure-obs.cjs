const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const release = require('./obs-runtime.json');

const projectRoot = path.resolve(__dirname, '..');
const runtimeParent = path.join(projectRoot, 'runtime');
const runtimeRoot = path.join(runtimeParent, 'obs-studio');
const markerName = '.riftcast-runtime.json';
const essentialFiles = ['bin/64bit/obs64.exe', 'bin/64bit/obs.dll', 'obs-plugins/64bit/obs-websocket.dll'];
let preparation;

function getRuntimePaths() {
  return {
    version: release.version,
    runtimeRoot,
    executablePath: path.join(runtimeRoot, 'bin', '64bit', 'obs64.exe'),
    workingDirectory: path.join(runtimeRoot, 'bin', '64bit'),
    licensePath: path.join(runtimeRoot, 'COPYING'),
    manifestPath: path.join(runtimeRoot, markerName),
  };
}

function assertOwnedPath(target) {
  const resolved = path.resolve(target);
  const relative = path.relative(runtimeParent, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('OBS 准备路径超出了项目 runtime 目录。');
  }
  let current = runtimeParent;
  for (const part of [null, ...relative.split(path.sep)]) {
    if (part !== null) current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('OBS runtime 目录包含链接，请使用项目内的普通目录。');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return resolved;
}

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function isReady() {
  try {
    assertOwnedPath(runtimeRoot);
    const marker = JSON.parse(await fsp.readFile(path.join(runtimeRoot, markerName), 'utf8'));
    if (marker.owner !== 'riftcast-director' || marker.version !== release.version || marker.archiveSha256 !== release.sha256) return false;
    for (const file of essentialFiles) {
      const target = assertOwnedPath(path.join(runtimeRoot, file));
      if (!marker.files?.[file] || await sha256(target) !== marker.files[file]) return false;
    }
    await fsp.access(path.join(runtimeRoot, 'COPYING'));
    await fsp.access(path.join(runtimeRoot, 'portable_mode.txt'));
    return true;
  } catch { return false; }
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, cwd: projectRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = `${output}${chunk.toString()}`.slice(-4000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(output) : reject(new Error(`${command} 退出代码 ${code}。${output.trim()}`)));
  });
}

function downloadDirect(url, target, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 8) return reject(new Error('官方 OBS 下载地址重定向次数过多。'));
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return reject(new Error('OBS 下载重定向必须使用 HTTPS。'));
    const request = https.get(parsed, { headers: { 'User-Agent': 'RiftCast-Director-OBS-Setup' } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location) return reject(new Error('OBS 下载地址缺少重定向目标。'));
        downloadDirect(new URL(response.headers.location, parsed).href, target, depth + 1).then(resolve, reject);
      } else if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`官方 OBS 下载返回 HTTP ${response.statusCode}。`));
      } else {
        pipeline(response, fs.createWriteStream(target, { flags: 'wx' })).then(resolve, reject);
      }
    });
    request.setTimeout(60000, () => request.destroy(new Error('OBS 下载连接超过 60 秒没有响应。')));
    request.once('error', reject);
  });
}

async function downloadArchive(target) {
  // Windows ships curl; it preserves HTTP(S)/SOCKS proxy and NO_PROXY settings.
  // Never print proxy values or redirect URLs, which can contain credentials.
  try {
    await run('curl.exe', ['--location', '--fail', '--silent', '--show-error', '--proto', '=https', '--proto-redir', '=https', '--retry', '2', '--connect-timeout', '30', '--max-time', '600', '--output', target, release.url]);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('官方 OBS 下载失败，请检查网络或现有代理配置，然后重新启动导播软件或运行 npm run setup:obs。');
    if (Object.keys(process.env).some(key => /^(https?_proxy|all_proxy)$/i.test(key) && process.env[key])) {
      throw new Error('当前代理环境需要 Windows curl.exe 下载 OBS，请安装或启用 Windows curl 后重试。');
    }
    await downloadDirect(release.url, target);
  }
}

async function validArchive(archive) {
  try {
    return (await fsp.stat(archive)).size === release.size && await sha256(archive) === release.sha256;
  } catch { return false; }
}

async function extractArchive(archive, staging) {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZipPath = $env:RIFTCAST_OBS_ARCHIVE
$taskStage = [IO.Path]::GetFullPath($env:RIFTCAST_OBS_STAGE)
$taskPrefix = $taskStage.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$taskArchive = [IO.Compression.ZipFile]::OpenRead($taskZipPath)
try {
  $taskExpandedSize = [long]0
  foreach ($taskEntry in $taskArchive.Entries) {
    $taskEntryPath = $taskEntry.FullName.Replace('/', [IO.Path]::DirectorySeparatorChar)
    if ([IO.Path]::IsPathRooted($taskEntryPath) -or $taskEntryPath.Contains(':')) { throw 'OBS ZIP contains an absolute path.' }
    $taskDestination = [IO.Path]::GetFullPath([IO.Path]::Combine($taskStage, $taskEntryPath))
    if (-not $taskDestination.StartsWith($taskPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'OBS ZIP path escapes staging directory.' }
    $taskUnixType = ($taskEntry.ExternalAttributes -shr 16) -band 0xF000
    if ($taskUnixType -eq 0xA000 -or (($taskEntry.ExternalAttributes -band 0x400) -ne 0)) { throw 'OBS ZIP contains a filesystem link.' }
    $taskExpandedSize += $taskEntry.Length
    if ($taskExpandedSize -gt 4GB) { throw 'OBS ZIP expands beyond the runtime size limit.' }
  }
} finally { $taskArchive.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($taskZipPath, $taskStage)
`;
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    ...process.env, RIFTCAST_OBS_ARCHIVE: archive, RIFTCAST_OBS_STAGE: staging,
  });
}

async function acquireLock(onProgress) {
  const lockPath = assertOwnedPath(path.join(runtimeParent, '.obs-setup.lock'));
  let notified = false;
  for (let attempt = 0; attempt < 3000; attempt++) {
    try {
      const handle = await fsp.open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      await handle.close();
      return async () => { await fsp.unlink(lockPath).catch(() => {}); };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const lock = JSON.parse(await fsp.readFile(lockPath, 'utf8'));
        if (!Number.isInteger(lock.pid) || lock.pid <= 0) throw new Error('Invalid lock');
        let alive = true;
        try { process.kill(lock.pid, 0); } catch (probe) { if (probe.code === 'ESRCH') alive = false; }
        if (!alive) { await fsp.unlink(lockPath); continue; }
      } catch (lockError) {
        if (lockError.code === 'ENOENT') continue;
        // A second launcher can observe the file before its owner writes its PID.
        if (lockError instanceof SyntaxError) {
          const lockStat = await fsp.stat(lockPath).catch(() => undefined);
          if (!lockStat || Date.now() - lockStat.mtimeMs < 2000) {
            await new Promise(resolve => setTimeout(resolve, 200));
            continue;
          }
        }
        throw new Error('OBS 准备锁无法读取，请关闭其他导播启动进程后重试。');
      }
      if (!notified) { onProgress('另一个导播启动进程正在准备 OBS，等待准备完成。'); notified = true; }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  throw new Error('等待 OBS 准备超时，请结束其他准备进程后重试。');
}

async function prepare(onProgress) {
  if (process.platform !== release.platform || process.arch !== release.architecture) throw new Error('内置 OBS 运行时需要 Windows x64。');
  assertOwnedPath(runtimeRoot);
  if (await isReady()) return getRuntimePaths();
  await fsp.mkdir(runtimeParent, { recursive: true });
  const releaseLock = await acquireLock(onProgress);
  const cacheDirectory = assertOwnedPath(path.join(runtimeParent, '.cache'));
  const archive = assertOwnedPath(path.join(cacheDirectory, release.assetName));
  const partial = assertOwnedPath(`${archive}.partial`);
  const staging = assertOwnedPath(path.join(runtimeParent, `.obs-staging-${crypto.randomUUID()}`));
  let backup;
  try {
    if (await isReady()) return getRuntimePaths();
    if (fs.existsSync(runtimeRoot)) {
      let marker;
      try { marker = JSON.parse(await fsp.readFile(path.join(runtimeRoot, markerName), 'utf8')); } catch {}
      if (marker?.owner !== 'riftcast-director') throw new Error('runtime/obs-studio 已存在且没有导播运行时标记；请保留或移走该目录，再重新运行 npm run setup:obs。');
    }
    await fsp.mkdir(cacheDirectory, { recursive: true });
    if (!await validArchive(archive)) {
      await fsp.unlink(partial).catch(error => { if (error.code !== 'ENOENT') throw error; });
      onProgress(`首次准备：正在下载官方 OBS Studio ${release.version}（约 ${Math.ceil(release.size / 1024 / 1024)} MB）。`);
      await downloadArchive(partial);
      onProgress('正在核对 OBS ZIP 大小与官方 SHA-256。');
      if (!await validArchive(partial)) throw new Error('OBS ZIP 大小或 SHA-256 与官方发布不一致，已停止安装；请检查网络后重试。');
      await fsp.unlink(archive).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await fsp.rename(partial, archive);
    }
    onProgress('正在将官方 OBS 解压到导播软件的独立 runtime 目录。');
    await extractArchive(archive, staging);
    const fileHashes = {};
    for (const file of essentialFiles) fileHashes[file] = await sha256(assertOwnedPath(path.join(staging, file)));
    await fsp.copyFile(path.join(projectRoot, 'third-party', 'OBS-COPYING'), path.join(staging, 'COPYING'));
    await fsp.copyFile(path.join(projectRoot, 'THIRD_PARTY_OBS.md'), path.join(staging, 'RIFTCAST-OBS-NOTICE.md'));
    await fsp.writeFile(path.join(staging, 'portable_mode.txt'), '');
    if (fs.existsSync(runtimeRoot)) {
      const config = assertOwnedPath(path.join(runtimeRoot, 'config'));
      if (fs.existsSync(config)) await fsp.cp(config, path.join(staging, 'config'), { recursive: true, verbatimSymlinks: true });
    }
    await fsp.writeFile(path.join(staging, markerName), `${JSON.stringify({ owner: 'riftcast-director', version: release.version, archiveSize: release.size, archiveSha256: release.sha256, sourceUrl: release.url, preparedAt: new Date().toISOString(), files: fileHashes }, null, 2)}\n`);
    if (fs.existsSync(runtimeRoot)) {
      backup = assertOwnedPath(path.join(runtimeParent, `.obs-backup-${crypto.randomUUID()}`));
      await fsp.rename(runtimeRoot, backup);
    }
    try { await fsp.rename(staging, runtimeRoot); } catch (error) {
      if (backup) { await fsp.rename(backup, runtimeRoot); backup = undefined; }
      throw error;
    }
    if (backup) await fsp.rm(assertOwnedPath(backup), { recursive: true, force: true });
    onProgress(`官方 OBS Studio ${release.version} 已准备完成。`);
    return getRuntimePaths();
  } finally {
    await fsp.rm(assertOwnedPath(staging), { recursive: true, force: true }).catch(() => {});
    await fsp.unlink(partial).catch(() => {});
    await releaseLock();
  }
}

function ensureObs({ onProgress = () => {} } = {}) {
  if (!preparation) preparation = prepare(onProgress).finally(() => { preparation = undefined; });
  return preparation;
}

module.exports = { ensureObs, getRuntimePaths, isReady, release };

if (require.main === module) ensureObs({ onProgress: message => console.log(message) }).then(result => {
  console.log(`内置 OBS 就绪：${result.executablePath}`);
}).catch(error => {
  console.error(`内置 OBS 准备失败：${error.message}`);
  console.error('修复网络或目录问题后，重新启动导播软件或运行 npm run setup:obs 即可重试。');
  process.exitCode = 1;
});
