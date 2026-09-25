import { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, safeStorage, screen, session, shell, systemPreferences, Tray } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EMPTY_KEY_TEMPLATE, parseKeyFile } from './ai/key-file';
import { downloadCatalog, validateCatalog } from './catalog';
import { AiSettingsStore } from './ai/settings';
import { PROVIDERS, providerEndpoint } from './ai/providers';
import { BaselineBudget, emptyBudget } from './ai/budget';
import { mapEntities, OBSERVATION_PROMPT, parseObservation, validateObservation } from './ai/observation';
import { emptyLiveState, LiveTracker } from './ai/live';
import { findGameCandidates } from './game-window';
import { initialGuides, rankGuides, GUIDE_URL, REVIEWED_GUIDES } from './guides';
import { PublicDataUpdater, initialDataUpdates } from './data-updates';
import { ITEMS_URL, OFFICIAL_UPDATES_URL, validTeamCode } from './public-data';
import { initialEquipment, updateEquipment, validateInventory } from './equipment';
import { CompAugmentService } from './comp-augments';
import { IconCache } from './icon-cache';
import type { AppState, Catalog, Result, AiSettingsInput, AiProvider, CapturedFrame } from '../shared/types';

// Development and packaged builds share encrypted credentials; smoke profiles remain isolated.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), 'Game Wingman'));
let aiStore: AiSettingsStore;
let budget: BaselineBudget;
let aiRequest: AbortController | null = null;
let liveConsentVersion = 0;
let liveConsentPending = false;

let mainWindow: BrowserWindow;
let overlayWindow: BrowserWindow;
let tray: Tray | null = null;
let quitting = false;
let catalog: Catalog | null = null;
let catalogRequest: Promise<AppState> | null = null;
let detectingGame = false;
let guideRequest: Promise<AppState> | null = null;
let compAugments: CompAugmentService;
let iconCache: IconCache;
let dataUpdater: PublicDataUpdater;
const page = (file: string) => path.join(__dirname, '../renderer', file);
const asset = (file: string) => path.join(app.getAppPath(), 'assets', file);
const state: AppState = {
  platform: process.platform, version: app.getVersion(), source: null, epoch: 0, inputName: null,
  capture: 'idle', capturedAt: null, frameCount: 0, overlayVisible: false, clickThrough: false,
  collapsed: false, opacity: 1, selectedEntry: null, catalogVersion: null, catalogCount: 0, catalogCheckedAt: null,
  shortcuts: { visibility: false, interaction: false }, error: null,
  ai: { status: 'idle', message: '', observation: null }, live: emptyLiveState(), budget: emptyBudget(), guides: initialGuides(), equipment: initialEquipment(), dataUpdates: initialDataUpdates(),
  autoDetect: { enabled: !app.commandLine.hasSwitch('disable-auto-detect'), status: 'waiting', message: '正在自动查找游戏窗口…' }
};
const liveTracker = new LiveTracker(value => { state.live = value; broadcast(); });
function stopLive(reason = '本次跟进已停止', clear = false) {
  liveConsentVersion++;
  if (clear) liveTracker.reset(); else liveTracker.stop(reason);
}

function broadcast(): AppState {
  const ranked = rankGuides(state.guides.entries, state.guides.order, Date.now(), state.guides.patch);
  state.guides.freshIds = ranked.map(guide => guide.id);
  state.guides.recommendedId = state.guides.enabled ? (ranked.find(guide => guide.id === state.guides.selectedId) ?? ranked[0])?.id ?? null : null;
  updateEquipment(state);
  for (const window of [mainWindow, overlayWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('gwm:state', state);
  }
  return structuredClone(state);
}
function applyPublicData(): void {
  state.guides.entries = dataUpdater.entries(); state.guides.patch = dataUpdater.patch();
  // Older public caches predate icon metadata; same-set unit IDs keep their source portraits.
  for(const guide of state.guides.entries)for(const unit of guide.units)if(!unit.iconUrl)unit.iconUrl=REVIEWED_GUIDES.find(g=>g.patch.split('.')[0]===guide.patch.split('.')[0]&&g.units.some(u=>u.id===unit.id))?.units.find(u=>u.id===unit.id)?.iconUrl;
  state.guides.sourceKind = dataUpdater.sourceKind; state.dataUpdates = dataUpdater.view();
  const dataPatch = state.guides.entries[0]?.patch ?? state.guides.patch;
  state.guides.scope = `OP.GG · 全服 · 全段位 · 近24小时 · 统计 ${dataPatch} · 热修未单独隔离`;
  state.guides.message = state.dataUpdates.message;
  if (!state.guides.entries.some(g=>g.id===state.guides.selectedId)) state.guides.selectedId = null;
}
function refreshPublicData(force = false): Promise<AppState> {
  if (guideRequest) return guideRequest;
  if (!force && !dataUpdater.isDue()) return Promise.resolve(structuredClone(state));
  state.guides.loading = true; state.guides.message = '正在核对官方补丁与阵容排名…'; broadcast();
  guideRequest = (async () => {
    try { await dataUpdater.check(force); applyPublicData(); }
    finally { state.guides.loading = false; }
    return broadcast();
  })().finally(()=>{guideRequest=null;});return guideRequest;
}
function resetInput() {
  state.equipment.manual = null; state.equipment.updatedAt = null;
  stopLive('', true);
  cancelAi();
  state.epoch++;
  state.capture = 'idle'; state.capturedAt = null; state.frameCount = 0; state.error = null;
}
function cancelAi() {
  aiRequest?.abort(); aiRequest = null;
  state.ai = { status: 'idle', message: '', observation: null };
}
function beginAi(message: string) {
  if (aiRequest) throw new Error('已有 AI 请求进行中，请等待或取消。');
  const controller = new AbortController(); aiRequest = controller;
  state.ai = { status: 'running', message, observation: null }; broadcast();
  return controller;
}
function failAi(controller: AbortController, error: unknown) {
  if (aiRequest !== controller) return;
  state.ai = { status: 'error', message: error instanceof Error ? error.message : 'AI 请求失败。', observation: null };
}
function finishAi(controller: AbortController) { if (aiRequest === controller) { aiRequest = null; broadcast(); } }

function installAiHandlers() {
  handle('ai-settings', () => aiStore.status());
  handle('ai-save', async (input: AiSettingsInput) => {
    if (input?.provider !== 'deepseek' || input.model !== 'deepseek-flash') throw new Error('本次 ¥10 基准测试固定使用 DeepSeek / deepseek-flash。');
    stopLive('模型设置已修改，跟进已停止'); cancelAi(); const result = await aiStore.save(input); broadcast(); return result;
  });
  handle('ai-remove', async (provider: AiProvider) => { stopLive('凭据已修改，跟进已停止'); cancelAi(); const result = await aiStore.removeKey(provider); broadcast(); return result; });
  handle('ai-set-key', async (input:{provider:unknown;key:unknown}) => {
    if(!input||typeof input!=='object')throw new Error('密钥设置无效。');
    stopLive('凭据已修改，跟进已停止');cancelAi();
    try{const result=await aiStore.setKey(input.provider,input.key);broadcast();return result;}
    catch{throw new Error('保存失败，请检查平台、密钥格式和系统安全存储。');}
  });
  handle('ai-template', async()=>{
    const selected=await dialog.showSaveDialog(mainWindow,{title:'保存空白 API Key 模板',defaultPath:path.join(app.getPath('downloads'),'api-keys.json'),filters:[{name:'JSON 配置',extensions:['json']}]});
    if(selected.canceled||!selected.filePath)return false;
    try{await writeFile(selected.filePath,EMPTY_KEY_TEMPLATE,{mode:0o600});return true;}
    catch{throw new Error('模板保存失败，请选择可写入的位置。');}
  });
  handle('ai-import', async () => {
    stopLive('正在导入凭据，跟进已停止');
    const selected = await dialog.showOpenDialog(mainWindow, { title: '从本机配置文件导入 API Key', properties: ['openFile'], filters: [{ name: '环境配置 / JSON', extensions: ['env', 'json'] }, { name: '所有文件', extensions: ['*'] }] });
    if (selected.canceled || !selected.filePaths[0]) return aiStore.status();
    const filename = selected.filePaths[0];
    try {
      const info = await stat(filename); if (!info.isFile() || info.size > 20000) throw new Error();
      const keys=parseKeyFile(await readFile(filename,'utf8'),path.extname(filename).toLowerCase()==='.json');
      cancelAi(); const result = await aiStore.importKeys(keys); broadcast(); return result;
    } catch { throw new Error('导入失败。请检查文件格式、API Key 字段和系统安全存储；文件内容不会显示或上传。'); }
  });
  handle('ai-cancel', () => { cancelAi(); return broadcast(); });
  handle('ai-probe', async () => {
    stopLive('已切换到手动连接测试', true);
    const config = aiStore.config(); const controller = beginAi('正在测试文本连接…');
    const started = performance.now();
    try {
      const result = await budget.generate(config, { prompt: 'Reply with exactly OK.', maxOutputTokens: 1024, signal: controller.signal });
      if (aiRequest !== controller) throw new Error('请求已取消。');
      if (result.text !== 'OK') throw new Error('API 已返回，但未通过固定文本校验。');
      const elapsedMs = Math.round(performance.now() - started);
      state.ai = { status: 'done', message: `${PROVIDERS[config.provider].label} 连接成功 · ${(elapsedMs / 1000).toFixed(2)} 秒`, observation: null };
      return { elapsedMs, provider: config.provider, model: config.model };
    } catch (error) { failAi(controller, error); throw error; }
    finally { finishAi(controller); }
  });
  handle('ai-analyze', async (input: { data: string; epoch: number; frameCount: number; capturedAt: string }) => {
    stopLive('已切换到手动单帧识别', true);
    if (!input || typeof input.data !== 'string' || input.data.length > 8_000_000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(input.data)) throw new Error('截图格式或大小无效。');
    assertEpoch(input.epoch);
    if (!state.capturedAt || input.capturedAt !== state.capturedAt || input.frameCount !== state.frameCount || state.capture !== 'paused') throw new Error('请先暂停并确认当前画面。');
    const config = aiStore.config();
    if (!config.enabled) throw new Error('请先在 AI 设置中启用手动请求。');
    const normalized = nativeImage.createFromDataURL(input.data);
    if (normalized.isEmpty()) throw new Error('截图无法解码。');
    const size = normalized.getSize();
    if (size.width > 4096 || size.height > 4096) throw new Error('截图分辨率过大。');
    const image = size.width > 1600 ? normalized.resize({ width: 1600 }) : normalized;
    const controller = beginAi('等待确认发送当前画面…');
    try {
      const consent = await dialog.showMessageBox(mainWindow, { type: 'question', title: '发送这一帧进行识别',
        message: `将预览中的这一帧发送给 ${PROVIDERS[config.provider].label}？`,
        detail: `模型：${config.model}\n服务地址：${providerEndpoint(config)}\n画面时间：${new Date(input.capturedAt).toLocaleString()}\n\n只发送这一张截图，可能包含游戏昵称或聊天信息，并可能产生费用。请先检查预览。识别可见字段及己方装备；程序会根据装备清单和所选阵容计算合成参考，合成前需要核对。`,
        buttons: ['取消', '发送这一帧'], defaultId: 0, cancelId: 0 });
      if (aiRequest !== controller || consent.response !== 1) { if (aiRequest === controller) cancelAi(); return broadcast(); }
      state.ai.message = '正在识别这一帧…'; broadcast(); const started = performance.now();
      const result = await budget.generate(config, { system: OBSERVATION_PROMPT, prompt: 'Extract visible HUD fields and current-player equipment from this screenshot. Return unknown fields as null.',
        image: { mimeType: 'image/jpeg', data: image.toJPEG(85).toString('base64') }, maxOutputTokens: 1024, signal: controller.signal });
      if (aiRequest !== controller || state.epoch !== input.epoch || state.frameCount !== input.frameCount) return broadcast();
      const fields = parseObservation(result.text);
      state.ai = { status: 'done', message: '识别完成 · 请核对或修正字段', observation: { fields, entities: mapEntities(fields, catalog?.entries ?? []),
        provider: config.provider, model: config.model, capturedAt: input.capturedAt, completedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - started), epoch: input.epoch, frameCount: input.frameCount, corrected: false } };
      return broadcast();
    } catch (error) { failAi(controller, error); throw error; }
    finally { finishAi(controller); }
  });
  handle('ai-correct', (input: unknown) => {
    const observation = state.ai.observation;
    if (!observation || observation.epoch !== state.epoch || observation.frameCount !== state.frameCount) throw new Error('识别画面已更改，请重新识别。');
    const fields = validateObservation(input);
    state.ai.observation = { ...observation, fields, entities: mapEntities(fields, catalog?.entries ?? []), corrected: true };
    state.ai.message = '字段已由你确认 · 装备清单请在装备合成面板核对'; return broadcast();
  });
}
function installLiveHandlers() {
  handle('live-start', async () => {
    if (liveConsentPending || liveTracker.active) throw new Error('跟进已开启或正在等待确认。');
    if (aiRequest) throw new Error('请先完成或取消当前手动请求。');
    if (state.capture !== 'active' || !state.source || !state.capturedAt) throw new Error('请先选择游戏窗口并开始读取。');
    const config = aiStore.config();
    if (!config.enabled) throw new Error('请先在 AI 设置中允许请求并保存。');
    if (config.provider !== 'deepseek' || config.model !== 'deepseek-flash') throw new Error('本次测试固定使用 DeepSeek / deepseek-flash。');
    budget.ensureAvailable();
    const epoch = state.epoch; const sourceId = state.source.id; const version = ++liveConsentVersion;
    liveConsentPending = true;
    try {
      const consent = await dialog.showMessageBox(mainWindow, { type: 'question', title: '开始本次持续跟进',
        message: `允许持续发送「${state.source.name}」的画面给 ${PROVIDERS[config.provider].label}？`,
        detail: `模型：${config.model}\n服务地址：${providerEndpoint(config)}\n\n本次测试总预算 ¥10，按高峰无缓存价格保守核算，跨暂停、重启累计。发送前预留最坏费用，余额不足即停止；超时或用量未知保留预留额。最多持续 60 分钟 / 720 次，覆盖约 30 分钟的一局。\n\n画面变化时最短每 5 秒识别一次；变化较小时每 15 秒复查。截图可能包含昵称或聊天内容。暂停读取、切换窗口或点击“停止跟进”会停止后续发送。结果只是可见字段识别，仍需核对。`,
        buttons: ['取消', '开始本次跟进'], defaultId: 0, cancelId: 0 });
      if (consent.response !== 1 || version !== liveConsentVersion || epoch !== state.epoch || sourceId !== state.source?.id || state.capture !== 'active' || aiRequest) return broadcast();
      cancelAi();
      liveTracker.start(config.provider, config.model, async (frame, signal) => {
        const started = performance.now();
        const result = await budget.generate({ ...config, timeoutMs: Math.min(config.timeoutMs, 10000) }, {
          system: OBSERVATION_PROMPT, prompt: 'Extract visible TFT HUD fields and current-player equipment from this screenshot. Unknown fields must be null.',
          image: { mimeType: 'image/jpeg', data: frame.data }, maxOutputTokens: 1024, signal
        });
        const fields = parseObservation(result.text);
        return { fields, entities: mapEntities(fields, catalog?.entries ?? []), provider: config.provider, model: config.model,
          capturedAt: frame.capturedAt, completedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started),
          epoch: frame.epoch, frameCount: frame.frameCount, corrected: false };
      });
      return broadcast();
    } finally { liveConsentPending = false; }
  });
  handle('live-stop', () => { stopLive(); return broadcast(); });
  handle('live-frame', async (input: CapturedFrame) => {
    if (!liveTracker.active) return structuredClone(state);
    if (!input || typeof input.data !== 'string' || input.data.length > 8_000_000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(input.data)) throw new Error('跟进截图格式无效。');
    assertEpoch(input.epoch);
    if (state.capture !== 'active' || !state.source || input.frameCount !== state.frameCount || input.capturedAt !== state.capturedAt || Date.now() - Date.parse(input.capturedAt) > 2500) return structuredClone(state);
    await liveTracker.offer(input, () => {
      const image = nativeImage.createFromDataURL(input.data); const size = image.getSize();
      if (image.isEmpty() || size.width > 4096 || size.height > 4096) throw new Error('跟进截图无法解码或分辨率过大。');
      const normalized = size.width > 1600 ? image.resize({ width: 1600 }) : image;
      return { data: normalized.toJPEG(85).toString('base64'), fingerprint: normalized.resize({ width: 32, height: 18 }).toBitmap() };
    });
    return structuredClone(state);
  });
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
  if (show) { raiseOverlay(); overlayWindow.showInactive(); overlayWindow.moveTop(); } else overlayWindow.hide();
  state.overlayVisible = show;
  if (!show) makeInteractive();
  return broadcast();
}
function raiseOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.setAlwaysOnTop(true, process.platform === 'win32' ? 'screen-saver' : 'floating');
  if (overlayWindow.isVisible()) overlayWindow.moveTop();
}
function keepOverlayPinned() {
  if (!state.overlayVisible || !overlayWindow || overlayWindow.isDestroyed()) return;
  if (!overlayWindow.isVisible()) overlayWindow.showInactive();
  if (!overlayWindow.isAlwaysOnTop()) overlayWindow.setAlwaysOnTop(true, process.platform === 'win32' ? 'screen-saver' : 'floating');
  overlayWindow.moveTop();
}
function protectWindow(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
}
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 880, height: 720, minWidth: 720, minHeight: 580, title: 'Game Wingman',
    backgroundColor: '#F2F5F4', show: false, autoHideMenuBar: true, icon: asset('icon.png'),
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 19 } } : {}),
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false }
  });
  protectWindow(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow.showInactive());
  mainWindow.on('blur', () => { if (state.overlayVisible) raiseOverlay(); });
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
function resizeOverlay() {
  // Windows clamps setSize to the current height when resizable is false.
  // Unlock only during the synchronous resize, then restore the fixed-size overlay.
  if (process.platform === 'win32') overlayWindow.setResizable(true);
  try { overlayWindow.setSize(320, state.collapsed ? 52 : 248); }
  finally { if (process.platform === 'win32') overlayWindow.setResizable(false); }
}
function placeOverlay() {
  const { x, y, width } = screen.getPrimaryDisplay().workArea;
  resizeOverlay();
  overlayWindow.setPosition(x + width - 344, y + 80);
}
function createOverlay() {
  overlayWindow = new BrowserWindow({
    width: 320, height: 248, minWidth: 320, maxWidth: 320, frame: false, resizable: false,
    show: false, alwaysOnTop: true, focusable: false, skipTaskbar: true, backgroundColor: '#21333E', hasShadow: true,
    title: 'Game Wingman · 浮窗', icon: asset('icon.png'),
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  protectWindow(overlayWindow); placeOverlay();
  raiseOverlay();
  overlayWindow.once('ready-to-show', () => showOverlay(true));
  if (process.platform === 'darwin') overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.on('close', event => { if (!quitting) { event.preventDefault(); keepOverlayPinned(); } });
  overlayWindow.on('show', keepOverlayPinned);
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
  installAiHandlers();
  installLiveHandlers();
  handle('state', () => structuredClone(state), true);
  handle('auto-detect', (enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('自动查找设置无效。');
    state.autoDetect = { enabled, status: enabled ? 'waiting' : 'manual', message: enabled ? '等待游戏窗口；暂停的读取不会自动恢复。' : '已切换为手动选择窗口' };
    return broadcast();
  });
  handle('detect-game', async () => {
    if (!state.autoDetect.enabled || detectingGame || state.source || state.inputName || state.capture !== 'idle') return structuredClone(state);
    detectingGame = true; const epoch = state.epoch;
    try {
      const candidates = await findGameCandidates(await sources());
      if (!state.autoDetect.enabled || state.epoch !== epoch || state.source || state.inputName || state.capture !== 'idle') return structuredClone(state);
      if (candidates.length === 1) {
        resetInput(); state.source = candidates[0]; state.inputName = candidates[0].name;
        state.autoDetect.status = 'found'; state.autoDetect.message = '已自动找到游戏窗口 · 本机预览';
      } else {
        state.autoDetect.status = candidates.length > 1 ? 'ambiguous' : 'waiting';
        state.autoDetect.message = candidates.length > 1 ? '找到多个游戏窗口，请手动选择。' : '等待游戏窗口出现，也可手动选择。';
      }
      return broadcast();
    } catch { state.autoDetect.message = '暂时无法自动确认游戏窗口，可以手动选择。'; return broadcast(); }
    finally { detectingGame = false; }
  });
  handle('guide-settings', (input: { enabled: boolean; order: 'win' | 'top4'; selectedId: string | null }) => {
    if (!input || typeof input.enabled !== 'boolean' || !['win', 'top4'].includes(input.order) ||
      (input.selectedId !== null && !state.guides.entries.some(guide => guide.id === input.selectedId))) throw new Error('阵容设置无效。');
    state.guides.enabled = input.enabled; state.guides.order = input.order; state.guides.selectedId = input.selectedId; return broadcast();
  });
  handle('guide-refresh', () => refreshPublicData(true));
  handle('load-icon', (url:unknown)=>iconCache.get(url), true);
  handle('guide-augments', async (id:unknown) => {
    const guide=state.guides.entries.find(g=>g.id===id);
    if(!guide||guide.patch!==state.guides.patch)throw new Error('此阵容与官方补丁不一致，等待资料更新。');
    return compAugments.get(guide);
  });
  handle('official-source', async () => { await shell.openExternal(state.dataUpdates.official?.url ?? OFFICIAL_UPDATES_URL); }, true);
  handle('guide-source', async (id: unknown) => {
    const guide = state.guides.entries.find(item => item.id === id); if (!guide) throw new Error('阵容来源无效。');
    await shell.openExternal(GUIDE_URL);
  }, true);
  handle('guide-copy', (id: unknown) => {
    // Only a reviewed code selected by ID; renderer cannot write arbitrary text or read the clipboard.
    const guide = state.guides.entries.find(item => item.id === id);
    if (!guide || !validTeamCode(guide.teamCode, guide.patch)) throw new Error('该阵容暂无可用阵容码。');
    try { clipboard.writeText(guide.teamCode); }
    catch { throw new Error('复制失败，请重试。'); }
  }, true);
  handle('equipment-inventory', (input: unknown) => {
    state.equipment.manual = input === null ? null : validateInventory(input, state.equipment.reference.items);
    state.equipment.updatedAt = input === null ? null : new Date().toISOString();
    return broadcast();
  });
  handle('equipment-source', async () => { await shell.openExternal(ITEMS_URL); }, true);
  handle('sources', sources);
  handle('select-source', async (id: unknown) => {
    if (typeof id !== 'string') throw new Error('请选择一个窗口。');
    const selected = (await sources()).find(source => source.id === id);
    if (!selected) throw new Error('所选窗口已关闭，请重新选择。');
    state.autoDetect = { enabled: false, status: 'manual', message: '正在使用手动选择的窗口' };
    resetInput(); state.source = selected; state.inputName = selected.name;
    return broadcast();
  });
  handle('capture-state', (value: unknown, epoch: unknown, error?: unknown) => {
    assertEpoch(epoch);
    if (!['idle', 'starting', 'active', 'paused'].includes(String(value))) throw new Error('读取状态无效。');
    if ((value === 'starting' || value === 'active') && !state.source) throw new Error('请先选择窗口。');
    if (value !== 'active') stopLive('读取已暂停，跟进已停止');
    if (value === 'starting') cancelAi();
    state.capture = value as AppState['capture'];
    if (value === 'active') showOverlay(true);
    if (value === 'paused' && state.autoDetect.status === 'found') { state.autoDetect.status = 'paused'; state.autoDetect.message = '读取已暂停，不会自动恢复。'; }
    state.error = typeof error === 'string' ? error.slice(0, 400) : null;
    return broadcast();
  });
  handle('frame', (epoch: unknown) => {
    assertEpoch(epoch);
    if (state.capture !== 'active') throw new Error('读取已停止。');
    cancelAi(); state.capturedAt = new Date().toISOString(); state.frameCount++;
    liveTracker.touchFrame();
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
    state.autoDetect = { enabled: false, status: 'manual', message: '正在使用导入截图' };
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
        resizeOverlay(); break;
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
    detail: '选择一个窗口后开始读取实时本机视频。暂停会释放读取流。浮窗可以拖动、收起、隐藏或点击穿透。\n\n⌘/Ctrl + Shift + O：显示 / 隐藏浮窗\n⌘/Ctrl + Shift + I：切换点击穿透\n菜单栏 / 托盘可随时恢复主窗口。\n\n在资料与设置 → AI 识别中配置模型。点击“识别这一帧”会暂停读取，并在确认后仅向所选提供方发送这一张截图，可能产生费用。结果需人工核对；可另行确认开启持续跟进，每 5–15 秒识别一次；本次固定 DeepSeek，总预算 ¥10，跨重启累计。暂停或换窗即停止。没有自动重试、跨提供方回退或战术建议。密钥仅在主进程通过系统加密存储使用。\n\n资料面板可主动同步 Riot Data Dragon 的美服 en_US Set 18 名称字典，资源版本不代表 TFT 补丁或热修已覆盖。\n\n本项目未获 Riot 官方认可。实验产品可能存在封号风险，不保证账号安全或识别准确性。'
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
  // macOS templates adapt to the menu bar; the Windows ICO keeps its own contrast.
  const icon = nativeImage.createFromPath(asset(process.platform === 'darwin' ? 'trayTemplate.png' : 'icon.ico'));
  if (process.platform === 'darwin') icon.setTemplateImage(true);
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
    aiStore = new AiSettingsStore(path.join(app.getPath('userData'), 'ai-settings.json'), safeStorage);
    let settingsLoaded = false;
    try { await aiStore.load(); settingsLoaded = true; } catch { state.ai = { status: 'error', message: 'AI 配置无法读取，请重新导入凭据。', observation: null }; }
    // This preview is explicitly scoped to the user's first DeepSeek test.
    // Preserve every stored key and the existing opt-in switch.
    if (settingsLoaded) await aiStore.save({ provider: 'deepseek', model: 'deepseek-flash', region: 'global', enabled: aiStore.status().enabled });
    compAugments = new CompAugmentService(path.join(app.getPath('userData'), 'tft-augment-cache'));
    iconCache = new IconCache(path.join(app.getPath('userData'), 'tft-icon-cache'));
    budget = new BaselineBudget(path.join(app.getPath('userData'), 'deepseek-baseline-budget.jsonl'), value => { state.budget = value; broadcast(); });
    try { budget.load(); } catch { /* Fail closed; the budget state explains why requests are locked. */ }
    try {
      const cached = JSON.parse(await readFile(path.join(app.getPath('userData'), 'tft-na-catalog.json'), 'utf8')) as unknown;
      if (validateCatalog(cached)) setCatalog(cached);
    } catch { /* Missing or invalid cache is treated as no local catalogue. */ }
    dataUpdater = new PublicDataUpdater(path.join(app.getPath('userData'), 'tft-public-data-v1.json'));
    await dataUpdater.load(); applyPublicData();
    createMainWindow(); createOverlay(); installHandlers(); createTray();
    setInterval(() => {
      liveTracker.tick();
      if (state.equipment.origin === 'ai' && state.equipment.updatedAt && Date.now() - Date.parse(state.equipment.updatedAt) >= 15000) broadcast();
      if (state.guides.recommendedId && !rankGuides(state.guides.entries, state.guides.order, Date.now(), state.guides.patch).some(guide => guide.id === state.guides.recommendedId)) broadcast();
    }, 1000).unref();
    setInterval(keepOverlayPinned, 500).unref();
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
    if (!app.commandLine.hasSwitch('disable-public-updates')) {
      void refreshPublicData();
      setInterval(() => { void refreshPublicData(); }, 60000).unref();
    }
  }).catch(error => { dialog.showErrorBox('应用启动失败', String(error)); app.quit(); });
  app.on('activate', () => { if (app.isReady()) showMain(); });
  app.on('before-quit', () => { quitting = true; stopLive(); cancelAi(); globalShortcut.unregisterAll(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
