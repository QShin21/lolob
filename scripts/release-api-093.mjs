import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export const repository = 'QShin21/lolob';
export const apiRoot = `repos/${repository}`;
export const gh = args => execFileSync('gh', args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  maxBuffer: 8 * 1024 * 1024, timeout: 120_000,
});
export const api = (endpoint, ...args) => JSON.parse(gh(['api', endpoint, ...args]));

// The by-tag endpoint returns published releases only. Include authenticated
// drafts, paginate, and reject ambiguity instead of creating duplicate drafts.
export function releaseForTag(pages, tag) {
  assert.ok(Array.isArray(pages) && pages.every(Array.isArray), 'Invalid release pages');
  const matches = pages.flat().filter(release => release.tag_name === tag);
  assert.ok(matches.length <= 1, `Multiple releases for ${tag}; inspect without mutating`);
  return matches[0];
}
export const findRelease = tag => releaseForTag(
  api(`${apiRoot}/releases?per_page=100`, '--paginate', '--slurp'), tag,
);

export function assertAssets(release, expected) {
  assert.ok(Array.isArray(release.assets), 'Missing release assets');
  assert.equal(new Set(expected.map(item => item.name)).size, expected.length, 'Duplicate expected names');
  assert.equal(new Set(release.assets.map(item => item.name)).size, release.assets.length, 'Duplicate remote names');
  assert.equal(release.assets.length, expected.length, 'Unexpected asset count');
  for (const item of expected) {
    assert.match(item.name, /^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Unsafe asset filename');
    assert.match(item.sha256, /^[a-f0-9]{64}$/, 'Invalid expected digest');
    const asset = release.assets.find(value => value.name === item.name);
    assert.ok(asset, `Missing remote ${item.name}`);
    assert.equal(asset.state, 'uploaded', `Incomplete ${item.name}`);
    assert.equal(asset.size, item.bytes, `Size mismatch: ${item.name}`);
    assert.equal(asset.digest, `sha256:${item.sha256}`, `Digest mismatch: ${item.name}`);
    if (item.id !== undefined) assert.equal(asset.id, item.id, `Replaced asset: ${item.name}`);
  }
}
