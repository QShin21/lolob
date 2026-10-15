const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProgramWindow } = require('../electron/program-window.cjs');

function fixture() {
  const windows = [{ hwnd: '10', kind: 'program', visible: true }];
  const calls = [];
  let failFind = false, pendingClose = false, serial = 10;
  const controller = createProgramWindow({
    monitor: async (_kind, open) => {
      if (open) windows.push({ hwnd: String(++serial), kind: 'program', visible: true });
      return { obsProcessId: 123 };
    },
    command: async (action, args) => {
      calls.push({ action, args });
      const kind = args[args.indexOf('--kind') + 1];
      const hwnd = args[args.indexOf('--hwnd') + 1];
      if (action === 'find') {
        if (failFind) throw new Error('temporary error');
        return { windows: windows.filter(w => w.kind === kind) };
      }
      const window = windows.find(w => w.hwnd === hwnd);
      assert.ok(window);
      if (action === 'make-output') { window.kind = 'output'; window.title = 'RiftCast 节目输出'; }
      if (action === 'close') {
        if (pendingClose) return { closed: false };
        windows.splice(windows.indexOf(window), 1);
        return { closed: true };
      }
      return { open: true };
    },
  });
  return { controller, windows, calls, fail: value => failFind = value, pending: value => pendingClose = value };
}
test('dedicated output preserves existing monitor and reuses only its own handle', async () => {
  const f = fixture();
  assert.equal((await f.controller.open()).open, true);
  await f.controller.open();
  assert.equal(f.windows.length, 2);
  assert.equal(f.windows[0].kind, 'program');
  assert.equal(f.calls.filter(c => c.action === 'make-output').length, 1);
  await f.controller.close();
  assert.deepEqual(f.windows.map(w => w.hwnd), ['10']);
});
test('manual window closure is detected and reopening creates a fresh output', async () => {
  const f = fixture(); await f.controller.open();
  f.windows.pop();
  assert.equal((await f.controller.status()).open, false);
  await f.controller.open();
  assert.equal(f.windows[1].hwnd, '12');
});
test('temporary status errors and pending close retain ownership for recovery', async () => {
  const f = fixture(); await f.controller.open(); f.fail(true);
  await assert.rejects(f.controller.open(), /temporary/);
  assert.equal(f.controller.owned, true);
  f.fail(false); f.pending(true);
  await assert.rejects(f.controller.close(), /正在关闭/);
  assert.equal(f.controller.owned, true);
  f.pending(false); await f.controller.close();
  assert.equal(f.controller.owned, false);
});
