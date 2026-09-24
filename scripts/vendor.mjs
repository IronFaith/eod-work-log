// Run after npm ci when deliberately updating the bundled PDF dependencies.
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const vendor = new URL('vendor/', root);
await mkdir(vendor, { recursive: true });
for (const [source, target] of [
  ['jspdf/dist/jspdf.umd.min.js', 'jspdf.umd.min.js'],
  ['jspdf/LICENSE', 'jspdf-LICENSE'],
  ['jspdf-autotable/dist/jspdf.plugin.autotable.min.js', 'jspdf.plugin.autotable.min.js'],
  ['jspdf-autotable/LICENSE.txt', 'autotable-LICENSE.txt']
]) await copyFile(new URL(`node_modules/${source}`, root), new URL(target, vendor));
const revision = 'ffebf8c1ee449e544955a7e813c54f9b73848eac';
const base = `https://raw.githubusercontent.com/notofonts/noto-fonts/${revision}/`;
const fonts = {};
for (const style of ['Regular', 'Bold']) {
  const response = await fetch(`${base}hinted/ttf/NotoSans/NotoSans-${style}.ttf`);
  if (!response.ok) throw new Error(`Font download failed: ${response.status}`);
  fonts[style.toLowerCase()] = Buffer.from(await response.arrayBuffer()).toString('base64');
}
await writeFile(new URL('fonts.mjs', vendor), `// Noto Sans, SIL OFL 1.1. Source revision: ${revision}\nexport default ${JSON.stringify(fonts)};\n`);
const license = await fetch(`${base}LICENSE`);
if (!license.ok) throw new Error('Font license download failed');
await writeFile(new URL('NotoSans-LICENSE', vendor), await license.text());
