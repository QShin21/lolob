import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const manifestFile='shared/champion-art-manifest.json',catalogFile='shared/champion-art-catalog.json';
const manifest=JSON.parse(await readFile(manifestFile,'utf8')),catalog=JSON.parse(await readFile(catalogFile,'utf8'));
const focal=JSON.parse(await readFile('shared/lineup-banner-crops.json','utf8'));
const cache=process.argv[2]||'data/champion-splash-source';await mkdir(cache,{recursive:true});
const width=1200,height=426,hash=b=>createHash('sha256').update(b).digest('hex');let cursor=0;
await Promise.all(Array.from({length:6},async()=>{while(cursor<manifest.champions.length){
 const c=manifest.champions[cursor++],source=`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${c.id}_0.jpg`,file=path.join(cache,c.id+'.jpg');let input;
 try{input=await readFile(file);}catch{const response=await fetch(source,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`Cannot load ${c.id}`);input=Buffer.from(await response.arrayBuffer());await writeFile(file,input);}
 const m=await sharp(input).metadata(),cropHeight=Math.min(m.height,Math.round(m.width*height/width));
 const top=Math.max(0,Math.min(m.height-cropHeight,Math.round(m.height*(focal.champions[c.id]?.centerY??.38)-cropHeight/2)));
 const crop={left:0,top,width:m.width,height:cropHeight};
 const output=await sharp(input).extract(crop).resize(width,height).webp({quality:92}).toBuffer(),url=`/champion-art/${c.id}-draftReveal.webp`;
 await writeFile(path.join('public',url),output);
 c.assets.draftReveal={url,width,height,sha256:hash(output),source,sourceSha256:hash(input),crop};
 catalog.champions.find(entry=>entry.id===c.id).assets.draftReveal={url};
}}));
manifest.variants.draftReveal=[width,height];
await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');await writeFile(catalogFile,JSON.stringify(catalog,null,2)+'\n');
console.log(`Prepared ${manifest.champions.length} independent 1200x426 lock-reveal portraits.`);
