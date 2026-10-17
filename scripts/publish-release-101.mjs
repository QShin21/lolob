import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { api, apiRoot, findRelease, assertAssets } from './release-api-093.mjs';
const repository=process.env.GITHUB_REPOSITORY;
assert.equal(repository,'QShin21/lolob');assert.ok(process.env.GH_TOKEN,'Missing scoped release token');
const version='1.0.1',tag=`v${version}`,folder=path.resolve('release',version);
const manifest=JSON.parse(await readFile(path.join(folder,'release-manifest.json'),'utf8'));
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(manifest.version,version);assert.equal(manifest.sourceRevision,sha);assert.equal(manifest.workingTreeDirty,false);
assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'');
for(const name of [`RiftCast-${version}-Setup-x64.exe`,`RiftCast-${version}-Windows-x64.zip`,...['glacier-aurora','regalia','neon-pulse','vermilion-ink','porcelain-racing'].map(id=>`RiftCast-${version}-${id}.riftstyle.zip`)])assert.ok(manifest.artifacts.some(file=>file.name===name),`Missing ${name}`);
for(const item of manifest.artifacts){const hash=createHash('sha256');for await(const bytes of fs.createReadStream(path.join(folder,item.name)))hash.update(bytes);assert.equal(hash.digest('hex'),item.sha256);assert.equal(fs.statSync(path.join(folder,item.name)).size,item.bytes);}
const smoke=JSON.parse(await readFile(`verification-output/release-${version}/packaged-report.json`,'utf8'));assert.equal(smoke.status,'passed');
const styles=JSON.parse(await readFile(`verification-output/release-${version}/styles/report.json`,'utf8'));assert.equal(styles.status,'passed');
const builtins=JSON.parse(await readFile(`verification-output/release-${version}/builtins/report.json`,'utf8'));assert.equal(builtins.status,'passed');
const guide=`RiftCast-${version}-Usage.md`;
await copyFile(path.join(folder,'使用说明.md'),path.join(folder,guide));
await fs.promises.writeFile(path.join(folder,'verification.json'),JSON.stringify({status:'passed',version,sourceRevision:sha,packaged:smoke,styles,builtins},null,2));
await copyFile('docs/Style-Packs.md',path.join(folder,'Style-Packs.md'));
await copyFile('docs/style-pack-v1.schema.json',path.join(folder,'style-pack-v1.schema.json'));
const files=[...manifest.artifacts.map(item=>item.name),'release-manifest.json','SHA256SUMS.txt',guide,'verification.json','Style-Packs.md','style-pack-v1.schema.json'];
const gh=args=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','inherit'],maxBuffer:4*1024*1024});
// Include drafts in preflight. Published releases and existing drafts are never overwritten.
assert.equal(findRelease(tag),undefined,'Version or draft already exists; inspect it before retrying');
const expected=[];
for(const name of files){const hash=createHash('sha256');for await(const bytes of fs.createReadStream(path.join(folder,name)))hash.update(bytes);expected.push({name,bytes:fs.statSync(path.join(folder,name)).size,sha256:hash.digest('hex')});}
gh(['release','create',tag,'--repo',repository,'--target',sha,'--draft','--title',`RiftCast ${version} · 细化风格包文字与颜色配置`,'--notes-file',`docs/Windows-Release-${version}.md`,...files.map(name=>path.join(folder,name))]);
const created=findRelease(tag);assert.ok(created,'New draft was not found');
const release=api(`${apiRoot}/releases/${created.id}`);
assert.equal(release.draft,true);assert.equal(release.tag_name,tag);assert.equal(release.target_commitish,sha);assertAssets(release,expected);
api(`${apiRoot}/releases/${release.id}`,'--method','PATCH','-F','draft=false','-f','make_latest=true');
const published=api(`${apiRoot}/releases/tags/${tag}`);
assert.equal(published.id,release.id);assert.equal(published.target_commitish,sha);assert.equal(published.draft,false);assert.equal(published.prerelease,false);assertAssets(published,expected);
console.log(JSON.stringify({url:published.html_url,sourceRevision:sha,assets:published.assets.map(a=>({name:a.name,size:a.size,digest:a.digest}))},null,2));
