import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import sharp from 'sharp';
const { syntheticStyleArchive } = await tsImport('../server/style-pack-fixture.ts', import.meta.url);
const { readStyleZip, writeStyleZip } = await tsImport('../server/style-pack-zip.ts', import.meta.url);
/** Synthetic contrast artwork. Test fixture only, not a second shipped design. */
export async function stylePackFixture() {
  const files = Object.fromEntries(await readStyleZip(process.env.RIFTCAST_STYLE_FIXTURE ? await readFile(process.env.RIFTCAST_STYLE_FIXTURE) : await syntheticStyleArchive()));
  const manifest = JSON.parse(files['manifest.json'].toString());
  manifest.id = 'verification-cup'; manifest.name = '验证用赛事风格'; manifest.version = '1.0.0';
  manifest.appearance = {lineupName:{color:'#ff0000',font:'serif',fontSize:1.8,fontWeight:700,letterSpacing:.02,borderColor:'#345678'},liveName:{color:'#fedcba'},reportName:{color:'#fedcba'},interviewName:{color:'#fedcba'},lineupGame:{color:'#ffffff',backgroundColor:'#133964'}};
  manifest.scenes.lineup.appearance = {lineupName:{color:'#17365e'}};
  manifest.description = 'Synthetic verification fixture';
  manifest.palette.ink = '#290c41'; manifest.palette.panel = '#290c41'; manifest.palette.accent = '#f1a83d';
  manifest.palette.paper = '#f3dfc5'; manifest.fonts = { body: 'modern', display: 'serif' };
  if (!process.env.RIFTCAST_STYLE_FIXTURE) for (const id of Object.keys(manifest.assets)) files[manifest.assets[id]] = await sharp({ create: { width: 16, height: 16, channels: 4, background: id === 'paper' || id === 'cream' ? '#f3dfc5' : '#290c41' } }).png().toBuffer();
  if (!process.env.RIFTCAST_STYLE_FIXTURE) { manifest.textures.header = 'panel'; manifest.textures.panel = 'panel'; manifest.scenes.lineup.textures.cardBlue = 'cream'; manifest.scenes.lineup.textures.cardRed = 'cream'; }
  files['manifest.json'] = Buffer.from(JSON.stringify(manifest));
  return writeStyleZip(files);
}
