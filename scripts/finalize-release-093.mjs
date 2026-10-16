import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { api, apiRoot, repository, findRelease, assertAssets } from './release-api-093.mjs';

export const source = '3c54ad57361210b638179872a2714820b7f0d7af';
export const releaseId = 414444360;
const tag = 'v0.9.3';
const originalRun = 38835808914;
// These hashes are pinned to the independently retrieved original build evidence.
// No artifact upload, replacement, release deletion or tag movement is permitted.
export const expected = [
  { id: 645783192, name: 'RiftCast-0.9.3-Setup-x64.exe', bytes: 304551509, sha256: '84e216df603300321f4a0bab261e8d789cec13c092b74b8a23ba1cfa72b923a2' },
  { id: 645783189, name: 'RiftCast-0.9.3-Setup-x64.exe.blockmap', bytes: 316174, sha256: '7fa24e0c3614cb5d911e5a111000aa887c8ebaef41b3c9c798c1bb46e1cb0625' },
  { id: 645783197, name: 'RiftCast-0.9.3-Windows-x64.zip', bytes: 403761619, sha256: 'f1b5bdcab020432c47a9c4651ca5d396efcad20d68984d571196ec1171dd0b7d' },
  { id: 645783188, name: 'release-manifest.json', bytes: 334092, sha256: 'ff1d77b3dfc4169e80974bc6083cd0ac1e7310790d9bd65c9a736f2f1cedda29' },
  { id: 645783202, name: 'SHA256SUMS.txt', bytes: 296, sha256: '07ba6e7d1e3ec7b036d888d12e72cb4058d59a1375471fa683047dd5d52a69b8' },
  { id: 645783226, name: 'RiftCast-0.9.3-Usage.md', bytes: 4306, sha256: 'd67dc3d69aa56db0678be3d0bab49912fd655a597d5c9f8bf8053789356b0099' },
  { id: 645783228, name: 'verification.json', bytes: 590, sha256: '9725b20248609c6d5bd65dc589b18ced982098c119fbca401b4cc0e92a66ec87' },
];
const maintenanceFiles = new Set([
  'scripts/release-api-093.mjs', 'scripts/publish-release-093.mjs',
  'scripts/finalize-release-093.mjs', 'scripts/release-api-093.test.mjs',
  '.github/workflows/finalize-release-093.yml',
]);

export function assertMaintenanceOnly(changed) {
  for (const file of changed) assert.ok(maintenanceFiles.has(file), `Application changed after verified build: ${file}`);
}
export function assertRelease(release) {
  assert.ok(release, 'Verified release was not found');
  assert.equal(release.id, releaseId, 'Wrong release');
  assert.equal(release.tag_name, tag);
  assert.equal(release.target_commitish, source, 'Wrong source revision');
  assert.equal(release.prerelease, false);
  assert.equal(typeof release.draft, 'boolean');
  assertAssets(release, expected);
}
export function assertBuildJob(job) {
  assert.equal(job.run_id, originalRun);
  assert.equal(job.head_sha, source);
  assert.equal(job.status, 'completed');
  const required = [
    'Verify version and source branch', 'Run npm run check',
    'Windows tests including production OCR worker',
    'Verify report fixture through service restart', 'Run npm run build',
    'Verify report layouts', 'Build Windows Setup and ZIP',
    'Verify isolated packaged report', 'Confirm exact new revision before publication',
  ];
  for (const name of required) {
    const matches = job.steps.filter(step => step.name === name);
    assert.equal(matches.length, 1, `Missing or ambiguous build step: ${name}`);
    assert.equal(matches[0].conclusion, 'success', `Unverified build step: ${name}`);
  }
  const failures = job.steps.filter(step => step.conclusion === 'failure');
  assert.deepEqual(failures.map(step => step.name), ['Publish verified release and check remote digests']);
}
const git = args => execFileSync('git', args, { encoding: 'utf8', timeout: 120_000 }).trim();

async function main() {
  assert.equal(process.env.GITHUB_REPOSITORY, repository);
  assert.equal(process.env.GITHUB_REF, 'refs/heads/new');
  assert.ok(process.env.GH_TOKEN, 'Missing scoped release token');
  const maintenanceRevision = git(['rev-parse', 'HEAD']);
  const checkSource = () => {
    assert.equal(api(`${apiRoot}/git/ref/heads/new`).object.sha, maintenanceRevision, 'new advanced; stop');
    git(['merge-base', '--is-ancestor', source, 'HEAD']);
    assertMaintenanceOnly(git(['diff', '--no-renames', '--name-only', source, 'HEAD']).split('\n').filter(Boolean));
    assert.equal(git(['status', '--porcelain']), '', 'Dirty working tree');
    const tags = api(`${apiRoot}/git/matching-refs/tags/${tag}`).filter(ref => ref.ref === `refs/tags/${tag}`);
    assert.ok(tags.length <= 1, 'Ambiguous tag');
    if (tags.length) {
      assert.equal(tags[0].object.type, 'commit', 'Unexpected annotated tag; inspect manually');
      assert.equal(tags[0].object.sha, source, 'Existing tag points at another source');
    }
  };
  checkSource();
  assertBuildJob(api(`${apiRoot}/actions/jobs/116764556313`));
  const verify = api(`${apiRoot}/actions/runs/38835808844`);
  assert.equal(verify.head_sha, source);
  assert.equal(verify.conclusion, 'success');
  let release = findRelease(tag);
  assertRelease(release);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'riftcast-093-finalize-'));
  try {
    // Stream gh's authenticated, redirect-aware binary response directly to disk.
    // The token remains in the environment and never enters process arguments.
    for (const item of expected) {
      const filename = path.join(folder, item.name);
      const fd = fs.openSync(filename, 'wx');
      try {
        execFileSync('gh', ['api', '-H', 'Accept: application/octet-stream', `${apiRoot}/releases/assets/${item.id}`], {
          stdio: ['ignore', fd, 'inherit'], timeout: 600_000,
        });
      } finally { fs.closeSync(fd); }
      assert.equal(fs.statSync(filename).size, item.bytes, `Downloaded size mismatch: ${item.name}`);
      const hash = createHash('sha256');
      for await (const bytes of fs.createReadStream(filename)) hash.update(bytes);
      assert.equal(hash.digest('hex'), item.sha256, `Downloaded hash mismatch: ${item.name}`);
      console.log(`Verified downloaded bytes: ${item.name}`);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'release-manifest.json'), 'utf8'));
    assert.equal(manifest.sourceRevision, source);
    assert.equal(manifest.version, '0.9.3');
    assert.equal(manifest.workingTreeDirty, false);
    assert.deepEqual(manifest.artifacts, expected.slice(0, 3).map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })));
    const smoke = JSON.parse(fs.readFileSync(path.join(folder, 'verification.json'), 'utf8'));
    assert.equal(smoke.status, 'passed');
    assert.equal(smoke.version, '0.9.3');
    assert.deepEqual(smoke.errors, []);
    assert.deepEqual(smoke.blocked, []);

    // Re-read identity, source and assets immediately before the only mutation.
    checkSource();
    assertRelease(findRelease(tag));
    release = api(`${apiRoot}/releases/${releaseId}`);
    assertRelease(release);
    const alreadyPublished = !release.draft;
    if (!alreadyPublished) {
      release = api(`${apiRoot}/releases/${releaseId}`, '--method', 'PATCH', '-F', 'draft=false', '-f', 'make_latest=true');
      assertRelease(release);
      assert.equal(release.draft, false);
    }
    // The by-tag endpoint is appropriate only after the draft is published.
    const published = api(`${apiRoot}/releases/tags/${tag}`);
    assertRelease(published);
    assert.equal(published.draft, false);
    assert.equal(api(`${apiRoot}/git/ref/tags/${tag}`).object.sha, source);
    assert.equal(api(`${apiRoot}/releases/latest`).id, releaseId);
    const receipt = {
      status: 'passed', version: '0.9.3', url: published.html_url,
      sourceRevision: source, maintenanceRevision, originalBuildRun: originalRun,
      releaseId, alreadyPublished, verifiedAt: new Date().toISOString(),
      downloadedAssetsVerified: expected, applicationRebuilt: false,
      fixture: smoke.fixture,
    };
    fs.mkdirSync('verification-output/release-0.9.3', { recursive: true });
    fs.writeFileSync('verification-output/release-0.9.3/publication.json', JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify(receipt, null, 2));
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
