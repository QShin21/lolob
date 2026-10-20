import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {draftArtVariants,cropDraftArt} from './draft-art.mjs';
const root=process.cwd(),manifestFile=path.join(root,'shared/champion-art-manifest.json'),catalogFile=path.join(root,'shared/champion-art-catalog.json');
const manifest=JSON.parse(await readFile(manifestFile,'utf8')),catalog=JSON.parse(await readFile(catalogFile,'utf8'));
const sourceDir=process.argv[2]||path.join(root,'data/champion-art-source');
const hash=b=>createHash('sha256').update(b).digest('hex');
let cursor=0;
await mkdir(path.join(root,'public/champion-art'),{recursive:true});
await Promise.all(Array.from({length:6},async()=>{while(cursor<manifest.champions.length){
 const champion=manifest.champions[cursor++];let portrait;
 try{portrait=await readFile(path.join(sourceDir,`${champion.id}-portrait.jpg`));}
 catch{const response=await fetch(champion.assets.draft.source,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`Missing portrait ${champion.id}`);portrait=Buffer.from(await response.arrayBuffer());}
 if(hash(portrait)!==champion.sourceSha256)throw Error(`Source changed for ${champion.id}; inspect before recropping`);
 for(const [name,[width,height]] of Object.entries(draftArtVariants)){
  const bytes=await cropDraftArt(portrait,name,champion.id),url=`/champion-art/${champion.id}-${name}.webp`;
  await writeFile(path.join(root,'public',url),bytes);
  champion.assets[name]={url,width,height,sha256:hash(bytes),source:champion.assets.draft.source};
  catalog.champions.find(c=>c.id===champion.id).assets[name]={url};
 }
}}));
Object.assign(manifest.variants,draftArtVariants);
await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');await writeFile(catalogFile,JSON.stringify(catalog,null,2)+'\n');
console.log(`Prepared ${manifest.champions.length} champions / ${manifest.champions.length*2} compact and expanded draft crops.`);
