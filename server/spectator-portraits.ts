import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { bundledChampions, bundledChampionVersion } from '../shared/champion-art';
import type { Player } from '../shared/types';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDirectory=process.env.RIFTCAST_DATA_DIR?path.resolve(process.env.RIFTCAST_DATA_DIR):path.join(root,'data');
/** Each installation can build OCR templates from shipped icons without a network or migrated cache. */
export class PortraitManifestStore {
  private pending?:Promise<string|undefined>;
  private cachedKey='';private cachedPath?:string;private retryAfter=0;private complete=false;
  constructor(private directory=dataDirectory,private iconRoots=[path.join(root,'dist/champion-art'),path.join(root,'public/champion-art')]){}
  async prepare(players:Player[]):Promise<string|undefined>{
    const roster=players.filter(p=>/^(blue|red)$/.test(p.team)&&/^[A-Za-z][A-Za-z0-9]{1,40}$/.test(p.championId)).map(p=>({team:p.team,championId:p.championId})).sort((a,b)=>`${a.team}:${a.championId}`.localeCompare(`${b.team}:${b.championId}`));
    if(!roster.length||roster.length>10)return;
    const key=JSON.stringify(roster);
    if(key===this.cachedKey&&(this.complete||Date.now()<this.retryAfter))return this.cachedPath;
    if(this.pending){await this.pending;return this.prepare(players);}
    this.pending=(async()=>{
      this.complete=false;
      try{
        let version=bundledChampionVersion;
        try{const catalog=JSON.parse(await readFile(path.join(this.directory,'champions.json'),'utf8'));if(/^\d+\.\d+\.\d+$/.test(catalog.version))version=catalog.version;}catch{/* Fresh installations use the bundled catalog. */}
        const bundledIds=new Set(bundledChampions().map(c=>c.id));
        const folder=path.join(this.directory,'spectator-portraits',version);await mkdir(folder,{recursive:true});
        const entries=await Promise.all(roster.map(async entry=>{
          try{
            const imagePath=path.join(folder,`${entry.championId}.png`);
            try{await sharp(await readFile(imagePath)).metadata();}catch{
              let bytes:Buffer|undefined;
              if(bundledIds.has(entry.championId))for(const iconRoot of this.iconRoots){try{bytes=await sharp(await readFile(path.join(iconRoot,`${entry.championId}-icon.webp`))).png().toBuffer();break;}catch{/* Try the other bundled location. */}}
              if(!bytes){const response=await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${entry.championId}.png`,{signal:AbortSignal.timeout(4000)});if(!response.ok)return;const source=Buffer.from(await response.arrayBuffer());if(source.length>500000)return;bytes=await sharp(source).png().toBuffer();}
              const temporary=`${imagePath}.${randomUUID()}.tmp`;await writeFile(temporary,bytes);await rename(temporary,imagePath);
            }
            return {...entry,imagePath};
          }catch{return;}
        }));
        const portraits=entries.filter(Boolean);if(!portraits.length)return;
        const manifest=path.join(folder,`roster-${createHash('sha256').update(key).digest('hex').slice(0,16)}.json`);
        await writeFile(manifest,JSON.stringify({version,portraits}),'utf8');this.complete=portraits.length===roster.length;return manifest;
      }catch{return;}
    })();
    try{this.cachedPath=await this.pending;this.cachedKey=key;this.retryAfter=Date.now()+8000;return this.cachedPath;}finally{this.pending=undefined;}
  }
}
const store=new PortraitManifestStore();
export const prepareChampionPortraitManifest=(players:Player[])=>store.prepare(players);
