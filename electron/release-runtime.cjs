const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const requiredFiles = ['bin/64bit/obs64.exe', 'bin/64bit/obs.dll', 'obs-plugins/64bit/obs-websocket.dll'];
function marker(folder) {
  try { return JSON.parse(fs.readFileSync(path.join(folder, '.riftcast-runtime.json'), 'utf8')); }
  catch { return undefined; }
}
function hash(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function ready(folder, expected) {
  const saved = marker(folder);
  return saved?.owner === 'riftcast-director' && saved.version === expected.version && saved.archiveSha256 === expected.archiveSha256 &&
    [...new Set([...requiredFiles, ...Object.keys(expected.files || {})])].every(file => fs.existsSync(path.join(folder, file)) && expected.files?.[file] === hash(path.join(folder, file))) &&
    fs.existsSync(path.join(folder, 'COPYING')) && fs.existsSync(path.join(folder, 'portable_mode.txt'));
}
function rejectLinks(folder) {
  if (fs.lstatSync(folder).isSymbolicLink()) throw new Error('Release 数据导入路径包含链接，请使用普通目录。');
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const target = path.join(folder, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Release 数据导入目录包含链接，请先检查原数据。');
    if (entry.isDirectory()) rejectLinks(target);
  }
}

/** Copy only explicitly supplied local data. Shared installers never contain operator data. */
function prepareReleaseRuntime({ resourcesRoot, userData, dataDir, runtimeRoot, importFrom, onProgress = () => {} }) {
  dataDir = path.resolve(dataDir || path.join(userData, 'data'));
  runtimeRoot = path.resolve(runtimeRoot || path.join(userData, 'runtime', 'obs-studio'));
  const bundled = path.join(resourcesRoot, 'obs-studio');
  const expected = marker(bundled);
  if (!expected || !ready(bundled, expected)) throw new Error('安装包内置 OBS 文件校验失败，请重新安装完整的 RiftCast Release。');
  const source = importFrom ? path.resolve(importFrom) : undefined;
  const sourceData = source && path.join(source, 'data');
  const sourceConfig = source && path.join(source, 'runtime', 'obs-studio', 'config');
  fs.mkdirSync(userData, { recursive: true });

  if (sourceData && !fs.existsSync(dataDir)) {
    if (!fs.existsSync(path.join(sourceData, 'state.json'))) throw new Error('所选原项目缺少赛事数据，Release 已停止导入。');
    rejectLinks(sourceData);
    onProgress('正在复制原项目赛事资料与素材，原文件继续保留。');
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    const staging = path.join(path.dirname(dataDir), `.riftcast-data-import-${randomUUID()}`);
    fs.cpSync(sourceData, staging, { recursive: true, errorOnExist: true, force: false });
    fs.renameSync(staging, dataDir);
    fs.writeFileSync(path.join(userData, 'migration.json'), JSON.stringify({ importedAt: new Date().toISOString(), source, dataDir, sourceStateSha256: hash(path.join(sourceData, 'state.json')) }, null, 2) + '\n');
  }

  if (!ready(runtimeRoot, expected)) {
    if (fs.existsSync(runtimeRoot) && marker(runtimeRoot)?.owner !== 'riftcast-director') throw new Error('内置引擎目标目录已存在且来源未知，请保留该目录并重新选择数据位置。');
    onProgress(`正在从安装包准备内置 OBS ${expected.version}，无需联网下载。`);
    const parent = path.dirname(runtimeRoot);
    fs.mkdirSync(parent, { recursive: true });
    const staging = path.join(parent, `.riftcast-obs-install-${randomUUID()}`);
    fs.cpSync(bundled, staging, { recursive: true, errorOnExist: true, force: false });
    const existingConfig = path.join(runtimeRoot, 'config');
    const config = fs.existsSync(existingConfig) ? existingConfig : sourceConfig && fs.existsSync(sourceConfig) ? sourceConfig : undefined;
    if (config) {
      rejectLinks(config);
      fs.cpSync(config, path.join(staging, 'config'), { recursive: true });
    }
    const backup = fs.existsSync(runtimeRoot) ? path.join(parent, `.riftcast-obs-backup-${randomUUID()}`) : undefined;
    if (backup) fs.renameSync(runtimeRoot, backup);
    try { fs.renameSync(staging, runtimeRoot); }
    catch (error) { if (backup) fs.renameSync(backup, runtimeRoot); throw error; }
  }
  return { dataDir, runtimeRoot };
}
module.exports = { prepareReleaseRuntime };
