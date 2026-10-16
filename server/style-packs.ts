import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { BUILTIN_RUNTIME_STYLE, BUILTIN_STYLE_PACK, FULL_STYLE_SCENES, STYLE_SCENES, STYLE_SURFACES, styleSummary, validStyleRef } from '../shared/style-packs';
import type { RuntimeStylePack, StylePack, StylePackRef, StylePackSummary, StyleSurface } from '../shared/style-packs';
import { readStyleZip, writeStyleZip } from './style-pack-zip';

const identifier = /^[a-z][a-z0-9-]{0,47}$/;
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('风格包字段需要是对象'); return v as Record<string, unknown>; };
const keys = (v: Record<string, unknown>, allowed: readonly string[]) => { if (Object.keys(v).some(k => !allowed.includes(k))) throw new Error('风格包包含未知字段或不支持的样式'); };
const text = (v: unknown, max: number, empty = false) => { if (typeof v !== 'string' || v.length > max || !empty && !v.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new Error('风格包文本字段无效'); return v; };
const digest = (v: Buffer | string) => createHash('sha256').update(v).digest('hex');

/** Whitelist data only. No CSS, JavaScript, HTML, URLs, fonts or filesystem paths from a pack are executed. */
export function validateStyleManifest(input: unknown): StylePack {
  const m = object(input);
  keys(m, ['format', 'schemaVersion', 'id', 'name', 'version', 'author', 'description', 'canvas', 'palette', 'fonts', 'textures', 'scenes', 'assets']);
  if (m.format !== 'riftcast-style-pack' || m.schemaVersion !== 1) throw new Error('仅支持 riftcast-style-pack 格式第 1 版');
  if (typeof m.id !== 'string' || !identifier.test(m.id)) throw new Error('风格包 id 需为小写英文、数字或连字符，以字母开头，最多 48 字符');
  const version = text(m.version, 40); if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('风格包版本需为 x.y.z');
  const canvas = object(m.canvas); keys(canvas, ['width', 'height']);
  if (canvas.width !== 1920 || canvas.height !== 1080) throw new Error('风格包画布须为 1920 × 1080');
  const p = object(m.palette), palette = { ...BUILTIN_STYLE_PACK.palette }; keys(p, Object.keys(palette));
  for (const [key, value] of Object.entries(p)) { if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) throw new Error(`配色 ${key} 需使用十六进制颜色`); palette[key] = value.toLowerCase(); }
  const fonts = object(m.fonts); keys(fonts, ['body', 'display']);
  for (const key of ['body', 'display']) if (!['default', 'modern', 'serif'].includes(String(fonts[key]))) throw new Error('字体仅支持 default、modern、serif');
  const assetsInput = object(m.assets), assets: Record<string, string> = {};
  if (Object.keys(assetsInput).length > 64) throw new Error('风格包最多 64 张贴图');
  const paths = new Set<string>();
  for (const id of Object.keys(assetsInput).sort()) {
    const value = assetsInput[id];
    if (!identifier.test(id) || typeof value !== 'string' || !/^assets\/[a-z][a-z0-9-]{0,47}\.(png|jpe?g|webp)$/.test(value) || paths.has(value)) throw new Error('贴图需为 assets 目录内唯一的 PNG、JPEG 或 WebP 文件');
    paths.add(value); assets[id] = value;
  }
  const texture = (value: unknown): string | null => {
    if (value === null) return null;
    if (typeof value !== 'string' || !Object.hasOwn(assets, value)) throw new Error('贴图槽引用了未声明的图片');
    return value;
  };
  const surfaces = (value: unknown, complete: boolean) => {
    const input = object(value); keys(input, STYLE_SURFACES);
    return Object.fromEntries((complete ? STYLE_SURFACES : STYLE_SURFACES.filter(k => Object.hasOwn(input, k))).map(k => [k, texture(input[k] ?? null)])) as Record<StyleSurface, string | null>;
  };
  const scenes = object(m.scenes); keys(scenes, STYLE_SCENES);
  const result = {} as StylePack['scenes'];
  for (const scene of STYLE_SCENES) {
    const value = object(scenes[scene]); keys(value, ['background', 'frame', 'textures']);
    const background = texture(value.background), frame = texture(value.frame), textures = surfaces(value.textures ?? {}, false);
    if (!FULL_STYLE_SCENES.includes(scene) && background !== null) throw new Error(`场景 ${scene} 需要保留游戏或摄像头透明背景`);
    if (scene === 'teamfight' && (frame !== null || Object.values(textures).some(v => v !== null))) throw new Error('原生团战视角必须保持全透明');
    result[scene] = { background, frame, textures };
  }
  return { format: 'riftcast-style-pack', schemaVersion: 1, id: m.id, name: text(m.name, 80), version, author: text(m.author, 80, true), description: text(m.description, 500, true), canvas: { width: 1920, height: 1080 }, palette, fonts: fonts as StylePack['fonts'], textures: surfaces(m.textures, true), scenes: result, assets };
}

export function builtinStyleArchive(): Buffer {
  const manifest = structuredClone(BUILTIN_STYLE_PACK), files: Record<string, Buffer> = {};
  for (const [id, data] of Object.entries(manifest.assets)) { manifest.assets[id] = `assets/${id}.png`; files[manifest.assets[id]] = Buffer.from(data.split(',')[1], 'base64'); }
  files['manifest.json'] = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  files['README.md'] = Buffer.from('RiftCast 风格包 v1\n\n本包为简陋包原始外观。制作新风格时先将 manifest.json 的 id 改为唯一英文标识，并填写 name、version。替换 assets 内的贴图，编辑 palette 与固定贴图槽。将 manifest.json 和 assets 文件夹一同压缩到 ZIP 根目录，场景库 > 风格包 > 导入。\n\n画布 1920×1080。局内、BP、采访背景保留透明，teamfight 保留全透明。图片支持 PNG、JPEG、静态 WebP；透明装饰请用 PNG。禁止脚本、外链、SVG、字体文件。仅外观变化，英雄、队伍、选手、比分仍由实时数据绘制。先准备到预监，核对后 TAKE。\n');
  return writeStyleZip(files);
}

interface StoredPack { manifest: StylePack; hashes: Record<string, string>; revision: string }
function revisionFor(manifest: StylePack, hashes: Record<string, string>) { return digest(JSON.stringify({ manifest, hashes })); }

export class StylePackStore {
  private installed = new Map<string, StoredPack>();
  private importing = false;
  readonly warnings: string[] = [];
  constructor(readonly directory: string) {}
  private key(ref: Pick<StylePackRef, 'id' | 'revision'>) { return `${ref.id}--${ref.revision}`; }
  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    for (const entry of (await readdir(this.directory, { withFileTypes: true })).filter(e => e.isDirectory() && /^[a-z][a-z0-9-]{0,47}--[a-f0-9]{64}$/.test(e.name)).slice(0, 50)) {
      try {
        const dir = path.join(this.directory, entry.name), bytes = await readFile(path.join(dir, 'record.json'));
        if (bytes.length > 256 * 1024) throw new Error('记录过大');
        const stored = JSON.parse(bytes.toString()) as StoredPack, manifest = validateStyleManifest(stored.manifest), hashes: Record<string, string> = {};
        for (const file of Object.values(manifest.assets)) { const bytes = await readFile(path.join(dir, file)); if (bytes.length > 8 * 1024 * 1024) throw new Error('图片过大'); hashes[file] = digest(bytes); }
        const revision = revisionFor(manifest, hashes);
        if (manifest.id === 'jianlou' || revision !== stored.revision || this.key({ id: manifest.id, revision }) !== entry.name) throw new Error('文件校验失败');
        this.installed.set(entry.name, { manifest, hashes, revision });
      } catch { this.warnings.push(`风格包 ${entry.name.slice(0, 48)} 已损坏，暂不可用；请重新导入原包`); }
    }
  }
  list(): StylePackSummary[] { return [styleSummary(BUILTIN_RUNTIME_STYLE), ...[...this.installed.values()].map(s => styleSummary(this.runtime(s)))]; }
  get(ref: StylePackRef): RuntimeStylePack {
    if (!validStyleRef(ref)) throw new Error('风格包引用无效');
    if (ref.id === 'jianlou') return BUILTIN_RUNTIME_STYLE;
    const pack = this.installed.get(this.key(ref)); if (!pack) throw new Error('风格包不存在或已损坏，请重新导入');
    return this.runtime(pack);
  }
  private runtime(stored: StoredPack): RuntimeStylePack {
    const manifest = stored.manifest;
    return { ...manifest, revision: stored.revision, builtin: false, assets: Object.fromEntries(Object.keys(manifest.assets).map(id => [id, `/api/style-packs/${manifest.id}/${stored.revision}/assets/${id}`])) };
  }
  async asset(ref: StylePackRef, id: string): Promise<Buffer> {
    this.get(ref); const stored = this.installed.get(this.key(ref)), file = stored?.manifest.assets[id];
    if (!file || !identifier.test(id)) throw new Error('贴图不存在');
    const bytes = await readFile(path.join(this.directory, this.key(ref), file));
    if (digest(bytes) !== stored!.hashes[file]) throw new Error('贴图已损坏，请重新导入风格包');
    return bytes;
  }
  async export(ref: StylePackRef): Promise<Buffer> {
    this.get(ref); if (ref.id === 'jianlou') return builtinStyleArchive();
    const stored = this.installed.get(this.key(ref))!, files: Record<string, Buffer> = { 'manifest.json': Buffer.from(JSON.stringify(stored.manifest, null, 2) + '\n') };
    for (const [id, file] of Object.entries(stored.manifest.assets)) files[file] = await this.asset(ref, id);
    return writeStyleZip(files);
  }
  async import(input: Buffer): Promise<StylePackSummary> {
    if (this.importing) throw new Error('已有风格包正在导入，请完成后重试');
    this.importing = true;
    try { return await this.importArchive(input); } finally { this.importing = false; }
  }
  private async importArchive(input: Buffer): Promise<StylePackSummary> {
    const entries = await readStyleZip(input), raw = entries.get('manifest.json')!;
    const manifest = validateStyleManifest(JSON.parse(raw.toString('utf8')));
    const claimed = new Set(['manifest.json', 'README.md', ...Object.values(manifest.assets)]);
    for (const filename of entries.keys()) if (!claimed.has(filename)) throw new Error(`存在未声明的素材：${filename}`);
    if (manifest.id === 'jianlou') {
      const original = await readStyleZip(builtinStyleArchive());
      if (JSON.stringify(manifest) === JSON.stringify(validateStyleManifest(JSON.parse(original.get('manifest.json')!.toString()))) && Object.values(manifest.assets).every(file => entries.get(file)?.equals(original.get(file)!))) return styleSummary(BUILTIN_RUNTIME_STYLE);
      throw new Error('jianlou 为内置简陋包保留标识，请为新风格修改 manifest.json 的 id');
    }
    const files: Record<string, Buffer> = {}, hashes: Record<string, string> = {}; let pixels = 0, bytes = 0;
    for (const [id, file] of Object.entries(manifest.assets)) {
      const input = entries.get(file); if (!input) throw new Error(`缺少贴图：${file}`);
      const extension = path.extname(file).slice(1).replace('jpg', 'jpeg');
      const kind = input.length >= 12 && input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png' : input.length >= 3 && input[0] === 255 && input[1] === 216 ? 'jpeg' : input.length >= 12 && input.toString('ascii',0,4) === 'RIFF' && input.toString('ascii',8,12) === 'WEBP' ? 'webp' : undefined;
      if (kind !== extension) throw new Error(`贴图格式与文件扩展名不符：${file}`);
      const image = sharp(input, { failOn: 'warning', limitInputPixels: 4096 * 4096 });
      const meta = await image.metadata();
      if (!['png', 'jpeg', 'webp'].includes(meta.format ?? '') || extension !== meta.format || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height || meta.width > 4096 || meta.height > 4096) throw new Error(`贴图格式、尺寸或帧数无效：${file}`);
      pixels += meta.width * meta.height; if (pixels > 64 * 1024 * 1024) throw new Error('贴图总像素数超过 64M');
      // Decode and re-encode all inputs; metadata and trailing payloads never reach a browser.
      const png = await image.rotate().png().toBuffer(); bytes += png.length;
      if (png.length > 8 * 1024 * 1024 || bytes > 40 * 1024 * 1024) throw new Error('规范化贴图超出容量限制');
      const filename = `assets/${id}.png`; manifest.assets[id] = filename; files[filename] = png; hashes[filename] = digest(png);
    }
    const revision = revisionFor(manifest, hashes), stored = { manifest, hashes, revision }, key = this.key({ id: manifest.id, revision });
    if (this.installed.has(key)) return styleSummary(this.runtime(this.installed.get(key)!));
    if (this.installed.size >= 50) throw new Error('已安装 50 个风格版本，请在停播后备份并清理数据目录');
    const temporary = path.join(this.directory, `.import-${randomUUID()}`), destination = path.join(this.directory, key);
    try {
      await mkdir(path.join(temporary, 'assets'), { recursive: true });
      for (const [file, data] of Object.entries(files)) await writeFile(path.join(temporary, file), data, { flag: 'wx' });
      await writeFile(path.join(temporary, 'record.json'), JSON.stringify(stored) + '\n', { flag: 'wx' });
      // A previously corrupt copy is replaced only by a fully validated copy of the same content hash.
      await rm(destination, { recursive: true, force: true });
      await rename(temporary, destination);
      this.installed.set(key, stored);
    } catch (error) { await rm(temporary, { recursive: true, force: true }).catch(() => {}); throw error; }
    return styleSummary(this.runtime(stored));
  }
}
