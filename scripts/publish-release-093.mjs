import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const repository=process.env.GITHUB_REPOSITORY;
assert.equal(repository,'QShin21/lolob');assert.ok(process.env.GH_TOKEN,'Missing scoped release token');
const version='0.9.3',tag=`v${version}`,folder=path.resolve('release',version);
const manifest=JSON.parse(await readFile(path.join(folder,'release-manifest.json'),'utf8'));
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(manifest.version,version);assert.equal(manifest.sourceRevision,sha);assert.equal(manifest.workingTreeDirty,false);
assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'');
for(const name of [`RiftCast-${version}-Setup-x64.exe`,`RiftCast-${version}-Windows-x64.zip`])assert.ok(manifest.artifacts.some(file=>file.name===name),`Missing ${name}`);
for(const item of manifest.artifacts){const hash=createHash('sha256');for await(const bytes of fs.createReadStream(path.join(folder,item.name)))hash.update(bytes);assert.equal(hash.digest('hex'),item.sha256);assert.equal(fs.statSync(path.join(folder,item.name)).size,item.bytes);}
const smoke=JSON.parse(await readFile(`verification-output/release-${version}/packaged-report.json`,'utf8'));assert.equal(smoke.status,'passed');
const files=[...manifest.artifacts.map(item=>item.name),'release-manifest.json','SHA256SUMS.txt','使用说明.md'];
const gh=args=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','inherit'],maxBuffer:4*1024*1024});
// Publishing is refused when the immutable version already exists; no assets or tags are overwritten.
const response=await fetch(`https://api.github.com/repos/${repository}/releases/tags/${tag}`,{headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json'}});
assert.equal(response.status,404,'Version already exists or cannot be checked; inspect it before retrying');
gh(['release','create',tag,'--repo',repository,'--target',sha,'--draft','--title',`RiftCast ${version} · OCR 赛后报告`,'--notes-file',`docs/Windows-Release-${version}.md`,...files.map(name=>path.join(folder,name))]);
const release=JSON.parse(gh(['api',`repos/${repository}/releases/tags/${tag}`]));assert.equal(release.draft,true);assert.equal(release.assets.length,files.length);
for(const name of files){const asset=release.assets.find(item=>item.name===name);assert.ok(asset,`Missing remote ${name}`);assert.equal(asset.size,fs.statSync(path.join(folder,name)).size);if(asset.digest){const hash=createHash('sha256');for await(const bytes of fs.createReadStream(path.join(folder,name)))hash.update(bytes);assert.equal(asset.digest,`sha256:${hash.digest('hex')}`);}}
gh(['release','edit',tag,'--repo',repository,'--draft=false','--latest']);
const published=JSON.parse(gh(['api',`repos/${repository}/releases/tags/${tag}`]));assert.equal(published.draft,false);assert.equal(published.prerelease,false);console.log(JSON.stringify({url:published.html_url,sourceRevision:sha,assets:published.assets.map(a=>({name:a.name,size:a.size,digest:a.digest}))},null,2));
