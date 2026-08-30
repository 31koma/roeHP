import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');

const files = [
  'index.html',
  'style.css',
  'script.js',
  'favicon.svg',
  'site.webmanifest',
  'sitemap.xml',
  'robots.txt'
];

const directories = [
  'access',
  'assets',
  'dinner',
  'english',
  'images',
  'lunch',
  'news',
  'public'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of files) {
  await cp(join(root, file), join(output, file));
}

for (const directory of directories) {
  await cp(join(root, directory), join(output, directory), { recursive: true });
}

console.log(`Built ${files.length} files and ${directories.length} directories into dist/.`);
