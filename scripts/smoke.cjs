// Uses an application-owned synthetic window, never a user's game or desktop.
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

async function until(read, condition, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await read();
    if (condition(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Expected state did not arrive within ' + timeout + ' ms');
}
(async () => {
  const artifactDir = path.resolve(process.env.GWM_ARTIFACT_DIR || 'artifacts');
  await fs.mkdir(artifactDir, { recursive: true });
  const artifact = name => path.join(artifactDir, name);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'gwm-smoke-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const args = [...(process.env.GWM_EXECUTABLE ? [] : [path.resolve('.')]), `--user-data-dir=${profile}`, '--disable-auto-detect', '--disable-public-updates'];
  const app = await _electron.launch({ args, env, ...(process.env.GWM_EXECUTABLE ? { executablePath: process.env.GWM_EXECUTABLE } : {}) });
  const failures = [];
  app.on('window', page => page.on('pageerror', error => failures.push(error.message)));
  const report = { main: false, overlay: false, isolation: false, importedImage: false, capture: 'not tested', staleFrame: false, catalogue: 'not tested' };
  try {
    report.environment = await app.evaluate(({ screen, app }) => ({
      platform: process.platform, arch: process.arch, systemVersion: process.getSystemVersion(),
      electron: process.versions.electron, appVersion: app.getVersion(), packaged: app.isPackaged,
      displays: screen.getAllDisplays().map(display => ({ bounds: display.bounds, scaleFactor: display.scaleFactor }))
    }));
    report.environment.testNode = process.version;
    const main = await until(() => Promise.resolve(app.windows().find(window => window.url().endsWith('/index.html'))), Boolean);
    const overlay = await until(() => Promise.resolve(app.windows().find(window => window.url().endsWith('/overlay.html'))), Boolean);
    await main.waitForSelector('#choose-source');
    await main.screenshot({ path: artifact('app-main.png') });
    assert.equal(await main.evaluate(() => typeof window.require), 'undefined');
    assert.equal(await main.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    report.main = true;
    const readState = () => main.evaluate(async () => (await window.desktop.state()).value);
    assert.equal((await readState()).capture, 'idle');
    assert.equal((await readState()).overlayVisible, true, 'Overlay shows by default');
    await main.evaluate(() => window.desktop.overlay('show'));
    await until(readState, state => state.overlayVisible);
    const native = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/overlay.html'));
      return { top: window.isAlwaysOnTop(), visible: window.isVisible(), size: window.getSize() };
    });
    assert.equal(native.top, true, `Overlay must stay on top: ${JSON.stringify(native)}`);
    assert.equal(native.visible, true, `Overlay must be visible: ${JSON.stringify(native)}`);
    assert.deepEqual(native.size, [320, 248]);
    await overlay.screenshot({ path: artifact('app-overlay.png') });
    await overlay.click('#collapse-button');
    assert.equal((await readState()).collapsed, true);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/overlay.html')).getSize()[1]), 52);
    await main.evaluate(() => window.desktop.overlay('reset'));
    assert.deepEqual(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/overlay.html')).getSize()), [320, 52]);
    await overlay.click('#collapse-button');
    assert.deepEqual(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/overlay.html')).getSize()), [320, 248]);
    await main.click('#overlay-button');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/overlay.html')).isVisible()), false);
    await main.click('#overlay-button');
    const restored = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/overlay.html'));
      return { top: window.isAlwaysOnTop(), visible: window.isVisible(), resizable: window.isResizable(), focused: window.isFocused() };
    });
    assert.deepEqual(restored, { top: true, visible: true, resizable: false, focused: false });
    assert.equal((await overlay.evaluate(() => window.desktop.sources())).ok, false);
    assert.equal((await overlay.evaluate(() => window.desktop.selectSource('forged'))).ok, false);
    assert.equal((await overlay.evaluate(() => window.desktop.importImage())).ok, false);
    report.isolation = true;
    assert.equal((await main.evaluate(() => window.desktop.opacity(0))).ok, false);
    const capabilities = (await readState()).shortcuts;
    report.shortcuts = capabilities;
    report.clickThrough = 'Skipped: shortcuts unavailable';
    if (capabilities.visibility && capabilities.interaction) {
      await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/overlay.html'));
        const original = window.setIgnoreMouseEvents.bind(window);
        window.setIgnoreMouseEvents = (ignore, options) => { original(ignore, options); global.__ignoreMouseEvents = ignore; };
      });
      await main.evaluate(() => window.desktop.overlay('interaction'));
      assert.equal(await app.evaluate(() => global.__ignoreMouseEvents), true);
      await main.evaluate(() => window.desktop.overlay('reset'));
      assert.equal(await app.evaluate(() => global.__ignoreMouseEvents), false);
      report.clickThrough = 'Native API enabled and reset; physical mouse pass-through not tested';
    }
    report.overlay = true;
    console.log('Desktop windows, overlay controls and IPC isolation passed.');

    // A known synthetic PNG, selected via the same native import handler used in production.
    const fixture = path.join(profile, 'synthetic-input.png');
    const fixtureBytes = await app.evaluate(({ nativeImage, dialog }, filename) => {
      const bytes = Buffer.alloc(640 * 360 * 4);
      for (let i = 0; i < bytes.length; i += 4) { bytes[i] = 80; bytes[i + 1] = 130; bytes[i + 2] = 100; bytes[i + 3] = 255; }
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
      return nativeImage.createFromBitmap(bytes, { width: 640, height: 360 }).toPNG().toString('base64');
    }, fixture);
    await fs.writeFile(fixture, Buffer.from(fixtureBytes, 'base64'));
    await main.click('#import-button');
    await main.waitForSelector('#frame-preview:not([hidden])');
    assert.equal((await readState()).frameCount, 1);
    assert.equal((await readState()).source, null);
    assert.equal((await main.evaluate(async () => window.desktop.frame((await window.desktop.state()).value.epoch))).ok, false);
    report.importedImage = true;
    console.log('Native image import passed.');

    const permission = await app.evaluate(({ systemPreferences }) => process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted');
    if (permission === 'granted') {
      await app.evaluate(async ({ BrowserWindow }) => {
        const fixtureWindow = new BrowserWindow({ width: 640, height: 400, title: 'Capture QA synthetic', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
        global.__fixtureWindow = fixtureWindow;
        await fixtureWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html><head><meta charset="UTF-8"><title>Capture QA synthetic</title></head><body style="background:#284840;color:#f2f5f4;font:24px system-ui;padding:40px"><small>GAME WINGMAN · CAPTURE QA</small><h1>Synthetic game window</h1><p>No player data</p><p id="clock"></p><script>setInterval(()=>document.getElementById("clock").textContent=new Date().toISOString(),500)</script></body></html>'));
      });
      await main.click('#choose-source');
      await main.getByRole('button', { name: 'Capture QA synthetic', exact: true }).click();
      await main.click('#capture-button');
      let active;
      try { active = await until(readState, state => state.capture === 'active' && state.frameCount >= 1, 20000); }
      catch (error) {
        console.error('Capture diagnostic:', await main.evaluate(async () => {
          const result = await window.desktop.state();
          const video = document.getElementById('capture-video');
          return { state: result.value, status: document.getElementById('source-detail').textContent, notice: document.getElementById('notice-text').textContent, video: { ready: video.readyState, width: video.videoWidth, height: video.videoHeight, paused: video.paused } };
        }));
        throw error;
      }
      await until(readState, state => state.frameCount >= 2);
      assert.equal(await main.locator('#frame-preview').evaluate(image => image.naturalWidth > 0), true);
      await main.screenshot({ path: artifact('app-capture.png') });
      await main.click('#capture-button');
      const paused = await readState(); assert.equal(paused.capture, 'paused');
      assert.equal(await main.evaluate(() => document.getElementById('capture-video').srcObject), null);
      assert.equal((await main.evaluate(epoch => window.desktop.frame(epoch), active.epoch - 1)).ok, false);
      report.staleFrame = true;
      await main.click('#capture-button');
      await until(readState, state => state.capture === 'active');
      await app.evaluate(() => { global.__fixtureWindow.destroy(); });
      await until(readState, state => state.capture === 'paused', 20000);
      report.capture = 'Native synthetic window: captured twice, paused, resumed, source closure stopped stream';
    } else report.capture = `Skipped native capture: screen permission ${permission}; no permission change attempted`;
    await main.click('#settings-button');
    if (process.env.GWM_LIVE_DATA === '1') {
      await main.click('#sync-button');
      await until(readState, state => state.catalogCount > 0, 60000);
      await main.fill('#catalog-search', 'Lux');
      await main.locator('.catalog-row').first().click();
      assert.equal((await readState()).selectedEntry.name.includes('Lux'), true);
      assert.match(await overlay.locator('#overlay-title').innerText(), /Lux/);
      report.catalogue = `Live NA dictionary ${ (await readState()).catalogVersion }; searched and pinned`;
    }
    await main.screenshot({ path: artifact('app-settings.png') });
    await main.click('#overlay-tab');
    assert.equal(await main.locator('#overlay-panel').isVisible(), true);
    assert.equal(await main.locator('#data-panel').isVisible(), false);
    await main.screenshot({ path: artifact('app-overlay-settings.png') });
    await main.click('[data-close="settings-dialog"]');
    await main.evaluate(() => window.desktop.selectEntry(null));
    report.ai = await require('./smoke-ai.cjs')({ app, main, overlay, profile, artifact, until });
    if (permission === 'granted') report.live = await require('./smoke-live.cjs')({ app, main, overlay, profile, artifact, until });
    assert.deepEqual(failures, []);
    await fs.writeFile(artifact('smoke-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
    const relative = path.relative(os.tmpdir(), path.resolve(profile));
    assert.ok(relative.startsWith('gwm-smoke-') && !relative.includes(path.sep));
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
