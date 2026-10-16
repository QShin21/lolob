import { Open } from 'unzipper';
import { STYLE_PACK_MAX_BYTES } from '../shared/style-packs';

/** Stored ZIP writer: PNG/WebP are already compressed. No executable entries or symlinks. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function writeStyleZip(files: Record<string, Buffer>): Buffer {
  const local: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = Buffer.from(name), crc = crc32(data), h = Buffer.alloc(30), c = Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    local.push(h, n, data); central.push(c, n); offset += h.length + n.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22), count = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export async function readStyleZip(input: Buffer): Promise<Map<string, Buffer>> {
  if (input.length > STYLE_PACK_MAX_BYTES || input.length < 22) throw new Error('风格包大小无效，最多 48 MiB');
  // Bound the central directory before the ZIP library creates entry objects.
  let end = -1;
  for (let i = input.length - 22; i >= Math.max(0, input.length - 65557); i--) {
    if (input.readUInt32LE(i) === 0x06054b50 && i + 22 + input.readUInt16LE(i + 20) === input.length) { end = i; break; }
  }
  if (end < 0 || input.readUInt16LE(end + 4) !== 0 || input.readUInt16LE(end + 6) !== 0 || input.readUInt16LE(end + 8) !== input.readUInt16LE(end + 10) || input.readUInt16LE(end + 10) > 67 || input.readUInt32LE(end + 12) + input.readUInt32LE(end + 16) > end) throw new Error('ZIP 目录无效、文件数过多，或使用了不支持的分卷/ZIP64 格式');
  const zip = await Open.buffer(input);
  if (zip.files.length > 67) throw new Error('风格包最多 64 张贴图及 manifest.json、README.md');
  const files = new Map<string, Buffer>(), seen = new Set<string>(); let total = 0;
  for (const entry of zip.files) {
    const name = entry.path;
    if (seen.has(name.toLowerCase())) throw new Error('风格包包含重复文件名');
    seen.add(name.toLowerCase());
    if (entry.type === 'Directory' && name === 'assets/') continue;
    if (!(name === 'manifest.json' || name === 'README.md' || /^assets\/[a-z][a-z0-9-]{0,47}\.(png|jpe?g|webp)$/.test(name))) throw new Error(`不允许的包内路径：${name.slice(0,100)}`);
    const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
    if (entry.type !== 'File' || mode && mode !== 0x8000 || entry.flags & 1 || ![0, 8].includes(entry.compressionMethod)) throw new Error('不支持链接、加密或此种压缩方式');
    const limit = name === 'manifest.json' ? 128 * 1024 : name === 'README.md' ? 64 * 1024 : 8 * 1024 * 1024;
    if (entry.uncompressedSize > limit) throw new Error(`包内文件过大：${name}`);
    const stream = entry.stream(), chunks: Buffer[] = []; let size = 0;
    try {
      for await (const chunk of stream) {
        const data = Buffer.from(chunk); size += data.length; total += data.length;
        if (size > limit || total > STYLE_PACK_MAX_BYTES) throw new Error('风格包解压后超出大小限制');
        chunks.push(data);
      }
    } finally { stream.destroy(); }
    const bytes = Buffer.concat(chunks);
    if (size !== entry.uncompressedSize || crc32(bytes) !== entry.crc32) throw new Error(`文件校验失败：${name}`);
    files.set(name, bytes);
  }
  if (!files.has('manifest.json')) throw new Error('风格包根目录缺少 manifest.json');
  return files;
}
