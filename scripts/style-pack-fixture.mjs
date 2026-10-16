import { tsImport } from 'tsx/esm/api';
import sharp from 'sharp';
const { builtinStyleArchive } = await tsImport('../server/style-packs.ts', import.meta.url);
const { readStyleZip, writeStyleZip } = await tsImport('../server/style-pack-zip.ts', import.meta.url);
/** Synthetic contrast artwork. Test fixture only, not a second shipped design. */
export async function stylePackFixture() {
  const files = Object.fromEntries(await readStyleZip(builtinStyleArchive()));
  const manifest = JSON.parse(files['manifest.json'].toString());
  manifest.id = 'verification-cup'; manifest.name = '验证用赛事风格'; manifest.version = '1.0.0';
  manifest.description = 'Synthetic verification fixture';
  manifest.palette.ink = '#290c41'; manifest.palette.panel = '#290c41'; manifest.palette.accent = '#f1a83d';
  manifest.palette.paper = '#f3dfc5'; manifest.fonts = { body: 'modern', display: 'serif' };
  for (const id of Object.keys(manifest.assets)) files[manifest.assets[id]] = await sharp({ create: { width: 16, height: 16, channels: 4, background: id === 'paper' || id === 'cream' ? '#f3dfc5' : '#290c41' } }).png().toBuffer();
  manifest.textures.header = 'panel'; manifest.textures.panel = 'panel';
  files['manifest.json'] = Buffer.from(JSON.stringify(manifest));
  return writeStyleZip(files);
}
