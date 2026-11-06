import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

export const teamKey = (code: string) => createHash('sha256').update('RiftCast team 1.7\0' + code).digest();
export const teamProof = (key: Buffer, nonce: string) => createHmac('sha256', key).update(nonce).digest('base64url');
export function checkProof(key: Buffer, nonce: string, proof: unknown) {
  const expected = Buffer.from(teamProof(key, nonce));
  const actual = Buffer.from(typeof proof === 'string' ? proof : '');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
/** Each direction has an independent nonce space and rejects reordered/replayed records. */
export class TeamCipher {
  private prefix = randomBytes(8);
  private sequence = 0;
  private incomingPrefix?: Buffer;
  private incomingSequence = 0;
  constructor(private key: Buffer) {}
  seal(value: Buffer) {
    if (this.sequence >= 0xffffffff) throw new Error('协作连接需要重新配对');
    const nonce = Buffer.alloc(12); this.prefix.copy(nonce); nonce.writeUInt32BE(this.sequence++, 8);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    return Buffer.concat([nonce, cipher.update(value), cipher.final(), cipher.getAuthTag()]);
  }
  open(value: Buffer) {
    if (value.length < 28 || value.readUInt32BE(8) !== this.incomingSequence || this.incomingPrefix && !this.incomingPrefix.equals(value.subarray(0, 8))) throw new Error('协作消息序列无效');
    const decipher = createDecipheriv('aes-256-gcm', this.key, value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(-16));
    const decoded = Buffer.concat([decipher.update(value.subarray(12, -16)), decipher.final()]);
    this.incomingPrefix ??= Buffer.from(value.subarray(0, 8)); this.incomingSequence++;
    return decoded;
  }
}
