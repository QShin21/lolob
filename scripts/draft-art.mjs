import sharp from 'sharp';
export const draftArtVariants={draftCompact:[360,760],draftExpanded:[800,800]};
// These portraits place the face below the top square; reviewed on the contact sheets.
const expandedOffsets={Gnar:.55,KogMaw:.7,Kindred:.55,Malphite:.5,Skarner:.65};
/** Riot's curated loading portrait anchors the face; the wide card shows its upper body. */
export async function cropDraftArt(portrait,name,id){
 const [width,height]=draftArtVariants[name];
 if(name==='draftExpanded'){
  const meta=await sharp(portrait).metadata(),side=Math.min(meta.width,meta.height);
  return sharp(portrait).extract({left:Math.floor((meta.width-side)/2),top:Math.round((meta.height-side)*(expandedOffsets[id]??0)),width:side,height:side}).resize(width,height).webp({quality:92}).toBuffer();
 }
 return sharp(portrait).resize(width,height,{fit:'cover',position:name==='draftExpanded'?'north':'centre'}).webp({quality:92}).toBuffer();
}
