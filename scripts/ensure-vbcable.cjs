const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const spec = require('./vbcable-runtime.json');
async function ensureVbCable(root = path.resolve(__dirname, '..')) {
  const dir = path.join(root, 'runtime/vbcable'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'VBCABLE_Driver_Pack45.zip');
  const digest = buffer => createHash('sha256').update(buffer).digest('hex');
  if (!fs.existsSync(file) || digest(fs.readFileSync(file)) !== spec.sha256) {
    const response = await fetch(spec.url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('VB-CABLE 官方安装包下载失败');
    const contents = Buffer.from(await response.arrayBuffer());
    if (digest(contents) !== spec.sha256) throw new Error('VB-CABLE 官方安装包校验失败');
    fs.writeFileSync(file + '.tmp', contents); fs.renameSync(file + '.tmp', file);
  }
  fs.copyFileSync(path.join(root, 'THIRD_PARTY_AUDIO.md'), path.join(dir, 'THIRD_PARTY_AUDIO.md'));
  return file;
}
module.exports = { ensureVbCable };
if (require.main === module) ensureVbCable().then(file => process.stdout.write(file + '\n')).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
