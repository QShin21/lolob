const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function ensureProjectorHelper(root = path.resolve(__dirname, '..')) {
  if (process.platform !== 'win32') throw new Error('OBS 原生预览当前支持 Windows');
  const source = path.join(root, 'scripts', 'native', 'obs-projector-window.cpp');
  const output = path.join(root, 'scripts', 'bin', 'obs-projector-window.exe');
  const manifest = `${output}.json`;
  const sourceSha256 = createHash('sha256').update(readFileSync(source)).digest('hex');
  if (existsSync(output) && existsSync(manifest)) {
    try {
      const saved = JSON.parse(readFileSync(manifest, 'utf8'));
      const executableSha256 = createHash('sha256').update(readFileSync(output)).digest('hex');
      if (saved.sourceSha256 === sourceSha256 && saved.executableSha256 === executableSha256) return output;
    } catch { /* Repair a missing or stale build. */ }
  }
  const candidates = [process.env.RIFTCAST_CXX, 'C:\\Strawberry\\c\\bin\\g++.exe', 'g++.exe'].filter(Boolean);
  const compiler = candidates.find(candidate => spawnSync(candidate, ['--version'], { windowsHide: true, encoding: 'utf8' }).status === 0);
  if (!compiler) throw new Error('OBS 原生预览辅助程序缺失，请重新准备完整应用运行时');
  mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp.exe`;
  const result = spawnSync(compiler, ['-std=c++17', '-O2', '-Wall', '-Wextra', '-municode', '-static', '-static-libgcc', '-static-libstdc++', '-s', source, '-o', temporary, '-luser32'], { windowsHide: true, encoding: 'utf8', timeout: 60000 });
  if (result.error || result.status !== 0) {
    try { unlinkSync(temporary); } catch {}
    throw new Error(`OBS 原生预览辅助程序编译失败${result.stderr ? `：${result.stderr.trim().slice(0, 2000)}` : ''}`);
  }
  const tested = spawnSync(temporary, ['self-test'], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
  if (tested.status !== 0) { try { unlinkSync(temporary); } catch {} throw new Error('OBS 原生预览辅助程序自检失败'); }
  renameSync(temporary, output);
  writeFileSync(manifest, JSON.stringify({ sourceSha256, executableSha256: createHash('sha256').update(readFileSync(output)).digest('hex'), architecture: 'x64', purpose: 'Owned OBS projector positioning for continuous native capture' }, null, 2) + '\n', 'utf8');
  return output;
}

module.exports = { ensureProjectorHelper };
if (require.main === module) {
  try { process.stdout.write(`${ensureProjectorHelper()}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
