declare module 'unzipper' {
  import type { Readable } from 'node:stream';
  export const Open: { buffer(input: Buffer): Promise<{ files: Array<{ path: string; type: string; externalFileAttributes: number; flags: number; compressionMethod: number; uncompressedSize: number; crc32: number; stream(): Readable }> }> };
}
