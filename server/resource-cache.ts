import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, lstat, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ValidationError } from './state';
import type { ResourceProgress, ResourceCleanup } from '../shared/resource-maintenance';

const origin = 'https://ddragon.leagueoflegends.com';
export function resourceUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 2048) throw new ValidationError('资源地址无效');
  const url = new URL(value);
  if (url.origin !== origin || url.username || url.password || url.search || url.hash || !/^\/cdn\/(?:\d+\.\d+\.\d+\/(?:data\/(?:zh_CN|en_US)\/[A-Za-z0-9_./-]+\.json|img\/(?:item|spell)\/[A-Za-z0-9_-]+\.png)|img\/perk-images\/[A-Za-z0-9_/-]+\.png|img\/champion\/splash\/[A-Za-z0-9]{2,40}_\d{1,6}\.jpg)$/.test(url.pathname)) throw new ValidationError('仅支持已指定版本的 Riot 静态资料与图标');
  return url;
}
export class ResourceCache {
  private pending = new Map<string, Promise<Buffer>>();
  private touches = new Map<string, number>();
  private preparing = false;
  private cleaning = false;
  private progress: ResourceProgress = { phase: 'idle', completed: 0, total: 0, failed: 0, detail: '等待准备离线素材' };
  constructor(private dir: string, private options: { fetch?: typeof fetch; now?: () => number } = {}) {}
  private now() { return this.options.now?.() ?? Date.now(); }
  status() { return { ...this.progress }; }
  private advance(patch: Partial<ResourceProgress>) { Object.assign(this.progress, patch, { updatedAt: new Date(this.now()).toISOString() }); }
  private async touch(key: string, url: URL) {
    if (this.touches.has(key) && this.now() - this.touches.get(key)! < 60000) return;
    this.touches.set(key, this.now());
    const file=path.join(this.dir,`${key}.meta.json`),version=/^\/cdn\/(\d+\.\d+\.\d+)\//.exec(url.pathname)?.[1];
    try { await writeFile(file,JSON.stringify({url:url.href,version,lastUsedAt:new Date(this.now()).toISOString()})); } catch { this.touches.delete(key); }
  }
  async read(value: unknown, offline = false): Promise<{ bytes: Buffer; type: string }> {
    const url = resourceUrl(value), key = createHash('sha256').update(url.href).digest('hex'), file = path.join(this.dir, key);
    let bytes: Buffer;
    try { bytes = await readFile(file); }
    catch {
      if (offline) throw new Error('该素材尚未缓存，请在赛前准备离线素材');
      let request = this.pending.get(key);
      if (!request) {
        request = (async () => { const response = await (this.options.fetch ?? fetch)(url, { signal: AbortSignal.timeout(20000), redirect: 'error' }); if (!response.ok) throw new Error('Riot 静态素材暂不可用'); const data = Buffer.from(await response.arrayBuffer()); if (!data.length || data.length > 8*1024*1024) throw new Error('静态素材大小无效'); if (url.pathname.endsWith('.json')) JSON.parse(data.toString('utf8')); else if (url.pathname.endsWith('.jpg')) { const image = await sharp(data, { limitInputPixels: 32*1024*1024 }).metadata(); if (image.format !== 'jpeg' || !image.width || !image.height) throw new Error('皮肤原画格式无效'); } else if (!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('图标格式无效'); await mkdir(this.dir,{recursive:true});await writeFile(`${file}.tmp`,data);await rename(`${file}.tmp`,file);return data; })();
        this.pending.set(key, request); void request.finally(() => this.pending.delete(key)).catch(()=>{});
      }
      bytes = await request;
    }
    await this.touch(key,url);return { bytes, type: url.pathname.endsWith('.json') ? 'application/json' : url.pathname.endsWith('.jpg') ? 'image/jpeg' : 'image/png' };
  }
  async prepare(version: string) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new ValidationError('资源版本需为 Data Dragon 的 x.y.z 格式');
    if(this.preparing||this.cleaning)throw new ValidationError('正在维护素材，请等待当前任务完成');
    this.preparing=true;this.advance({phase:'catalog',version,completed:0,total:4,failed:0,detail:'正在读取装备、技能、英雄和符文目录'});
    try {
    const urls = new Set<string>();
    const json = async (pathname: string) => { const url = `${origin}${pathname}`; urls.add(url); const data=JSON.parse((await this.read(url)).bytes.toString('utf8'));if(this.progress.phase==='catalog')this.advance({completed:this.progress.completed+1});return data; };
    const items = await json(`/cdn/${version}/data/zh_CN/item.json`), spells = await json(`/cdn/${version}/data/zh_CN/summoner.json`), champions = await json(`/cdn/${version}/data/en_US/champion.json`), runes = await json(`/cdn/${version}/data/en_US/runesReforged.json`);
    for (const item of Object.values(items.data) as any[]) urls.add(`${origin}/cdn/${version}/img/item/${item.image.full}`);
    for (const spell of Object.values(spells.data) as any[]) urls.add(`${origin}/cdn/${version}/img/spell/${spell.image.full}`);
    for (const rune of runes) { urls.add(`${origin}/cdn/img/${rune.icon}`); for (const slot of rune.slots) for (const option of slot.runes) urls.add(`${origin}/cdn/img/${option.icon}`); }
    const ids = Object.keys(champions.data), failedMetadata=new Set<string>(); let next = 0;
    this.advance({phase:'champions',completed:0,total:ids.length,detail:'正在读取逐英雄技能目录'});
    await Promise.all(Array.from({length:4},async()=>{while(next<ids.length){const id=ids[next++];try{const data=await json(`/cdn/${version}/data/en_US/champion/${id}.json`);for(const spell of data.data[id].spells)urls.add(`${origin}/cdn/${version}/img/spell/${spell.image.full}`);}catch{failedMetadata.add(`${origin}/cdn/${version}/data/en_US/champion/${id}.json`);}finally{this.advance({completed:this.progress.completed+1,failed:failedMetadata.size});}}}));
    const all = [...urls]; next = 0; const failures=new Set<string>(failedMetadata);
    this.advance({phase:'assets',completed:0,total:all.length,failed:0,detail:'正在缓存静态素材，已缓存文件直接复用'});
    await Promise.all(Array.from({length:4},async()=>{while(next<all.length){const url=all[next++];try{await this.read(url);if(!failedMetadata.has(url))failures.delete(url);}catch{failures.add(url);}finally{this.advance({completed:this.progress.completed+1,failed:failures.size});}}}));
    const failed=[...failures];
    const manifest = { version, preparedAt: new Date(this.now()).toISOString(), total: all.length, cached: all.length-failed.length, failed };
    await mkdir(this.dir,{recursive:true});await writeFile(path.join(this.dir,`${version}-manifest.json`),JSON.stringify(manifest,null,2));
    const detail=failed.length ? `已缓存 ${manifest.cached}/${manifest.total} 个静态素材，${failed.length} 个待补齐` : `版本 ${version} 的 ${all.length} 个静态素材已缓存，离线可用`;
    this.advance({phase:'complete',failed:failed.length,detail});return { ...manifest, detail };
    }catch(error){this.advance({phase:'error',detail:error instanceof Error?error.message:'资源准备失败'});throw error;}finally{this.preparing=false;}
  }
  /** Remove only indexed cache files, leaving uploads, bundled assets and legacy unindexed files intact. */
  async cleanup(protectedVersions: string[], remove = false): Promise<ResourceCleanup> {
    if(this.preparing||this.cleaning)throw new ValidationError('正在维护素材，请等待当前任务完成');
    this.cleaning=true;const threshold=this.now()-14*86400000,result:ResourceCleanup={files:0,bytes:0,protectedVersions:[...new Set(protectedVersions)],threshold:new Date(threshold).toISOString(),removed:remove};
    try {
      const names=await readdir(this.dir).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return [];throw e;});
      for(const name of names){
        if(!/^[a-f0-9]{64}\.meta\.json$/.test(name))continue;
        const key=name.slice(0,64),file=path.resolve(this.dir,key),meta=path.resolve(this.dir,name),base=path.resolve(this.dir)+path.sep;
        if(!file.startsWith(base)||!meta.startsWith(base)||this.pending.has(key))continue;
        try{
          const [info,metaInfo]=await Promise.all([lstat(file),lstat(meta)]);if(!info.isFile()||!metaInfo.isFile()||info.isSymbolicLink()||metaInfo.isSymbolicLink())continue;
          const data=JSON.parse(await readFile(meta,'utf8')),url=resourceUrl(data.url),version=/^\/cdn\/(\d+\.\d+\.\d+)\//.exec(url.pathname)?.[1];
          if(createHash('sha256').update(url.href).digest('hex')!==key||!version||protectedVersions.includes(version)||!Number.isFinite(Date.parse(data.lastUsedAt))||Date.parse(data.lastUsedAt)>=threshold||(this.touches.get(key)??0)>=threshold)continue;
          if(remove){await unlink(file);this.touches.delete(key);await unlink(meta).catch(()=>{});}
          result.files++;result.bytes+=info.size;
        }catch{/* Unrecognised files remain untouched. */}
      }
      return result;
    }finally{this.cleaning=false;}
  }
}
