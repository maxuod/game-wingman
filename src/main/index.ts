import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, session, shell, systemPreferences, Tray } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { downloadCatalog, validateCatalog } from './catalog';
import type { AppState, Catalog, Result } from '../shared/types';

let mainWindow: BrowserWindow;
let overlayWindow: BrowserWindow;
let tray: Tray | null = null;
let quitting = false;
let catalog: Catalog | null = null;
let catalogRequest: Promise<AppState> | null = null;
const page = (file: string) => path.join(__dirname, '../renderer', file);
const state: AppState = {
  platform: process.platform, version: app.getVersion(), source: null, epoch: 0, inputName: null,
  capture: 'idle', capturedAt: null, frameCount: 0, overlayVisible: false, clickThrough: false,
  collapsed: false, opacity: 1, selectedEntry: null, catalogVersion: null, catalogCount: 0, catalogCheckedAt: null,
  shortcuts: { visibility: false, interaction: false }, error: null
};

function broadcast(): AppState {
  for (const window of [mainWindow, overlayWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('gwm:state', state);
  }
  return structuredClone(state);
}
function resetInput() {
  state.epoch++;
  state.capture = 'idle'; state.capturedAt = null; state.frameCount = 0; state.error = null;
}
function makeInteractive() {
  state.clickThrough = false;
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.setIgnoreMouseEvents(false);
}
function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  makeInteractive();
  mainWindow.show(); mainWindow.focus(); broadcast();
}
function showOverlay(show: boolean) {
  if (show) overlayWindow.showInactive(); else overlayWindow.hide();
  state.overlayVisible = show;
  if (!show) makeInteractive();
  return broadcast();
}
function protectWindow(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
}
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 880, height: 650, minWidth: 720, minHeight: 580, title: 'Game Wingman',
    backgroundColor: '#F2F5F4', show: false, autoHideMenuBar: true,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 19 } } : {}),
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false }
  });
  protectWindow(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', event => {
    if (quitting) return;
    if (process.platform === 'darwin' && tray) {
      event.preventDefault(); resetInput(); state.source = null; state.inputName = null;
      showOverlay(false); mainWindow.hide(); broadcast();
    } else { app.quit(); }
  });
  mainWindow.webContents.on('render-process-gone', () => {
    resetInput(); state.source = null; state.inputName = null;
    state.error = '界面意外退出，读取已停止。请重新打开应用。';
    showOverlay(false);
  });
  void mainWindow.loadFile(page('index.html'));
}
function placeOverlay() {
  const { x, y, width } = screen.getPrimaryDisplay().workArea;
  overlayWindow.setBounds({ x: x + width - 344, y: y + 80, width: 320, height: state.collapsed ? 52 : 248 });
}
function createOverlay() {
  overlayWindow = new BrowserWindow({
    width: 320, height: 248, minWidth: 320, maxWidth: 320, frame: false, resizable: false,
    show: false, alwaysOnTop: true, skipTaskbar: true, backgroundColor: '#21333E', hasShadow: true,
    title: 'Game Wingman · 浮窗',
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  protectWindow(overlayWindow); placeOverlay();
  overlayWindow.setAlwaysOnTop(true, 'floating');
  if (process.platform === 'darwin') overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.on('close', event => { if (!quitting) { event.preventDefault(); showOverlay(false); } });
  overlayWindow.webContents.on('render-process-gone', () => showOverlay(false));
  void overlayWindow.loadFile(page('overlay.html'));
}
function allowed(event: IpcMainInvokeEvent, overlayAllowed: boolean) {
  const window = BrowserWindow.fromWebContents(event.sender);
  const isMain = window === mainWindow;
  const isOverlay = window === overlayWindow;
  const expected = pathToFileURL(page(isMain ? 'index.html' : 'overlay.html')).href;
  return (isMain || (overlayAllowed && isOverlay)) && event.senderFrame === event.sender.mainFrame && event.senderFrame?.url === expected;
}
function handle(channel: string, action: (...args: any[]) => unknown | Promise<unknown>, overlayAllowed = false) {
  ipcMain.handle(`gwm:${channel}`, async (event, ...args): Promise<Result<unknown>> => {
    if (!allowed(event, overlayAllowed)) return { ok: false, error: '此窗口无权执行该操作。' };
    try { return { ok: true, value: await action(...args) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : '操作失败，请重试。' }; }
  });
}
function assertEpoch(epoch: unknown) {
  if (epoch !== state.epoch) throw new Error('画面来源已更改，旧任务已停止。');
}
async function sources() {
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') === 'denied') {
    throw new Error('请在系统设置 → 隐私与安全性 → 屏幕与系统音频录制中允许本应用，然后重新打开。也可以导入截图。');
  }
  const windows = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
  return windows.filter(source => !source.name.startsWith('Game Wingman')).map(({ id, name }) => ({ id, name }));
}
function setCatalog(value: Catalog) {
  catalog = value; state.catalogVersion = value.version; state.catalogCount = value.entries.length; state.catalogCheckedAt = value.checkedAt;
  state.selectedEntry = value.entries.find(entry => entry.id === state.selectedEntry?.id) ?? null;
}
function installHandlers() {
  handle('state', () => structuredClone(state), true);
  handle('sources', sources);
  handle('select-source', async (id: unknown) => {
    if (typeof id !== 'string') throw new Error('请选择一个窗口。');
    const selected = (await sources()).find(source => source.id === id);
    if (!selected) throw new Error('所选窗口已关闭，请重新选择。');
    resetInput(); state.source = selected; state.inputName = selected.name;
    return broadcast();
  });
  handle('capture-state', (value: unknown, epoch: unknown, error?: unknown) => {
    assertEpoch(epoch);
    if (!['idle', 'starting', 'active', 'paused'].includes(String(value))) throw new Error('读取状态无效。');
    if ((value === 'starting' || value === 'active') && !state.source) throw new Error('请先选择窗口。');
    state.capture = value as AppState['capture'];
    state.error = typeof error === 'string' ? error.slice(0, 400) : null;
    return broadcast();
  });
  handle('frame', (epoch: unknown) => {
    assertEpoch(epoch);
    if (state.capture !== 'active') throw new Error('读取已停止。');
    state.capturedAt = new Date().toISOString(); state.frameCount++;
    return broadcast();
  });
  handle('import-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '导入游戏截图', properties: ['openFile'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const info = await stat(result.filePaths[0]);
    if (!info.isFile() || info.size > 20_000_000) throw new Error('请选择小于 20 MB 的图片文件。');
    const buffer = await readFile(result.filePaths[0]);
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) throw new Error('无法读取图片，请选择 PNG、JPG 或 WebP。');
    const size = image.getSize();
    const normalized = size.width >= size.height && size.width > 1920 ? image.resize({ width: 1920 }) : size.height > 1920 ? image.resize({ height: 1920 }) : image;
    resetInput(); state.source = null; state.inputName = path.basename(result.filePaths[0]);
    state.capturedAt = new Date().toISOString(); state.frameCount = 1; state.capture = 'paused'; broadcast();
    return { data: normalized.toDataURL(), name: state.inputName };
  });
  handle('overlay', (action: unknown) => {
    switch (action) {
      case 'show': return showOverlay(true);
      case 'hide': return showOverlay(false);
      case 'toggle': return showOverlay(!state.overlayVisible);
      case 'interaction':
        if (!state.shortcuts.interaction || !state.shortcuts.visibility) throw new Error('快捷键被占用，暂不能开启点击穿透。可在主窗口隐藏浮窗。');
        if (!state.overlayVisible) throw new Error('请先显示浮窗。');
        state.clickThrough = !state.clickThrough;
        overlayWindow.setIgnoreMouseEvents(state.clickThrough, { forward: true }); break;
      case 'collapse':
        state.collapsed = !state.collapsed;
        overlayWindow.setSize(320, state.collapsed ? 52 : 248); break;
      case 'reset': makeInteractive(); placeOverlay(); break;
      default: throw new Error('浮窗操作无效。');
    }
    return broadcast();
  }, true);
  handle('opacity', (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.6 || value > 1) throw new Error('透明度超出范围。');
    overlayWindow.setOpacity(value); state.opacity = value; return broadcast();
  });
  handle('sync-catalog', () => {
    if (catalogRequest) return catalogRequest;
    catalogRequest = (async () => {
      const value = await downloadCatalog();
      const cacheDir = app.getPath('userData');
      await mkdir(cacheDir, { recursive: true });
      await writeFile(path.join(cacheDir, 'tft-na-catalog.json'), JSON.stringify(value));
      setCatalog(value); return broadcast();
    })().finally(() => { catalogRequest = null; });
    return catalogRequest;
  });
  handle('search', (query: unknown) => {
    if (typeof query !== 'string' || query.length > 120) throw new Error('搜索内容过长。');
    const term = query.trim().toLowerCase();
    return (catalog?.entries ?? []).filter(entry => entry.name.toLowerCase().includes(term) || entry.id.toLowerCase().includes(term)).slice(0, 30);
  });
  handle('select-entry', (id: unknown) => {
    if (id === null) { state.selectedEntry = null; return broadcast(); }
    const entry = catalog?.entries.find(item => item.id === id);
    if (!entry) throw new Error('资料条目不存在，请重新搜索。');
    state.selectedEntry = entry; return broadcast();
  });
  handle('help', async () => { await dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'Game Wingman · 试用说明', message: '桌面试用版 0.1',
    detail: '选择一个窗口后开始读取，每 3 秒更新一次预览。暂停会释放读取流。浮窗可以拖动、收起、隐藏或点击穿透。\n\n⌘/Ctrl + Shift + O：显示 / 隐藏浮窗\n⌘/Ctrl + Shift + I：切换点击穿透\n菜单栏 / 托盘可随时恢复主窗口。\n\n截图仅留在本机内存；当前没有 OCR、AI 识别、攻略推荐或云端上传。资料面板可主动同步 Riot Data Dragon 的美服 en_US Set 18 名称字典，资源版本不代表 TFT 补丁或热修已覆盖。\n\n本项目未获 Riot 官方认可。实验产品可能存在封号风险，不保证账号安全或攻略准确性。'
  }); });
  handle('settings', async () => {
    if (process.platform === 'darwin') await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    else await dialog.showMessageBox(mainWindow, { message: '窗口无法读取', detail: '请确认游戏窗口仍然打开。部分受保护或独占全屏窗口无法捕获，可以尝试无边框窗口或导入截图。' });
  });
  // Only the main local document, after a specific source was selected, can obtain a video stream.
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    return contents === mainWindow.webContents && permission === 'display-capture' && state.capture === 'starting' &&
      !!state.source && details.isMainFrame === true && details.requestingUrl === pathToFileURL(page('index.html')).href;
  });
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    // Electron also delivers getDisplayMedia as `media` with no camera/microphone mediaTypes.
    // Real camera/microphone requests have nonempty mediaTypes and remain denied.
    const displayMedia = permission === 'display-capture' || (permission === 'media' && 'mediaTypes' in details && Array.isArray(details.mediaTypes) && details.mediaTypes.length === 0);
    callback(contents === mainWindow.webContents && displayMedia && state.capture === 'starting' && !!state.source &&
      details.isMainFrame === true && details.requestingUrl === pathToFileURL(page('index.html')).href);
  });
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const epoch = state.epoch;
    if (request.frame !== mainWindow.webContents.mainFrame || state.capture !== 'starting' || !state.source || request.audioRequested || !request.videoRequested) { callback({}); return; }
    try {
      const available = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
      const source = available.find(item => item.id === state.source?.id);
      if (!source || epoch !== state.epoch || state.capture !== 'starting') { callback({}); return; }
      callback({ video: source });
    } catch { callback({}); }
  });
}
function createTray() {
  // Monochrome locally generated icon, with no borrowed game assets.
  const pixels = Buffer.alloc(18 * 18 * 4);
  for (let y = 3; y < 15; y++) for (let x = 3; x < 15; x++) {
    if (x < 5 || y < 5 || y > 12 || (x > 12 && y > 8) || (y === 9 && x > 8)) pixels[(y * 18 + x) * 4 + 3] = 255;
  }
  const icon = nativeImage.createFromBitmap(pixels, { width: 18, height: 18 });
  icon.setTemplateImage(true);
  tray = new Tray(icon); tray.setToolTip('Game Wingman');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开主窗口', click: showMain },
    { label: '显示 / 隐藏浮窗', click: () => { showOverlay(!state.overlayVisible); } },
    { label: '恢复浮窗操作', click: () => { makeInteractive(); placeOverlay(); showOverlay(true); } },
    { type: 'separator' }, { label: '退出', click: () => app.quit() }
  ]));
  tray.on('double-click', showMain);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (app.isReady()) showMain(); });
  app.whenReady().then(async () => {
    try {
      const cached = JSON.parse(await readFile(path.join(app.getPath('userData'), 'tft-na-catalog.json'), 'utf8')) as unknown;
      if (validateCatalog(cached)) setCatalog(cached);
    } catch { /* Missing or invalid cache is treated as no local catalogue. */ }
    createMainWindow(); createOverlay(); installHandlers(); createTray();
    Menu.setApplicationMenu(Menu.buildFromTemplate(process.platform === 'darwin' ? [
      { label: 'Game Wingman', submenu: [{ label: '打开主窗口', click: showMain }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' }, { role: 'windowMenu' }
    ] : [{ role: 'editMenu' }, { role: 'windowMenu' }]));
    state.shortcuts.visibility = globalShortcut.register('CommandOrControl+Shift+O', () => showOverlay(!state.overlayVisible));
    state.shortcuts.interaction = globalShortcut.register('CommandOrControl+Shift+I', () => {
      if (!state.overlayVisible) return;
      state.clickThrough = !state.clickThrough; overlayWindow.setIgnoreMouseEvents(state.clickThrough, { forward: true }); broadcast();
    });
    screen.on('display-removed', () => { placeOverlay(); makeInteractive(); broadcast(); });
    broadcast();
  }).catch(error => { dialog.showErrorBox('应用启动失败', String(error)); app.quit(); });
  app.on('activate', () => { if (app.isReady()) showMain(); });
  app.on('before-quit', () => { quitting = true; globalShortcut.unregisterAll(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
