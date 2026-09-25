import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/renderer', { recursive: true });
for (const file of ['index.html', 'overlay.html', 'styles.css']) {
  await cp(`src/renderer/${file}`, `dist/renderer/${file}`);
}
await mkdir('dist/renderer/brand', { recursive: true });
for (const file of ['mark.svg', 'mark-ink.svg']) {
  await cp(`assets/${file}`, `dist/renderer/brand/${file}`);
}
