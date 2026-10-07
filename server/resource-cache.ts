import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { ValidationError } from './state';

const origin = 'https://ddragon.leagueoflegends.com';
export function resourceUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 2048) throw new ValidationError('资源地址无效');
  const url = new URL(value);
  if (url.origin !== origin || url.search || url.hash || !/^\/cdn\/(?:\d+\.\d+\.\d+\/(?:data\/(?:zh_CN|en_US)\/[A-Za-z0-9_./-]+\.json|img\/(?:item|spell)\/[A-Za-z0-9_-]+\.png)|img\/perk-images\/[A-Za-z0-9_/-]+\.png)$/.test(url.pathname)) throw new ValidationError('仅支持已指定版本的 Riot 静态资料与图标');
  return url;
}
export class ResourceCache {
  private pending = new Map<string, Promise<Buffer>>();
  constructor(private dir: string) {}
  async read(value: unknown, offline = false): Promise<{ bytes: Buffer; type: string }> {
    const url = resourceUrl(value), key = createHash('sha256').update(url.href).digest('hex'), file = path.join(this.dir, key);
    let bytes: Buffer;
    try { bytes = await readFile(file); }
    catch {
      if (offline) throw new Error('该素材尚未缓存，请在赛前准备离线素材');
      let request = this.pending.get(key);
      if (!request) {
        request = (async () => { const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' }); if (!response.ok) throw new Error('Riot 静态素材暂不可用'); const data = Buffer.from(await response.arrayBuffer()); if (!data.length || data.length > 8*1024*1024) throw new Error('静态素材大小无效'); if (url.pathname.endsWith('.json')) JSON.parse(data.toString('utf8')); else if (!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('图标格式无效'); await mkdir(this.dir,{recursive:true});await writeFile(`${file}.tmp`,data);await rename(`${file}.tmp`,file);return data; })();
        this.pending.set(key, request); void request.finally(() => this.pending.delete(key)).catch(()=>{});
      }
      bytes = await request;
    }
    return { bytes, type: url.pathname.endsWith('.json') ? 'application/json' : 'image/png' };
  }
  async prepare(version: string) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new ValidationError('资源版本需为 Data Dragon 的 x.y.z 格式');
    const urls = new Set<string>();
    const json = async (pathname: string) => { const url = `${origin}${pathname}`; urls.add(url); return JSON.parse((await this.read(url)).bytes.toString('utf8')); };
    const items = await json(`/cdn/${version}/data/zh_CN/item.json`), spells = await json(`/cdn/${version}/data/zh_CN/summoner.json`), champions = await json(`/cdn/${version}/data/en_US/champion.json`), runes = await json(`/cdn/${version}/data/en_US/runesReforged.json`);
    for (const item of Object.values(items.data) as any[]) urls.add(`${origin}/cdn/${version}/img/item/${item.image.full}`);
    for (const spell of Object.values(spells.data) as any[]) urls.add(`${origin}/cdn/${version}/img/spell/${spell.image.full}`);
    for (const rune of runes) { urls.add(`${origin}/cdn/img/${rune.icon}`); for (const slot of rune.slots) for (const option of slot.runes) urls.add(`${origin}/cdn/img/${option.icon}`); }
    const ids = Object.keys(champions.data), failedMetadata=new Set<string>(); let next = 0;
    await Promise.all(Array.from({length:4},async()=>{while(next<ids.length){const id=ids[next++];try{const data=await json(`/cdn/${version}/data/en_US/champion/${id}.json`);for(const spell of data.data[id].spells)urls.add(`${origin}/cdn/${version}/img/spell/${spell.image.full}`);}catch{failedMetadata.add(`${origin}/cdn/${version}/data/en_US/champion/${id}.json`);}}}));
    const all = [...urls]; next = 0; const failures=new Set<string>(failedMetadata);
    await Promise.all(Array.from({length:4},async()=>{while(next<all.length){const url=all[next++];try{await this.read(url);}catch{failures.add(url);}}}));
    const failed=[...failures];
    const manifest = { version, preparedAt: new Date().toISOString(), total: all.length, cached: all.length-failed.length, failed };
    await mkdir(this.dir,{recursive:true});await writeFile(path.join(this.dir,`${version}-manifest.json`),JSON.stringify(manifest,null,2));
    return { ...manifest, detail: failed.length ? `已缓存 ${manifest.cached}/${manifest.total} 个静态素材，${failed.length} 个待补齐` : `版本 ${version} 的 ${all.length} 个静态素材已缓存，离线可用` };
  }
}
