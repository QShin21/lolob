// Serialized by the desktop's projector queue, independently of embedded monitors.
function createProgramWindow({ monitor, command }) {
  let owned;
  const args = p => ['--pid', p.obsProcessId, '--kind', 'output', '--hwnd', p.hwnd];
  async function status() {
    if (!owned) return { open: false };
    const result = await command('find', ['--pid', owned.obsProcessId, '--kind', 'output']).catch(error => {
      if (error.code === 'process_unavailable' || error.code === 'process_is_not_obs') return null;
      throw error;
    });
    const window = result?.windows.find(w => w.hwnd === owned.hwnd);
    if (!window) { owned = undefined; return { open: false }; }
    return { open: true, minimized: window.minimized, title: window.title };
  }
  async function close() {
    await status();
    if (owned) {
      const result = await command('close', args(owned));
      if (!result.closed) throw new Error('节目窗口正在关闭，请稍后重试');
      owned = undefined;
    }
    return { open: false };
  }
  async function open() {
    if ((await status()).open) {
      await command('show-output', args(owned));
      return status();
    }
    const metadata = await monitor('program', false);
    const pid = metadata.obsProcessId;
    const before = await command('find', ['--pid', pid, '--kind', 'program']);
    const existing = new Set(before.windows.map(w => w.hwnd));
    await monitor('program', true);
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const found = await command('find', ['--pid', pid, '--kind', 'program']);
      const window = found.windows.find(w => !existing.has(w.hwnd) && w.visible && !w.minimized);
      if (window) {
        try {
          await command('make-output', ['--pid', pid, '--kind', 'program', '--hwnd', window.hwnd]);
          owned = { obsProcessId: pid, hwnd: window.hwnd };
          return status();
        } catch (error) {
          await command('close', ['--pid', pid, '--kind', 'program', '--hwnd', window.hwnd]).catch(() => {});
          throw error;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('独立节目窗口创建超时，请刷新引擎后重试');
  }
  return { status, open, close, get owned() { return !!owned; } };
}
module.exports = { createProgramWindow };
