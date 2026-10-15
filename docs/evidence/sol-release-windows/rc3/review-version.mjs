// Sol static RC3 version/dependency/delta review; no build or device calls.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root='E:\\codexdata\\lol导播软件', version='0.8.0-rc.3', base='daddc81fc5252f639aced2947cbb9a72fdf82941', out='E:\\codexdata\\lolob-release-20261014\\verification-output\\release-0.8.0-rc.3';
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim(), read=file=>readFile(path.join(root,file),'utf8');
const pkg=JSON.parse(await read('package.json')),oldPkg=JSON.parse(git(['show',base+':package.json'])),lock=JSON.parse(await read('package-lock.json')),oldLock=JSON.parse(git(['show',base+':package-lock.json']));
assert.equal(pkg.version,version);assert.equal(lock.version,version);assert.equal(lock.packages[''].version,version);delete pkg.version;delete oldPkg.version;delete lock.version;delete oldLock.version;delete lock.packages[''].version;delete oldLock.packages[''].version;assert.deepEqual(pkg,oldPkg);assert.deepEqual(lock,oldLock);
assert.equal(git(['diff',base,'--name-only','--','src','server','shared','electron','vite.config.ts','tsconfig.json','electron-builder.cjs']),'');
const scripts=[...new Set([...git(['diff',base,'--name-only','--','scripts']).split('\n'),...git(['ls-files','--others','--exclude-standard','--','scripts']).split('\n')].filter(Boolean))];assert.deepEqual(scripts.sort(),['scripts/verify-release.mjs']);
const docs=['README.md','docs/Windows-Release-0.8.0-rc.3.md','docs/前端重构Windows收尾-20261014.md','docs/前端重构进度.md'],hashes={};let links=0;
for(const file of docs){const text=await read(file);assert.ok(text.includes(version),file);for(const m of text.matchAll(/\]\(([^)]+)\)/g)){const target=m[1].replace(/^<|>$/g,'').split('#')[0];if(!target||/^[a-z]+:/i.test(target))continue;await readFile(path.resolve(path.dirname(path.join(root,file)),target));links++;}}
for(const f of['package.json','package-lock.json','scripts/verify-release.mjs','scripts/verify-custom-scenes.mjs','scripts/verify-native-safety.mjs',...docs])hashes[f]=createHash('sha256').update(await read(f)).digest('hex');
const ts=await import(pathToFileURL(path.join(root,'node_modules/typescript/lib/typescript.js')).href);
function assertionCalls(text){const source=ts.default.createSourceFile('runner.mjs',text,ts.default.ScriptTarget.Latest,true,ts.default.ScriptKind.JS),calls=[];const visit=node=>{if(ts.default.isCallExpression(node)&&ts.default.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(source)==='assert')calls.push(node.getText(source).replace(/\s+/g,' '));ts.default.forEachChild(node,visit);};visit(source);return calls;}
const oldCalls=assertionCalls(git(['show',base+':scripts/verify-release.mjs'])),newCalls=assertionCalls(await read('scripts/verify-release.mjs'));for(const call of oldCalls){const index=newCalls.indexOf(call);assert.ok(index>=0,'Original business assertion retained: '+call);newCalls.splice(index,1);}assert.equal(oldCalls.length,47);assert.equal(newCalls.length,1);assert.ok(newCalls[0].includes('musicUpload.status()'));
const result={status:'passed',at:new Date().toISOString(),head:git(['rev-parse','HEAD']),base,version,dependencyGraphIdentical:true,originalBusinessAssertionsPreserved:47,newAssertions:newCalls,dependencies:Object.keys(lock.packages).length-1,productImplementationDelta:[],qaScriptsDelta:scripts,docsLinks:links,hashes,limits:'Native guard review and final committed build source are separately recorded. Review includes staged and untracked QA paths.'};await writeFile(path.join(out,'version-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
