import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tsImport } from 'tsx/esm/api';
const { builtinStyleArchive } = await tsImport('../server/style-packs.ts', import.meta.url);
const destination = path.resolve(process.argv[2] || 'verification-output/jianlou.riftstyle.zip');
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, builtinStyleArchive());
console.log(destination);
