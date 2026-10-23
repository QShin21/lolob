import type { Express, Request } from 'express';
import { ResourceCache } from './resource-cache';
import { bundledChampionVersion } from '../shared/champion-art';
import { resourceRealms, resourceVersionMatch, type ResourceVersions } from '../shared/resource-maintenance';

export async function availableResourceVersions(gameVersion: string, realm?: string, fetcher: typeof fetch = fetch): Promise<ResourceVersions> {
  if(realm&&!resourceRealms.includes(realm as typeof resourceRealms[number]))throw new Error('选择有效的官方区服目录；国服使用实际游戏版本匹配');
  const get=async(url:string)=>{const r=await fetcher(url,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw new Error('官方版本目录暂不可用');return r.json();};
  const raw=await get('https://ddragon.leagueoflegends.com/api/versions.json');
  if(!Array.isArray(raw))throw new Error('官方版本目录格式无效');const versions=raw.filter(v=>typeof v==='string'&&/^\d+\.\d+\.\d+$/.test(v)).slice(0,500);
  let realmVersion:string|undefined;
  if(realm){const r=await get(`https://ddragon.leagueoflegends.com/realms/${realm}.json`);if(typeof r.v==='string'&&versions.includes(r.v))realmVersion=r.v;}
  const matched=resourceVersionMatch(gameVersion,versions),recommended=matched??(!gameVersion.trim()?realmVersion:undefined);
  return {versions,gameVersion,...(realm?{realm}:{}),realmVersion,recommended,detail:matched?`实际游戏版本 ${gameVersion} 对应目录 ${matched}`:recommended?`所选区服目录当前版本 ${recommended}`:gameVersion?`目录中未匹配游戏版本 ${gameVersion}，请保留当前选择并核对`:'尚未获得游戏版本；可选择区服或手动指定已确认版本'};
}
export function mountResourceMaintenanceRoutes(app:Express,options:{cache:ResourceCache;authorize:(req:Request)=>void;beforeMutation:()=>Promise<void>;getGameVersion:()=>string;getProtectedVersions:()=>string[]}){
  let running:Promise<unknown>|undefined;
  app.get('/api/resources/maintenance',(_req,res)=>res.json({progress:options.cache.status(),protectedVersions:[bundledChampionVersion,...options.getProtectedVersions()]}));
  app.get('/api/resources/versions',async(req,res)=>{try{res.json(await availableResourceVersions(options.getGameVersion(),typeof req.query.realm==='string'&&req.query.realm?req.query.realm:undefined));}catch(e){res.status(400).json({error:(e as Error).message});}});
  app.post('/api/resources/maintenance',async(req,res,next)=>{
    try{options.authorize(req);await options.beforeMutation();options.authorize(req);const {op,version}=req.body??{};
      if(running)throw new Error('素材准备正在进行');
      if(op==='prepare'){
        if(typeof version!=='string'||!/^\d+\.\d+\.\d+$/.test(version))throw new Error('选择完整的 Data Dragon 版本');
        // The stop-broadcast guard is checked again after downloading before automatic retention cleanup.
        running=options.cache.prepare(version).then(async result=>{await options.beforeMutation();options.authorize(req);await options.cache.cleanup([bundledChampionVersion,version,...options.getProtectedVersions()],true);return result;}).catch(()=>{}).finally(()=>{running=undefined;});
        res.status(202).json({progress:options.cache.status()});
      }else if(op==='cleanup-preview'||op==='cleanup')res.json(await options.cache.cleanup([bundledChampionVersion,...options.getProtectedVersions()],op==='cleanup'));
      else throw new Error('未知素材维护操作');
    }catch(e){next(e);}
  });
}
