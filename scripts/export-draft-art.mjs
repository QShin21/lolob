import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tsImport} from 'tsx/esm/api';
import {Open} from 'unzipper';
import assert from 'node:assert/strict';
const {writeStyleZip}=await tsImport('../server/style-pack-zip.ts',import.meta.url);
const version=JSON.parse(await readFile('package.json','utf8')).version;
const manifest=JSON.parse(await readFile('shared/champion-art-manifest.json','utf8'));
const dir=path.resolve(process.argv[2]||`release/${version}`);await mkdir(dir,{recursive:true});
for(const [variant,label] of [['draftCompact','Compact'],['draftExpanded','Expanded']]){
 const entries=manifest.champions.map(c=>({id:c.id,name:c.name,...c.assets[variant]}));
 const files={'manifest.json':Buffer.from(JSON.stringify({version:manifest.version,variant,champions:entries},null,2)),
 'README.md':Buffer.from(`RiftCast ${version} / ${label} BP artwork\n\n173 champion portraits from Riot Games Data Dragon. Champion artwork belongs to Riot Games. Source URLs, exact dimensions and SHA-256 are recorded in manifest.json. Use these local WebP files in the corresponding compact or expanded draft card. These are shared hero assets, separate from theme packs.\n`)};
 for(const c of entries)files[c.id+'.webp']=await readFile(path.join('public',c.url));
 const bytes=writeStyleZip(files),zip=await Open.buffer(bytes);
 assert.equal(zip.files.filter(f=>f.path.endsWith('.webp')).length,entries.length);
 for(const entry of zip.files)assert.deepEqual(await entry.buffer(),files[entry.path]);
 const file=path.join(dir,`RiftCast-${version}-Draft-Art-${label}.zip`);await writeFile(file,bytes);console.log(file);
}
