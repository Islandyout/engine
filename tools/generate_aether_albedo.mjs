// Regenerate from the identified user-provided Aether archive; no browser or GPU required.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
if (process.argv.length !== 4) throw new Error('Usage: generate_aether_albedo.mjs EXTRACTED_AETHER OUTPUT_RGBA');
const source = path.resolve(process.argv[2], 'src/procgen/textures.js');
const { generateTextureSet } = await import(pathToFileURL(source));
fs.writeFileSync(process.argv[3], generateTextureSet('planks', {seed:43, size:64}).albedo);
