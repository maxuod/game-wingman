// Rebuild platform icons from the repository's vector master. No network or new dependencies.
// Run with: npm run icons
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let window;

async function raster(svg, size) {
  const data = await window.webContents.executeJavaScript(`(async () => {
    const image = new Image();
    image.src = ${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))};
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ${size};
    canvas.getContext('2d').drawImage(image, 0, 0, ${size}, ${size});
    return canvas.toDataURL('image/png').split(',')[1];
  })()`);
  return Buffer.from(data, 'base64');
}

async function generate() {
  const master = await fs.readFile(path.join(root, 'assets/icon.svg'), 'utf8');
  const mark = master.match(/<g id="wingman"[\s\S]*?<\/g>/)?.[0];
  if (!mark) throw new Error('Missing wingman group in assets/icon.svg');
  const svg = (body, viewBox = '0 0 256 256') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>\n`;
  const write = (name, data) => fs.writeFile(path.join(root, 'assets', name), data);
  await write('mark.svg', svg(mark, '32 72 192 104'));
  await write('mark-ink.svg', svg(mark.replace('#a8d0c6', '#21333e'), '32 72 192 104'));
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const pngs = new Map();
  for (const size of sizes) pngs.set(size, await raster(master, size));
  await write('icon.png', pngs.get(1024));
  // PNG-compressed ICO entries are supported on Windows Vista and later.
  const icoSizes = sizes.filter(size => size <= 256);
  const icoHeader = Buffer.alloc(6 + 16 * icoSizes.length);
  icoHeader.writeUInt16LE(1, 2); icoHeader.writeUInt16LE(icoSizes.length, 4);
  let offset = icoHeader.length;
  icoSizes.forEach((size, i) => {
    const entry = 6 + i * 16; const png = pngs.get(size);
    icoHeader[entry] = icoHeader[entry + 1] = size === 256 ? 0 : size;
    icoHeader.writeUInt16LE(1, entry + 4); icoHeader.writeUInt16LE(32, entry + 6);
    icoHeader.writeUInt32LE(png.length, entry + 8); icoHeader.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  await write('icon.ico', Buffer.concat([icoHeader, ...icoSizes.map(size => pngs.get(size))]));
  const icnsTypes = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024], ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512]];
  const chunks = icnsTypes.map(([type, size]) => {
    const png = pngs.get(size); const header = Buffer.alloc(8);
    header.write(type); header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });
  const icnsHeader = Buffer.alloc(8); icnsHeader.write('icns');
  icnsHeader.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  await write('icon.icns', Buffer.concat([icnsHeader, ...chunks]));
  const template = svg(mark.replace('#a8d0c6', '#000000'), '24 24 208 208');
  await write('trayTemplate.png', await raster(template, 18));
  await write('trayTemplate@2x.png', await raster(template, 36));
  console.log('Generated PNG, SVG marks, Windows ICO, macOS ICNS and template tray icons from assets/icon.svg.');
}

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'gwm-icons-'));
  app.setPath('userData', profile);
  await app.whenReady();
  window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await window.loadURL('data:text/html,<!doctype html><title>Icon export</title>');
  try { await generate(); }
  catch (error) { console.error(error); process.exitCode = 1; }
  finally { window.destroy(); app.exit(process.exitCode || 0); }
})().catch(error => { console.error(error); app.exit(1); });
