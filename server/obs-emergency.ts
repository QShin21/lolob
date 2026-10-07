import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const emergencyScene = 'RiftCast 本地技术暂停';
/** Called with the engine lock held, before OBS starts reading its collection. */
export async function prepareEmergencyCollection(collectionFile: string, dataDir: string): Promise<void> {
  const imageFile = path.join(dataDir, 'emergency', 'technical-pause.png');
  await mkdir(path.dirname(imageFile), { recursive: true });
  await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#0e1719"/><rect x="100" y="460" width="80" height="8" fill="#83e6c5"/><text x="220" y="495" fill="#f1f6f5" font-size="72" font-family="Microsoft YaHei">技术暂停</text><text x="220" y="580" fill="#acbfbc" font-size="36" font-family="Microsoft YaHei">比赛信号恢复后继续播出</text><text x="220" y="850" fill="#83e6c5" font-size="30" font-family="Arial">RIFTCAST / ARENA</text></svg>')).png().toFile(imageFile);
  const collection = JSON.parse(await readFile(collectionFile, 'utf8'));
  const sources: any[] = collection.sources ??= [];
  const inputName = 'RiftCast 本地备用图', image = sources.find(s => s.name === inputName);
  const imageSource = image ?? { name: inputName, uuid: randomUUID(), id: 'image_source', versioned_id: 'image_source', mixers: 0, volume: 0, enabled: true, muted: true, hotkeys: {} };
  imageSource.settings = { file: imageFile.replaceAll('\\', '/'), unload: false }; if (!image) sources.push(imageSource);
  let scene = sources.find(s => s.name === emergencyScene);
  if (!scene) { scene = { name: emergencyScene, uuid: randomUUID(), id: 'scene', versioned_id: 'scene', settings: { id_counter: 1, items: [{ name: inputName, source_uuid: imageSource.uuid, id: 1, visible: true, locked: true, pos: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, align: 5 }] }, mixers: 0, enabled: true, hotkeys: {} }; sources.push(scene); }
  scene.hotkeys ??= {}; scene.hotkeys['OBSBasic.SelectScene'] = [{ key: 'OBS_KEY_P', control: true, shift: true, alt: true }];
  collection.scene_order ??= []; if (!collection.scene_order.some((v: any) => v.name === emergencyScene)) collection.scene_order.push({ name: emergencyScene });
  await writeFile(`${collectionFile}.tmp`, JSON.stringify(collection, null, 2), 'utf8'); await rename(`${collectionFile}.tmp`, collectionFile);
}
