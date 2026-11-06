// Attach a reviewed PDF to an existing release and verify the remote download.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [version, file] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || !file || process.argv.length !== 4) {
  throw new Error('Usage: node scripts/publish-user-manual.mjs <version> <reviewed.pdf>');
}
const repo = 'QShin21/lolob', tag = `v${version}`, name = `RiftCast-${version}-User-Manual.pdf`;
const run = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 300000 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const input = resolve(file), bytes = await readFile(input), digest = hash(bytes);
if (bytes.subarray(0, 5).toString() !== '%PDF-' || bytes.length < 1000) throw new Error('Input is not a valid PDF');
const readRelease = () => JSON.parse(run(['api', `repos/${repo}/releases/tags/${tag}`]));
let release = readRelease();
if (release.draft || release.prerelease || release.tag_name !== tag) throw new Error('Expected a published formal release');
let existing = release.assets.filter(asset => asset.name === name);
if (existing.length > 1) throw new Error('Duplicate asset name');
if (existing.length && (existing[0].size !== bytes.length || existing[0].digest !== `sha256:${digest}`)) {
  throw new Error('A different manual with the same name already exists; it was preserved');
}
const stage = await mkdtemp(join(tmpdir(), 'riftcast-manual-release-'));
const staged = join(stage, name);
await copyFile(input, staged);
if (!existing.length) run(['release', 'upload', tag, staged, '--repo', repo]);
release = readRelease();
existing = release.assets.filter(asset => asset.name === name);
if (existing.length !== 1 || existing[0].state !== 'uploaded' || existing[0].size !== bytes.length || existing[0].digest !== `sha256:${digest}`) throw new Error('Remote manual metadata mismatch');
const downloaded = await mkdtemp(join(tmpdir(), 'riftcast-manual-download-'));
run(['release', 'download', tag, '--repo', repo, '--pattern', name, '--dir', downloaded]);
const verified = join(downloaded, name);
if ((await stat(verified)).size !== bytes.length || hash(await readFile(verified)) !== digest) throw new Error('Downloaded manual hash mismatch');
console.log(JSON.stringify({ tag, name, bytes: bytes.length, sha256: digest, url: existing[0].browser_download_url, verified: true }));
