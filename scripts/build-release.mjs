import fs from 'node:fs';
import { mkdir, readFile, writeFile, readdir, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import sharp from 'sharp';
import { tsImport } from 'tsx/esm/api';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const output = path.join(root, 'release', pkg.version);
const buildRoot = path.join(root, 'build');
const evidence = path.join(root, 'verification-output', `release-${pkg.version}`);
await mkdir(buildRoot, { recursive: true });
await mkdir(evidence, { recursive: true });
function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit', windowsHide: true, timeout: 180000 });
  if (result.error || result.status !== 0) throw new Error(`Release 构建未完成：${path.basename(script)} (${result.status ?? result.error?.code})`);
}
const digest = async file => { const hash = createHash('sha256'); for await (const part of fs.createReadStream(file)) hash.update(part); return hash.digest('hex'); };
function git(args) { const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }); if (result.status !== 0) throw new Error('无法读取 Release 源码版本'); return result.stdout.trim(); }

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('请在 Windows x64 上构建此 Release。');
run(path.join(root, 'scripts', 'ensure-electron.cjs'));
await require('./ensure-obs.cjs').ensureObs({ onProgress: console.log });
require('./build-obs-projector-helper.cjs').ensureProjectorHelper();
await require('./build-audio-bridge.cjs').ensureAudioBridge();
await require('./ensure-vbcable.cjs').ensureVbCable();
run(path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), ['--noEmit']);
run(path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), ['build']);
const serviceBundle = await bundle({ entryPoints: [path.join(root, 'server/index.ts')], outfile: path.join(buildRoot, 'service/index.mjs'), bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node22', sourcemap: false, legalComments: 'eof', metafile: true });
if (Object.keys(serviceBundle.metafile.inputs).some(file => /(?:test-support|\.test\.[cm]?[jt]sx?$)/.test(file))) throw new Error('测试文件进入服务打包输入，已阻止发布。');
const runtimeImports = [...new Set(Object.values(serviceBundle.metafile.outputs).flatMap(output => output.imports).filter(item => item.external && !item.path.startsWith('node:')).map(item => item.path.startsWith('@') ? item.path.split('/').slice(0, 2).join('/') : item.path.split('/')[0]))];
for (const dependency of runtimeImports) if (!pkg.dependencies?.[dependency]) throw new Error(`Release 运行时依赖 ${dependency} 尚未列入 dependencies，请先修复后再打包。`);

const icon = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="52" fill="#080c12"/><path fill="#76f0c2" d="M59 54h76c43 0 65 20 65 52 0 25-14 43-37 50l42 47h-47l-40-44H97v44H59V54zm38 34v38h34c20 0 30-6 30-19s-10-19-30-19H97z"/><circle cx="202" cy="45" r="10" fill="#76f0c2"/></svg>')).png().toBuffer();
const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header[8] = 0; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(icon.length, 14); header.writeUInt32LE(22, 18);
await writeFile(path.join(buildRoot, 'icon.ico'), Buffer.concat([header, icon]));
await writeFile(path.join(buildRoot, 'icon.png'), icon);

const obsRelease = require('./obs-runtime.json');
const licenseRoot = path.join(buildRoot, 'third-party');
await mkdir(licenseRoot, { recursive: true });
const sourceArchive = path.join(licenseRoot, `OBS-Studio-${obsRelease.version}-Sources.tar.gz`);
if (!fs.existsSync(sourceArchive) || await digest(sourceArchive) !== obsRelease.sourceSha256) {
  console.log('准备随包分发的同版本 OBS 完整对应源码。');
  const response = await fetch(obsRelease.sourceUrl, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`OBS 对应源码下载失败 (${response.status})`);
  const temporary = `${sourceArchive}.partial`;
  const { pipeline } = await import('node:stream/promises');
  await pipeline(response.body, fs.createWriteStream(temporary));
  if (await digest(temporary) !== obsRelease.sourceSha256) throw new Error('OBS 完整对应源码校验失败');
  fs.renameSync(temporary, sourceArchive);
}
await copyFile(path.join(root, 'third-party/OBS-COPYING'), path.join(licenseRoot, 'OBS-COPYING'));
await copyFile(path.join(root, 'THIRD_PARTY_OBS.md'), path.join(licenseRoot, 'THIRD_PARTY_OBS.md'));
await copyFile(path.join(root, 'THIRD_PARTY_AUDIO.md'), path.join(licenseRoot, 'THIRD_PARTY_AUDIO.md'));
const audioSources = path.join(licenseRoot, 'RiftCast-Audio-Source');
await mkdir(audioSources, { recursive: true });
await mkdir(path.join(audioSources, 'scripts/native'), { recursive: true });
for (const file of ['audio-endpoints.hpp', 'audio-device-tool.cpp', 'obs-audio-bridge.cpp', 'riftcast-audio.lua']) await copyFile(path.join(root, 'scripts/native', file), path.join(audioSources, 'scripts/native', file));
await copyFile(path.join(root, 'scripts/build-audio-bridge.cjs'), path.join(audioSources, 'scripts/build-audio-bridge.cjs'));
await copyFile(path.join(root, 'scripts/obs-runtime.json'), path.join(audioSources, 'scripts/obs-runtime.json'));
await copyFile(path.join(root, 'third-party/OBS-COPYING'), path.join(audioSources, 'COPYING'));
await writeFile(path.join(audioSources, 'BUILDING.md'), '# Build the RiftCast audio components\n\nInstall Windows x64 Node.js and a MinGW-w64 g++ compiler (the release uses Strawberry C toolchain). Extract the unmodified OBS Studio 32.2.2 Windows x64 runtime to runtime/obs-studio. Place the matching OBS-Studio-32.2.2-Sources.tar.gz included beside this source directory in build/third-party, or let the script download the pinned official source archive. Keep this directory layout and run node scripts/build-audio-bridge.cjs. RIFTCAST_CXX can name the compiler executable; gendef.exe and dlltool.exe must be in its directory. The script extracts the exact headers, generates an import library from the official obs.dll, compiles both native programs and checks their source and binary SHA-256. It copies only the owned extension into the portable runtime. The OBS runtime marker is normally created by scripts/ensure-obs.cjs in the full RiftCast source repository; for an independent component build provide its owner/version/archiveSha256/files marker from the supplied runtime.\n');
const sources = {};
for (const file of git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean)) {
  if (fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile()) sources[file] = await digest(path.join(root, file));
}
const manifest = { product: 'RiftCast', version: pkg.version, platform: 'Windows x64', builtAt: new Date().toISOString(), sourceRevision: git(['rev-parse', 'HEAD']), workingTreeDirty: Boolean(git(['status', '--porcelain'])), sourceDigest: createHash('sha256').update(JSON.stringify(sources)).digest('hex'), electronVersion: require('electron/package.json').version, obsVersion: obsRelease.version, runtimeImports, sourceFiles: sources };
await writeFile(path.join(buildRoot, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const { build } = require('electron-builder');
await build({ config: { ...require('../electron-builder.cjs'), extraMetadata: { riftcastRelease: { builtAt: manifest.builtAt, sourceRevision: manifest.sourceRevision, workingTreeDirty: manifest.workingTreeDirty, sourceDigest: manifest.sourceDigest } } }, publish: 'never' });
const { builtinStyleArchive } = await tsImport('../server/style-packs.ts', import.meta.url);
const { BUILTIN_RUNTIME_STYLES } = await tsImport('../shared/style-packs.ts', import.meta.url);
for (const pack of BUILTIN_RUNTIME_STYLES) await writeFile(path.join(output, `RiftCast-${pkg.version}-${pack.id}.riftstyle.zip`), builtinStyleArchive(pack));
run(path.join(root,'scripts/export-draft-art.mjs'),[output]);
const artifacts = [];
for (const name of await readdir(output)) if (/\.(exe|zip|blockmap)$/.test(name)) { const file = path.join(output, name); artifacts.push({ name, bytes: (await stat(file)).size, sha256: await digest(file) }); }
await writeFile(path.join(output, 'release-manifest.json'), JSON.stringify({ ...manifest, artifacts }, null, 2) + '\n');
await writeFile(path.join(output, 'SHA256SUMS.txt'), artifacts.map(file => `${file.sha256}  ${file.name}`).join('\n') + '\n');
await copyFile(path.join(root, 'docs', `Windows-Release-${pkg.version}.md`), path.join(output, '使用说明.md'));
await writeFile(path.join(evidence, 'build-report.json'), JSON.stringify({ status: 'passed', ...manifest, artifacts }, null, 2) + '\n');
console.log(JSON.stringify({ version: pkg.version, output, artifacts }, null, 2));
