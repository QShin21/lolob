import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { api, apiRoot, assertAssets, findRelease, gh, repository } from './release-api-093.mjs';

const version = '2.0.0', tag = `v${version}`;
const title = '观澜 2.0.0 · 演播室暗场视觉全面升级';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, 'verification-output');
const releaseEvidence = path.join(evidence, `release-${version}`);
const dist = path.join(root, 'release', version);
const prefix = `GuanLan-${version}`;
const setupName = `RiftCast-${version}-Setup-x64.exe`;
const portableName = `${prefix}-Windows-x64.zip`;
const manualName = `${prefix}-User-Manual.pdf`;
const manualSource = `docs/user-manual-${version}/观澜-${version}-用户使用手册.pdf`;
const artifactNames = [
  setupName, `${setupName}.blockmap`, portableName, manualName,
  ...['glacier-aurora', 'regalia', 'neon-pulse', 'vermilion-ink', 'porcelain-racing', 'qinghua-celestial', 'rift-signature']
    .map(id => `${prefix}-${id}.riftstyle.zip`),
  ...['Compact', 'Expanded', 'LockReveal'].map(label => `${prefix}-Draft-Art-${label}.zip`),
];
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const downloadUrl = name => `https://github.com/${repository}/releases/download/${tag}/${name}`;

async function describeAsset(file) {
  const info = await stat(file);
  assert.ok(info.isFile() && info.size > 0, `Empty or missing file: ${file}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { name: path.basename(file), bytes: info.size, sha256: hash.digest('hex') };
}

function requirePassed(report, file) {
  assert.equal(report.status, 'passed', file);
  if (report.version !== undefined) assert.equal(report.version, version, file);
  if (report.errors !== undefined) assert.deepEqual(report.errors, [], file);
  if (report.blocked !== undefined) assert.deepEqual(report.blocked, [], file);
}

async function verifySourceEvidence(sha) {
  const versionedReports = [
    ...['contracts', 'feature-parity', 'cinematics', 'gold-ranking', 'rotation', 'postgame', 'runes', 'replay-director',
      'layout', 'styles', 'deletion', 'builtins', 'draft-layout', 'telemetry-hud', 'draft-focus', 'combat', 'live-only', 'tournaments']
      .map(name => path.join(releaseEvidence, name, 'report.json')),
    path.join(releaseEvidence, 'global-shortcuts/ui-report.json'),
  ];
  const otherReports = [
    'broadcast-analysis', 'style-editor', 'leaguebroadcast-parity-ui', 'postgame-composition', 'program-layouts',
    'archive-graphics', 'combat-review', 'transitions', 'dynamic-text', 'player-identity', 'vdo-demo-resources',
    'app-operations', 'skin-display', 'draft-statistics', 'collaboration-170',
  ].map(name => path.join(evidence, name, 'report.json'));
  const operatorReport = path.join(evidence, `operator-ui-${version}`, 'report.json');
  const files = [...versionedReports, ...otherReports, operatorReport];
  const reports = new Map(await Promise.all(files.map(async file => [file, await json(file)])));
  for (const [file, report] of reports) requirePassed(report, file);
  assert.equal(reports.get(path.join(releaseEvidence, 'builtins', 'report.json')).renders, 91);
  const operator = reports.get(operatorReport);
  assert.equal(operator.version, version);
  assert.deepEqual(operator.errors, []);
  assert.ok(operator.checks.length >= 14 && operator.checks.every(check => check.status === 'passed'));
  assert.ok(operator.screenshots.length >= 100);

  const [theme, production, safety, controls] = await Promise.all([
    json(path.join(evidence, `ui-theme-${version}`, 'report.json')),
    json(path.join(evidence, `production-${version}`, 'report.json')),
    json(path.join(evidence, `frontend-safety-${sha.slice(0, 7)}`, 'result.json')),
    json(path.join(evidence, 'broadcast-controls', 'verification.json')),
  ]);
  for (const report of [theme, production, safety, controls]) assert.deepEqual(report.errors, []);
  for (const report of [theme, production, safety]) assert.equal(report.version, version);
  assert.ok(theme.tests.length >= 8 && theme.comparisons.length >= 11);
  assert.ok(production.tests.length >= 17);
  assert.equal(safety.source, sha);
  assert.ok(safety.results.length >= 16 && safety.results.every(item => item.passed));
  assert.equal(controls.heroCoverage, 173);
  return files.length + 4;
}

// Check the complete set of upload files without any GitHub credentials.
export async function verifyReleaseAssets(folder, sha, manual) {
  const manifestName = 'release-manifest.json', sumsName = 'SHA256SUMS.txt';
  const manifest = await json(path.join(folder, manifestName));
  assert.equal(manifest.product, 'GuanLan');
  assert.equal(manifest.version, version);
  assert.equal(manifest.platform, 'Windows x64');
  assert.equal(manifest.sourceRevision, sha);
  assert.equal(manifest.workingTreeDirty, false);
  assert.deepEqual(manifest.artifacts.map(artifact => artifact.name).sort(), [...artifactNames].sort());
  assert.equal(manifest.sourceFiles[manualSource], manual.sha256);

  const artifacts = await Promise.all(manifest.artifacts.map(artifact => describeAsset(path.join(folder, artifact.name))));
  assert.deepEqual(artifacts, manifest.artifacts);
  const stagedManual = artifacts.find(artifact => artifact.name === manualName);
  assert.deepEqual(stagedManual, { ...manual, name: manualName }, 'Packaged PDF differs from the committed manual');
  const expectedSums = artifacts.map(artifact => `${artifact.sha256}  ${artifact.name}\n`).join('');
  assert.equal(await readFile(path.join(folder, sumsName), 'utf8'), expectedSums);
  return [...artifacts, ...await Promise.all([manifestName, sumsName].map(name => describeAsset(path.join(folder, name))))];
}

function releaseBody(notes, sha) {
  const blobDocs = `https://github.com/${repository}/blob/${sha}/docs/`;
  const body = notes.trim().replace(/\]\(([^)]+)\)/g, (link, target) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) return link;
    return `](${new URL(target, blobDocs).href})`;
  });
  const downloads = [
    ['Windows x64 安装包', setupName], ['Windows x64 便携版', portableName], ['PDF 用户手册', manualName],
  ].map(([label, name]) => `[${label}](${downloadUrl(name)})`).join(' · ');
  return body.replace(/^(# [^\n]+)\r?\n+/, `$1\n\n${downloads}\n\n`) + '\n';
}

function remoteTagRevision() {
  const rows = git(['ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).split('\n')
    .filter(Boolean).map(row => row.trim().split(/\s+/));
  return (rows.find(([, ref]) => ref.endsWith('^{}')) ?? rows.find(([, ref]) => ref === `refs/tags/${tag}`))?.[0];
}

function assertBranchTip(sha) {
  const [revision] = git(['ls-remote', '--exit-code', 'origin', 'refs/heads/new']).split(/\s+/);
  assert.equal(revision, sha, 'origin/new advanced while the release was running');
}

async function main() {
  const flags = process.argv.slice(2);
  assert.ok(flags.length === 0 || flags.length === 1 && flags[0] === '--preflight', 'Usage: publish-release-200.mjs [--preflight]');
  const sha = git(['rev-parse', 'HEAD']);
  assert.equal((await json(path.join(root, 'package.json'))).version, version);
  assert.equal(git(['hash-object', manualSource]), git(['rev-parse', `HEAD:${manualSource}`]), 'The manual must match the committed PDF');
  const manualFile = path.join(root, manualSource);
  const manual = await describeAsset(manualFile);
  assert.equal((await readFile(manualFile)).subarray(0, 5).toString(), '%PDF-');
  const reportCount = await verifySourceEvidence(sha);
  const body = releaseBody(await readFile(path.join(root, 'docs', `Windows-Release-${version}.md`), 'utf8'), sha);
  const notesFile = path.join(releaseEvidence, 'release-notes.md');
  await writeFile(notesFile, body);
  if (flags.includes('--preflight')) {
    console.log(JSON.stringify({ sourceRevision: sha, verifiedSourceReports: reportCount, manual, notesFile }, null, 2));
    return;
  }

  assert.equal(process.env.GITHUB_REPOSITORY, repository);
  assert.equal(process.env.GITHUB_REF, 'refs/heads/new');
  assert.equal(process.env.GITHUB_SHA, sha);
  assert.ok(process.env.GH_TOKEN, 'Missing scoped release token');
  assert.equal(git(['status', '--porcelain']), '');
  const tests = await readFile(path.join(releaseEvidence, 'tests.txt'), 'utf8');
  assert.match(tests, /^# pass [1-9]\d*\r?$/m);
  assert.match(tests, /^# fail 0\r?$/m);
  const [build, smoke] = await Promise.all([
    json(path.join(releaseEvidence, 'build-report.json')), json(path.join(releaseEvidence, 'packaged-report.json')),
  ]);
  for (const report of [build, smoke]) {
    requirePassed(report, 'Packaged Windows evidence');
    assert.equal(report.version, version);
    assert.equal(report.sourceRevision, sha);
  }
  const expected = await verifyReleaseAssets(dist, sha, manual);
  assert.deepEqual(build.artifacts, expected.slice(0, -2));
  assert.ok(smoke.checks.length > 0);

  assertBranchTip(sha);
  assert.equal(findRelease(tag), undefined, 'A release or draft already exists for this tag');
  const priorTag = remoteTagRevision();
  if (priorTag) assert.equal(priorTag, sha, 'Existing version tag points to a different commit');
  gh(['release', 'create', tag, '--repo', repository, '--target', sha, '--draft', '--title', title, '--notes-file', notesFile]);
  const draft = findRelease(tag);
  assert.ok(draft?.draft && !draft.prerelease, 'Expected a new formal release draft');
  assert.equal(draft.target_commitish, sha);
  assert.deepEqual(draft.assets, []);
  // Setup and portable ZIP can be several hundred MiB each.
  execFileSync('gh', ['release', 'upload', tag, '--repo', repository, ...expected.map(asset => path.join(dist, asset.name))], {
    cwd: root, stdio: 'inherit', timeout: 20 * 60_000,
  });
  const uploaded = api(`${apiRoot}/releases/${draft.id}`);
  assert.equal(uploaded.draft, true);
  assert.equal(uploaded.tag_name, tag);
  assert.equal(uploaded.target_commitish, sha);
  assert.equal(uploaded.name, title);
  assert.equal(uploaded.body.trim(), body.trim());
  assertAssets(uploaded, expected);
  const verifiedAssets = expected.map(asset => ({ ...asset, id: uploaded.assets.find(item => item.name === asset.name).id }));

  assertBranchTip(sha);
  const draftTag = remoteTagRevision();
  if (draftTag) assert.equal(draftTag, sha, 'Version tag changed before publication');
  const published = api(`${apiRoot}/releases/${draft.id}`, '--method', 'PATCH', '-F', 'draft=false', '-f', 'make_latest=true');
  assert.equal(published.id, draft.id);
  assert.equal(published.tag_name, tag);
  assert.equal(published.target_commitish, sha);
  assert.equal(published.draft, false);
  assert.equal(published.prerelease, false);
  assertAssets(published, verifiedAssets);
  assert.equal(published.assets.find(asset => asset.name === setupName).browser_download_url, downloadUrl(setupName));
  assert.equal(remoteTagRevision(), sha, 'Published tag must identify the verified build');
  let latest = api(`${apiRoot}/releases/latest`);
  for (let attempt = 0; latest.id !== published.id && attempt < 5; attempt++) {
    await delay(2000);
    latest = api(`${apiRoot}/releases/latest`);
  }
  assert.equal(latest.id, published.id, 'Verified release did not become latest');

  const downloaded = await mkdtemp(path.join(tmpdir(), 'riftcast-200-download-'));
  try {
    gh(['release', 'download', tag, '--repo', repository, '--pattern', manualName, '--dir', downloaded]);
    assert.deepEqual(await describeAsset(path.join(downloaded, manualName)), { ...manual, name: manualName });
  } finally {
    await rm(downloaded, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ url: published.html_url, sourceRevision: sha, assets: verifiedAssets, manualDownloadVerified: true }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
