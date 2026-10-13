// SPDX-License-Identifier: GPL-2.0-or-later
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const obs = require('./obs-runtime.json');

const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(file, args, cwd) {
  const result = spawnSync(file, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (result.error || result.status !== 0) throw new Error('音频桥接组件构建失败：' + (result.stderr || result.error?.message || file).slice(0, 2400));
}
async function ensureAudioBridge(root = path.resolve(__dirname, '..')) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('节目音频桥接当前支持 Windows x64');
  const source = path.join(root, 'scripts/native'), binary = path.join(root, 'scripts/bin');
  fs.mkdirSync(binary, { recursive: true });
  const output = path.join(binary, 'riftcast-audio-bridge.dll'), tool = path.join(binary, 'audio-device-tool.exe');
  const inputs = ['audio-endpoints.hpp', 'audio-device-tool.cpp', 'obs-audio-bridge.cpp', 'riftcast-audio.lua'].map(file => [file, sha(path.join(source, file))]);
  const sourceSha256 = createHash('sha256').update(JSON.stringify({ obs: obs.sourceSha256, inputs, build: sha(__filename) })).digest('hex');
  const manifest = output + '.json';
  let current = false;
  try { const m = JSON.parse(fs.readFileSync(manifest, 'utf8')); current = m.sourceSha256 === sourceSha256 && m.bridgeSha256 === sha(output) && m.toolSha256 === sha(tool); } catch {}
  if (!current) {
    const build = path.join(root, 'build/audio-sdk'); fs.mkdirSync(build, { recursive: true });
    const archive = path.join(root, 'build/third-party', 'OBS-Studio-' + obs.version + '-Sources.tar.gz');
    if (!fs.existsSync(archive) || sha(archive) !== obs.sourceSha256) {
      fs.mkdirSync(path.dirname(archive), { recursive: true });
      const response = await fetch(obs.sourceUrl, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error('无法下载同版本 OBS 音频 SDK');
      const contents = Buffer.from(await response.arrayBuffer());
      if (createHash('sha256').update(contents).digest('hex') !== obs.sourceSha256) throw new Error('OBS 音频 SDK 校验失败');
      fs.writeFileSync(archive, contents);
    }
    const extracted = 'obs-studio-' + obs.version + '-sources';
    run('tar.exe', ['-xf', archive, '-C', build, extracted + '/libobs', extracted + '/plugins/obs-websocket/lib/obs-websocket-api.h'], root);
    const headers = path.join(build, extracted, 'libobs');
    fs.writeFileSync(path.join(headers, 'obsconfig.h'), '#pragma once\n#define OBS_RELEASE_CANDIDATE 0\n#define OBS_BETA 0\n#define OBS_DATA_PATH "../../data"\n#define OBS_INSTALL_PREFIX ""\n');
    const compiler = [process.env.RIFTCAST_CXX, 'C:\\Strawberry\\c\\bin\\g++.exe', 'g++.exe'].filter(Boolean).find(file => spawnSync(file, ['--version'], { windowsHide: true }).status === 0);
    if (!compiler) throw new Error('节目音频组件缺少 Windows x64 C++ 编译器');
    const compilerDir = path.dirname(compiler);
    run(path.join(compilerDir, 'gendef.exe'), [path.join(root, 'runtime/obs-studio/bin/64bit/obs.dll')], build);
    run(path.join(compilerDir, 'dlltool.exe'), ['-d', path.join(build, 'obs.def'), '-l', path.join(build, 'libobs.a'), '-D', 'obs.dll'], build);
    const common = ['-std=c++17', '-O2', '-Wall', '-Wextra', '-D_M_X64', '-static-libgcc', '-static-libstdc++', '-s'];
    run(compiler, [...common, '-shared', '-I' + headers, '-I' + path.join(build, extracted, 'plugins/obs-websocket/lib'), path.join(source, 'obs-audio-bridge.cpp'), '-o', output, path.join(build, 'libobs.a'), '-lole32', '-luuid', '-lpropsys', '-lwinpthread', '-static'], root);
    run(compiler, [...common, '-municode', '-static', path.join(source, 'audio-device-tool.cpp'), '-o', tool, '-lole32', '-luuid', '-lpropsys', '-ladvapi32'], root);
    fs.writeFileSync(manifest, JSON.stringify({ sourceSha256, bridgeSha256: sha(output), toolSha256: sha(tool), obsSourceSha256: obs.sourceSha256, architecture: 'x64', protocol: 1 }, null, 2) + '\n');
  }
  // Include extension hashes in the runtime marker so an upgrade migrates the
  // owned runtime even when the underlying OBS version remains unchanged.
  const runtime = path.join(root, 'runtime/obs-studio');
  const libraryFile = 'bin/64bit/riftcast-audio-bridge.dll', scriptFile = 'data/riftcast/riftcast-audio.lua';
  fs.mkdirSync(path.dirname(path.join(runtime, scriptFile)), { recursive: true });
  fs.copyFileSync(output, path.join(runtime, libraryFile)); fs.copyFileSync(path.join(source, 'riftcast-audio.lua'), path.join(runtime, scriptFile));
  const markerFile = path.join(runtime, '.riftcast-runtime.json'), marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
  marker.files[libraryFile] = sha(output); marker.files[scriptFile] = sha(path.join(source, 'riftcast-audio.lua'));
  marker.extensions = { ...marker.extensions, programAudio: { protocol: 1, sourceSha256 } };
  fs.writeFileSync(markerFile, JSON.stringify(marker, null, 2) + '\n');
  return { library: output, tool, manifest };
}
module.exports = { ensureAudioBridge };
if (require.main === module) ensureAudioBridge().then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
