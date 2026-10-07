import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import catalog from '../shared/champion-art-catalog.json';
import type { BroadcastState } from '../shared/types';

export async function resourceInventory(root: string, dataDir: string, state: BroadcastState) {
  const refs=new Set<string>(state.assets.map(a=>a.url));
  for(const team of state.teams){if(team.logo)refs.add(team.logo);for(const member of team.players)if(member.portrait)refs.add(member.portrait);}
  for(const overlay of [state.overlay,state.production?.program?.overlay])if(overlay){if(overlay.sponsorLogo)refs.add(overlay.sponsorLogo);for(const pair of overlay.playerFeedPairs??[])for(const feed of Object.values(pair))if(feed.imageUrl)refs.add(feed.imageUrl);}
  const files=catalog.champions.flatMap(c=>Object.values(c.assets).map(a=>a.url));
  const missing:string[]=[], remote=[...refs].filter(ref=>ref.startsWith('https://'));
  await Promise.all([...new Set([...files,...[...refs].filter(ref=>ref.startsWith('/uploads/'))])].map(async ref=>{
    const folder=ref.startsWith('/uploads/')?path.join(dataDir,'uploads'):path.join(root,'public'), relative=ref.startsWith('/uploads/')?ref.slice('/uploads/'.length):ref.slice(1), file=path.resolve(folder,relative);
    if(!file.startsWith(path.resolve(folder)+path.sep)){missing.push(ref);return;}
    try{await access(file);}catch{missing.push(ref);}
  }));
  const version=state.production?.versions.resources??catalog.version;
  let cache:{version:string;cached:number;total:number;failed:string[];preparedAt?:string}|null=null;
  if(/^\d+\.\d+\.\d+$/.test(version))try{cache=JSON.parse(await readFile(path.join(dataDir,'resources',`${version}-manifest.json`),'utf8'));}catch{}
  return {version,bundledVersion:catalog.version,champions:catalog.champions.length,bundledFiles:files.length,missing:missing.sort(),remote:remote.sort(),cache,
    fonts:'Microsoft YaHei / Arial 使用本机字体；正式播出前检查目标机器字体与中文换行',
    detail:`英雄 ${catalog.champions.length} 位 · 缺失 ${missing.length} 项 · 远程图片 ${remote.length} 项 · 静态缓存 ${cache?`${cache.cached}/${cache.total}`:'尚未准备'}`};
}
