const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const electronRoot = path.join(projectRoot, 'node_modules', 'electron');
const installer = path.join(electronRoot, 'install.js');

function installed() {
  try {
    const version = JSON.parse(fs.readFileSync(path.join(electronRoot, 'package.json'), 'utf8')).version;
    const installedVersion = fs.readFileSync(path.join(electronRoot, 'dist', 'version'), 'utf8').trim().replace(/^v/, '');
    const executable = fs.readFileSync(path.join(electronRoot, 'path.txt'), 'utf8').trim();
    return installedVersion === version && fs.existsSync(path.join(electronRoot, 'dist', executable));
  } catch { return false; }
}

function install(env) {
  const result = spawnSync(process.execPath, [installer], {
    cwd: projectRoot, env, stdio: 'inherit', windowsHide: true, timeout: 5 * 60 * 1000,
  });
  if (result.error) console.error(`Electron 安装未完成：${result.error.message}`);
  return result.status === 0 && installed();
}

if (!installed()) {
  if (!fs.existsSync(installer)) {
    console.error('缺少 Electron 依赖，请在项目目录运行 npm install 后重试。');
    process.exit(1);
  }
  const env = { ...process.env };
  if (env.ELECTRON_GET_USE_PROXY === undefined && (env.HTTPS_PROXY || env.HTTP_PROXY || env.ALL_PROXY)) {
    env.ELECTRON_GET_USE_PROXY = '1';
  }
  console.log('正在下载 Electron 桌面运行环境，并验证官方校验和。');
  if (!install(env)) {
    if (env.ELECTRON_MIRROR) {
      console.error('Electron 下载失败，请检查已有的 ELECTRON_MIRROR 配置或网络。');
      process.exit(1);
    }
    console.log('官方发布源下载失败，正在使用 npmmirror 镜像重试。');
    if (!install({ ...env, ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/', ELECTRON_CUSTOM_DIR: '{{ version }}' })) {
      console.error('Electron 下载失败，请检查网络后重试。需要先使用浏览器版时，可运行启动导播.cmd -Browser。');
      process.exit(1);
    }
  }
  console.log('Electron 桌面运行环境已就绪。');
}
