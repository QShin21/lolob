import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseForTag, assertAssets } from './release-api-093.mjs';
import { source, releaseId, expected, assertRelease, assertMaintenanceOnly, assertBuildJob } from './finalize-release-093.mjs';

const release = () => ({
  id: releaseId, tag_name: 'v0.9.3', target_commitish: source, draft: true, prerelease: false,
  assets: expected.map(item => ({ id: item.id, name: item.name, state: 'uploaded', size: item.bytes, digest: `sha256:${item.sha256}` })),
});
const required = [
  'Verify version and source branch', 'Run npm run check', 'Windows tests including production OCR worker',
  'Verify report fixture through service restart', 'Run npm run build', 'Verify report layouts',
  'Build Windows Setup and ZIP', 'Verify isolated packaged report', 'Confirm exact new revision before publication',
];
const job = () => ({
  run_id: 38835808914, head_sha: source, status: 'completed',
  steps: [...required.map(name => ({ name, conclusion: 'success' })),
    { name: 'Publish verified release and check remote digests', conclusion: 'failure' }],
});

test('drafts are found on later pages without the published-only tag endpoint', () => {
  const draft = release();
  assert.equal(releaseForTag([[{ tag_name: 'v0.9.2' }], [draft]], 'v0.9.3'), draft);
});
test('published versions are also detected before creating a draft', () => {
  const published = { ...release(), draft: false };
  assert.equal(releaseForTag([[published]], 'v0.9.3'), published);
});
test('only a successful complete empty listing establishes absence', () => {
  assert.equal(releaseForTag([[]], 'v0.9.3'), undefined);
  assert.throws(() => releaseForTag({ message: 'Not Found' }, 'v0.9.3'));
  assert.throws(() => releaseForTag([{}], 'v0.9.3'));
});
test('duplicate tag drafts are rejected rather than guessed or overwritten', () => {
  assert.throws(() => releaseForTag([[release()], [release()]], 'v0.9.3'), /Multiple releases/);
});
test('the seven original assets validate regardless of API ordering', () => {
  const value = release(); value.assets.reverse();
  assert.doesNotThrow(() => assertRelease(value));
});
test('an already published exact release is safe to recognize on rerun', () => {
  assert.doesNotThrow(() => assertRelease({ ...release(), draft: false }));
});
test('different release identity, source, tag and prerelease are rejected', () => {
  for (const patch of [{ id: 1 }, { target_commitish: 'new' }, { tag_name: 'v0.9.4' }, { prerelease: true }, { draft: undefined }]) {
    assert.throws(() => assertRelease({ ...release(), ...patch }));
  }
  assert.throws(() => assertRelease(undefined));
});
test('every individual remote asset must have the exact ID, size, digest and upload state', () => {
  for (let index = 0; index < expected.length; index++) {
    for (const patch of [{ id: 1 }, { size: 0 }, { digest: null }, { digest: `sha256:${'0'.repeat(64)}` }, { state: 'new' }]) {
      const value = release(); Object.assign(value.assets[index], patch);
      assert.throws(() => assertRelease(value));
    }
  }
});
test('missing, additional and duplicate remote assets are refused', () => {
  const missing = release(); missing.assets.pop(); assert.throws(() => assertRelease(missing));
  const extra = release(); extra.assets.push({ ...extra.assets[0], name: 'extra.exe' }); assert.throws(() => assertRelease(extra));
  const duplicate = release(); duplicate.assets[1] = { ...duplicate.assets[0] }; assert.throws(() => assertRelease(duplicate));
});
test('duplicate or unsafe expected filenames cannot reach the download path', () => {
  assert.throws(() => assertAssets(release(), [...expected.slice(0, 6), expected[0]]));
  assert.throws(() => assertAssets(release(), [{ ...expected[0], name: '../asset' }, ...expected.slice(1)]));
});
test('only the enumerated release-maintenance files may change after the tested build', () => {
  assert.doesNotThrow(() => assertMaintenanceOnly(['scripts/publish-release-093.mjs', '.github/workflows/finalize-release-093.yml']));
  for (const file of ['server/state.ts', 'package.json', 'package-lock.json', '.github/workflows/release-093.yml', 'scripts/build-release.mjs']) {
    assert.throws(() => assertMaintenanceOnly([file]), /Application changed/);
  }
});
test('only the original completed Windows job with its final publication failure is accepted', () => {
  assert.doesNotThrow(() => assertBuildJob(job()));
  for (const patch of [{ run_id: 1 }, { head_sha: 'other' }, { status: 'in_progress' }]) {
    assert.throws(() => assertBuildJob({ ...job(), ...patch }));
  }
});
test('all build and verification gates must have succeeded exactly once', () => {
  for (let index = 0; index < required.length; index++) {
    const failed = job(); failed.steps[index].conclusion = 'failure'; assert.throws(() => assertBuildJob(failed));
    const skipped = job(); skipped.steps[index].conclusion = 'skipped'; assert.throws(() => assertBuildJob(skipped));
    const missing = job(); missing.steps.splice(index, 1); assert.throws(() => assertBuildJob(missing));
  }
  const duplicate = job(); duplicate.steps.push(duplicate.steps[0]); assert.throws(() => assertBuildJob(duplicate));
});
test('additional failure or unconfirmed original result stops recovery', () => {
  const more = job(); more.steps.push({ name: 'Other failure', conclusion: 'failure' }); assert.throws(() => assertBuildJob(more));
  const noFailure = job(); noFailure.steps.at(-1).conclusion = 'success'; assert.throws(() => assertBuildJob(noFailure));
});
