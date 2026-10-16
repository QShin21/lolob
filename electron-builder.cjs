const path = require('node:path');
const { createRequire } = require('node:module');
const version = require('./package.json').version;
module.exports = {
  appId: 'cn.riftcast.director',
  productName: 'RiftCast',
  copyright: 'RiftCast contributors',
  electronVersion: require('electron/package.json').version,
  electronDist: path.join(__dirname, 'node_modules', 'electron', 'dist'),
  directories: { output: `release/${version}`, buildResources: 'build' },
  asar: false,
  npmRebuild: false,
  afterPack: async context => {
    const appRoot = path.join(context.appOutDir, 'resources', 'app');
    const runtimeRequire = createRequire(path.join(appRoot, 'package.json'));
    const bundledPrefix = path.resolve(appRoot, 'node_modules').toLowerCase() + path.sep;
    for (const dependency of require('./build/release-manifest.json').runtimeImports) {
      if (!runtimeRequire.resolve(dependency).toLowerCase().startsWith(bundledPrefix)) throw new Error(`运行时依赖 ${dependency} 缺失，已阻止生成安装包。`);
    }
    runtimeRequire('sharp');
    const fs = require('node:fs');
    const { createHash } = require('node:crypto');
    for (const entry of require('./shared/style-pack-catalog.json').entries) {
      for (const [file, expected] of Object.entries(entry.hashes)) {
        const location = path.join(appRoot, 'dist/style-packs', entry.manifest.id, entry.revision, file);
        if (!fs.existsSync(location) || createHash('sha256').update(fs.readFileSync(location)).digest('hex') !== expected) throw new Error('内置风格贴图缺失或损坏: ' + entry.manifest.name + '/' + file);
      }
    }
    for (const champion of require('./shared/champion-art-catalog.json').champions) {
      if (!fs.existsSync(path.join(appRoot, 'dist/champion-art', champion.id + '-icon.webp'))) throw new Error('OCR 内置头像缺失: ' + champion.id);
    }
    for (const banner of require('./shared/lineup-banner-catalog.json').champions) {
      if (!fs.existsSync(path.join(appRoot, 'dist/lineup-banners', banner.id + '.webp'))) throw new Error('首发横幅缺失: ' + banner.id);
    }
    for (const rune of require('./shared/rune-catalog.json').runes) {
      if (!fs.existsSync(path.join(appRoot, 'dist/runes', rune.id + '.png'))) throw new Error('内置符文图标缺失: ' + rune.id);
    }
    if (!Object.keys(require.cache).some(file => file.toLowerCase().startsWith(bundledPrefix) && file.endsWith('.node'))) throw new Error('图片处理原生组件缺失，已阻止生成安装包。');
  },
  files: [
    'electron/**/*', 'dist/**/*', 'package.json',
    { from: 'build/service', to: 'server', filter: ['index.mjs'] },
    'scripts/ensure-obs.cjs', 'scripts/obs-runtime.json', 'scripts/build-obs-projector-helper.cjs',
    'scripts/bin/obs-projector-window.exe', 'scripts/bin/obs-projector-window.exe.json',
    'scripts/native/obs-projector-window.cpp', 'scripts/spectator-ocr-worker.ps1',
    'scripts/bin/audio-device-tool.exe', 'scripts/bin/riftcast-audio-bridge.dll.json',
    'scripts/vbcable-runtime.json', 'THIRD_PARTY_AUDIO.md',
    'scripts/read-spectator-gold.ps1', 'scripts/spectator-portrait-matcher.cs',
    'THIRD_PARTY_OBS.md', 'third-party/OBS-COPYING',
  ],
  extraResources: [
    { from: 'runtime/obs-studio', to: 'obs-studio', filter: ['bin/**/*', 'data/**/*', 'obs-plugins/**/*', 'COPYING', 'portable_mode.txt', '.riftcast-runtime.json', 'RIFTCAST-OBS-NOTICE.md'] },
    { from: 'runtime/vbcable', to: 'vbcable', filter: ['VBCABLE_Driver_Pack45.zip', 'THIRD_PARTY_AUDIO.md'] },
    { from: 'build/third-party', to: 'licenses', filter: ['**/*'] },
    { from: 'build/release-manifest.json', to: 'release-manifest.json' },
  ],
  win: { target: [{ target: 'nsis', arch: ['x64'] }, { target: 'zip', arch: ['x64'] }], icon: 'build/icon.ico', executableName: 'RiftCast', artifactName: 'RiftCast-${version}-Windows-${arch}.${ext}', requestedExecutionLevel: 'asInvoker' },
  nsis: { artifactName: 'RiftCast-${version}-Setup-${arch}.${ext}', oneClick: false, perMachine: false, allowElevation: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: 'always', createStartMenuShortcut: true, shortcutName: 'RiftCast 导播', runAfterFinish: false, deleteAppDataOnUninstall: false, installerLanguages: ['zh_CN', 'en_US'], language: '2052' },
};
