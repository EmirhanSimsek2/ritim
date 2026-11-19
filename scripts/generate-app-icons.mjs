import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Keep all raster install icons derived from the existing vector brand mark.
const publicDir = new URL('../public/', import.meta.url);
const vector = await readFile(new URL('favicon.svg', publicDir));
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(vector, { density: 768 })
    .resize(size, size)
    .flatten({ background: '#212121' })
    .png()
    .toFile(fileURLToPath(new URL(name, publicDir)));
  console.log(name + ': ' + size + 'x' + size);
}
