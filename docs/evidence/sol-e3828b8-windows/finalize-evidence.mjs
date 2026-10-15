import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { evidence, source, manifest } from './harness.mjs';
const before = JSON.parse(await readFile(path.join(evidence, 'source-before.json'), 'utf8'));
const final = await manifest('source-final'); assert.deepEqual(final.files, before.files);
const files = {};
async function walk(dir) { for (const item of await readdir(dir, { withFileTypes: true })) { const file = path.join(dir, item.name); if (item.isDirectory()) await walk(file); else if (item.isFile() && item.name !== 'evidence-manifest.json') files[path.relative(evidence, file).split(path.sep).join('/')] = createHash('sha256').update(await readFile(file)).digest('hex'); } }
await walk(evidence);
await writeFile(path.join(evidence, 'evidence-manifest.json'), JSON.stringify({ testedSource: source, generatedAt: new Date().toISOString(), sourceFiles: Object.keys(final.files).length, sourceMatch: true, files }, null, 2));
console.log(JSON.stringify({ source, sourceFiles: Object.keys(final.files).length, evidenceFiles: Object.keys(files).length, pngFiles: Object.keys(files).filter(f => f.endsWith('.png')).length, sourceUnchanged: true }));
