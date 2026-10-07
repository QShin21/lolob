import { open, rename } from 'node:fs/promises';

/** Sync the replacement file before the atomic rename; a failed save rejects the caller. */
export async function writeDurableState(file: string, value: unknown): Promise<void> {
  const handle = await open(`${file}.tmp`, 'w', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2), 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  await rename(`${file}.tmp`, file);
}
