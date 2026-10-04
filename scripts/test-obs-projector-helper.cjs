const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { ensureProjectorHelper } = require('./build-obs-projector-helper.cjs');

const executable = ensureProjectorHelper();
const run = args => {
  const result = spawnSync(executable, args, { windowsHide: true, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined);
  return { status: result.status, body: JSON.parse(result.stdout) };
};
assert.equal(run(['self-test']).body.ok, true);
assert.deepEqual(run(['list', '--pid', '0']), { status: 1, body: { error: 'invalid_number' } });
assert.deepEqual(run(['park', '--pid', String(process.pid), '--kind', 'program', '--hwnd', '1', '--host-hwnd', '2', '--host-pid', String(process.pid), '--width', '960', '--height', '540']), { status: 1, body: { error: 'process_is_not_obs' } });
assert.deepEqual(run(['close', '--pid', String(process.pid), '--kind', 'program', '--hwnd', '1']), { status: 1, body: { error: 'process_is_not_obs' } });
assert.deepEqual(run(['list', '--pid', String(process.pid), '--pid', String(process.pid)]), { status: 1, body: { error: 'invalid_arguments' } });
assert.deepEqual(run(['find', '--pid', '1', '--kind']), { status: 1, body: { error: 'invalid_arguments' } });
if (process.env.RIFTCAST_TEST_OBS_PID) {
  const found = run(['list', '--pid', process.env.RIFTCAST_TEST_OBS_PID]);
  assert.equal(found.status, 0);
  assert.ok(Array.isArray(found.body.windows));
  for (const window of found.body.windows) {
    assert.match(window.hwnd, /^\d+$/);
    assert.ok(['program', 'preview'].includes(window.kind));
  }
}
process.stdout.write('OBS projector helper: ownership rejection, numeric validation, localized identities and read-only enumeration passed.\n');
