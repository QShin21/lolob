import sharp from 'sharp';
import { BUILTIN_STYLE_PACK, FULL_STYLE_SCENES, STYLE_SCENES, STYLE_SURFACES } from '../shared/style-packs';
import { writeStyleZip } from './style-pack-zip';
/** Small synthetic raster fixture, separate from shipped artwork. */
export async function syntheticStyleArchive() {
  const manifest = structuredClone(BUILTIN_STYLE_PACK);
  manifest.id = 'verification-cup'; manifest.name = '验证用赛事风格';
  manifest.description = 'Synthetic verification fixture'; manifest.version = '1.0.0';
  manifest.assets = Object.fromEntries(['ink', 'panel', 'paper', 'black', 'cream'].map(id => [id, `assets/${id}.png`]));
  manifest.textures = Object.fromEntries(STYLE_SURFACES.map(id => [id, null])) as typeof manifest.textures;
  manifest.scenes = Object.fromEntries(STYLE_SCENES.map(id => [id, { background: FULL_STYLE_SCENES.includes(id) ? (id === 'lineup' || id === 'postgame' ? 'cream' : 'ink') : null, frame: null, textures: {} }])) as typeof manifest.scenes;
  manifest.scenes.standby.textures.paper = 'paper';
  manifest.scenes.draft.textures = { cardBlue: 'ink', cardRed: 'ink', draftCenter: 'panel' };
  manifest.scenes.live.textures = { scoreboard: 'black', rowBlue: 'black', rowRed: 'black' };
  const files: Record<string, Buffer> = {};
  for (const [id, file] of Object.entries(manifest.assets)) files[file] = await sharp({create:{width:16,height:16,channels:4,background:id === 'paper' || id === 'cream' ? '#f3dfc5' : '#290c41'}}).png().toBuffer();
  files['manifest.json'] = Buffer.from(JSON.stringify(manifest));
  return writeStyleZip(files);
}
