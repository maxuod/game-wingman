import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/renderer', { recursive: true });
for (const file of ['index.html', 'overlay.html', 'styles.css']) {
  await cp(`src/renderer/${file}`, `dist/renderer/${file}`);
}
