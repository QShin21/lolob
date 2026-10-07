import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tsImport } from 'tsx/esm/api';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=process.env.RIFTCAST_DATA_DIR?path.resolve(process.env.RIFTCAST_DATA_DIR):path.join(root,'data');
const version=process.argv[2]??JSON.parse(await readFile(path.join(root,'shared/champion-art-catalog.json'),'utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('用法：npm run prepare:offline -- 16.19.1');
for(const script of ['ensure-electron.cjs','ensure-obs.cjs']){
  const result=spawnSync(process.execPath,[path.join(root,'scripts',script)],{cwd:root,stdio:'inherit',windowsHide:true});
  if(result.status!==0)process.exit(result.status??1);
}
await mkdir(dataDir,{recursive:true});
const {ResourceCache}=await tsImport('../server/resource-cache.ts',import.meta.url);
const result=await new ResourceCache(path.join(dataDir,'resources')).prepare(version);
console.log(result.detail);
console.log('上传队标、照片和品牌图片后，在比赛日检查面板确认素材清单。离线启动：RIFTCAST_OFFLINE=1。');
if(result.failed.length)process.exitCode=1;
