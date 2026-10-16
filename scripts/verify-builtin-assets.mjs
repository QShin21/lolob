import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { tsImport } from 'tsx/esm/api';
const { BUILTIN_STYLE_RECORDS, BUILTIN_STYLE_REF, STYLE_SCENES } = await tsImport('../shared/style-packs.ts', import.meta.url);
const { validateStyleManifest } = await tsImport('../server/style-packs.ts', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(BUILTIN_STYLE_RECORDS.length, 5); assert.equal(BUILTIN_STYLE_REF.id, 'glacier-aurora');
const checks=[];
for (const record of BUILTIN_STYLE_RECORDS) {
  const manifest = validateStyleManifest(record.manifest), hashes = {};
  assert.deepEqual(manifest, record.manifest); assert.deepEqual(Object.keys(manifest.scenes), [...STYLE_SCENES]);
  let pixels = 0, bytes = 0;
  const dir = path.join('public/style-packs', manifest.id, record.revision);
  for (const file of Object.values(manifest.assets)) {
    const input = await readFile(path.join(dir, file)); hashes[file] = hash(input); assert.equal(hashes[file], record.hashes[file]);
    const meta = await sharp(input,{failOn:'warning'}).metadata(); assert.equal(meta.format,'png'); assert.equal(meta.pages??1,1);
    assert.ok(meta.width <= 4096 && meta.height <= 4096); assert.ok(input.length <= 8*1024*1024);
    pixels += meta.width * meta.height; bytes += input.length;
  }
  assert.equal(hash(JSON.stringify({manifest,hashes})), record.revision);
  assert.equal(Object.keys(hashes).length,23); assert.ok(pixels <= 64*1024*1024); assert.ok(bytes <= 40*1024*1024);
  assert.deepEqual((await readdir(path.join(dir,'assets'))).sort(),Object.values(manifest.assets).map(p=>path.basename(p)).sort());
  checks.push({id:manifest.id,name:manifest.name,revision:record.revision,assets:Object.keys(hashes).length,bytes,pixels,originalArchiveSha256:record.archiveSha256});
}
assert.deepEqual((await readdir('public/style-packs')).sort(),checks.map(p=>p.id).sort());
await mkdir('verification-output/release-1.0.0',{recursive:true});
await writeFile('verification-output/release-1.0.0/builtin-assets.json',JSON.stringify({status:'passed',default:BUILTIN_STYLE_REF,packs:checks},null,2));
console.log('Verified five original packs, 115 PNGs, immutable revisions and default Glacier Aurora.');
