import type { AppState, Result } from '../shared/types.js';
const api = window.desktop;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let state: AppState;
let stream: MediaStream | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
let searchGeneration = 0;
let busy = false;
const video = el<HTMLVideoElement>('capture-video');
const preview = el<HTMLImageElement>('frame-preview');
const canvas = document.createElement('canvas');

function unwrap<T>(result: Result<T>): T { if (!result.ok) throw new Error(result.error); return result.value; }
function notify(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  el('notice-text').textContent = text;
  el('notice').hidden = false;
  el('permission-button').hidden = !/权限|屏幕|授权|denied|Permission/i.test(text);
}
function run(work: () => Promise<unknown>) { void work().catch(notify); }
function stopStream() {
  generation++;
  if (timer) { clearTimeout(timer); timer = null; }
  if (stream) { for (const track of stream.getTracks()) { track.onended = null; track.onmute = null; track.stop(); } stream = null; }
  video.srcObject = null;
}
function clearFrame() {
  preview.removeAttribute('src'); preview.hidden = true;
  el('empty-preview').hidden = false; el('preview-label').hidden = true;
  canvas.width = canvas.height = 0;
}
function showFrame(data: string) {
  preview.src = data; preview.hidden = false;
  el('empty-preview').hidden = true; el('preview-label').hidden = false;
}
function time(iso: string) { return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function render(next: AppState) {
  if (state && next.epoch !== state.epoch) { stopStream(); clearFrame(); }
  if (next.capture === 'idle' || next.capture === 'paused') { if (stream) stopStream(); }
  const newlyFailed = next.error && next.error !== state?.error;
  state = next;
  document.body.classList.toggle('mac', state.platform === 'darwin');
  el('source-name').textContent = state.inputName ?? '选择一个游戏窗口';
  el('source-name').title = state.inputName ?? '';
  el('source-detail').textContent = state.capture === 'active' ? '读取中 · 每 3 秒更新一次' : state.capture === 'starting' ? '正在连接窗口…' : state.capture === 'paused' ? (state.source ? '已暂停 · 画面保留在本机' : '已导入截图 · 画面保留在本机') : state.source ? '窗口已选定，点击开始读取' : '开始前不会读取屏幕';
  el('state-dot').classList.toggle('active', state.capture === 'active');
  const capture = el<HTMLButtonElement>('capture-button');
  capture.disabled = !state.source || state.capture === 'starting' || busy;
  capture.textContent = state.capture === 'active' ? '暂停读取' : state.capture === 'starting' ? '连接中…' : state.capture === 'paused' && state.source ? '继续读取' : '开始读取';
  el('overlay-button').textContent = state.overlayVisible ? '隐藏浮窗' : '显示浮窗';
  el('overlay-button').setAttribute('aria-pressed', String(state.overlayVisible));
  el('capture-detail').textContent = state.capturedAt ? `最近画面 ${time(state.capturedAt)} · ${state.capture === 'active' ? '读取中' : state.source ? '已暂停' : '导入截图'} · 仅本机` : '画面仅留在本机内存';
  el('preview-label').textContent = state.capture === 'active' ? '读取中' : state.source ? '已暂停' : '导入截图';
  el('catalog-status').textContent = state.catalogVersion ? `Riot Data Dragon · 资源 ${state.catalogVersion} · ${state.catalogCount} 条` : '尚未同步 · Riot Data Dragon / en_US';
  if (state.catalogCheckedAt && !el('sync-feedback').textContent) el('sync-feedback').textContent = `缓存更新于 ${new Date(state.catalogCheckedAt).toLocaleString('zh-CN')}`;
  el<HTMLInputElement>('catalog-search').disabled = !state.catalogCount;
  el('pinned-entry').hidden = !state.selectedEntry;
  el('pinned-name').textContent = state.selectedEntry ? `浮窗已固定：${state.selectedEntry.name}` : '';
  el<HTMLInputElement>('opacity').value = String(Math.round(state.opacity * 100));
  el('opacity-value').textContent = `${Math.round(state.opacity * 100)}%`;
  el<HTMLButtonElement>('interaction-button').disabled = !state.overlayVisible || !state.shortcuts.interaction || !state.shortcuts.visibility;
  el('interaction-button').textContent = state.clickThrough ? '关闭' : '开启';
  const modifier = state.platform === 'darwin' ? '⌘' : 'Ctrl';
  el('shortcut-help').textContent = state.shortcuts.visibility && state.shortcuts.interaction ? `${modifier} Shift O 显示 / 隐藏；${modifier} Shift I 切换穿透。主窗口与菜单栏也可恢复操作。` : '部分快捷键被占用，点击穿透已禁用。可在主窗口或菜单栏恢复浮窗。';
  if (newlyFailed) notify(state.error);
}
async function pause(reason?: string) {
  stopStream(); unwrap(await api.captureState('paused', state.epoch, reason));
}
async function sample(current: number, epoch: number) {
  if (current !== generation || !stream || state.capture !== 'active') return;
  if (!video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await pause('暂时读不到窗口画面，请确认窗口已打开后重新读取。'); return;
  }
  const scale = Math.min(1, 1600 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) { await pause('无法创建画面预览。'); return; }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL('image/jpeg', .82);
  unwrap(await api.frame(epoch));
  if (current !== generation) return;
  showFrame(data);
  timer = setTimeout(() => { run(() => sample(current, epoch)); }, 3000);
}
async function startCapture() {
  if (state.capture === 'active') { await pause(); return; }
  stopStream();
  const current = generation;
  const epoch = state.epoch;
  busy = true; el('notice').hidden = true;
  try {
    unwrap(await api.captureState('starting', epoch));
    const next = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 1, max: 2 } }, audio: false });
    if (current !== generation || epoch !== state.epoch) { next.getTracks().forEach(track => track.stop()); return; }
    stream = next; video.srcObject = next;
    const track = next.getVideoTracks()[0];
    track.onended = () => run(() => pause('窗口已关闭或读取权限已撤回，请重新选择窗口。'));
    track.onmute = () => run(() => pause('窗口画面暂不可用，读取已暂停。'));
    await video.play();
    if (current !== generation) return;
    unwrap(await api.captureState('active', epoch));
    await sample(current, epoch);
  } catch (error) {
    if (current === generation) {
      stopStream();
      const detail = error instanceof Error ? error.message : '';
      unwrap(await api.captureState('paused', epoch, `无法读取窗口。请检查屏幕录制权限，或导入截图。${detail ? `（${detail}）` : ''}`));
    }
  } finally { busy = false; render(state); }
}
async function loadSources() {
  const list = el('source-list'); list.replaceChildren();
  const loading = document.createElement('p'); loading.textContent = '正在获取窗口…'; list.append(loading);
  const result = await api.sources(); list.replaceChildren();
  if (!result.ok) { const message = document.createElement('p'); message.textContent = result.error; list.append(message); return; }
  if (!result.value.length) { const message = document.createElement('p'); message.textContent = '没有可读取的窗口。请先打开游戏，也可以取消后导入截图。'; list.append(message); }
  for (const source of result.value) {
    const button = document.createElement('button'); button.textContent = source.name;
    button.addEventListener('click', () => run(async () => {
      button.disabled = true;
      try { unwrap(await api.selectSource(source.id)); el<HTMLDialogElement>('source-dialog').close(); el('notice').hidden = true; }
      finally { button.disabled = false; }
    })); list.append(button);
  }
}
async function searchCatalog() {
  const current = ++searchGeneration;
  const result = unwrap(await api.search(el<HTMLInputElement>('catalog-search').value));
  if (current !== searchGeneration) return;
  const list = el('catalog-results'); list.replaceChildren();
  if (!state.catalogCount) return;
  if (!result.length) { const empty = document.createElement('p'); empty.textContent = '没有匹配的英文名称。'; list.append(empty); }
  for (const entry of result) {
    const button = document.createElement('button'); button.className = 'catalog-row';
    button.setAttribute('aria-pressed', String(state.selectedEntry?.id === entry.id));
    button.title = '固定到浮窗';
    const name = document.createElement('span'); name.textContent = entry.name;
    const meta = document.createElement('span'); meta.textContent = entry.kind === 'trait' ? '羁绊' : `${entry.cost ?? '?'} 金币`;
    button.append(name, meta);
    button.addEventListener('click', () => run(async () => { unwrap(await api.selectEntry(entry.id)); unwrap(await api.overlay('show')); await searchCatalog(); }));
    list.append(button);
  }
}

el('choose-source').addEventListener('click', () => { el<HTMLDialogElement>('source-dialog').showModal(); run(loadSources); });
el('refresh-sources').addEventListener('click', () => run(loadSources));
el('capture-button').addEventListener('click', () => run(startCapture));
el('overlay-button').addEventListener('click', () => run(async () => unwrap(await api.overlay('toggle'))));
el('settings-button').addEventListener('click', () => { el<HTMLDialogElement>('settings-dialog').showModal(); run(searchCatalog); });
el('help-button').addEventListener('click', () => run(async () => unwrap(await api.help())));
el('permission-button').addEventListener('click', () => run(async () => unwrap(await api.settings())));
el('dismiss-notice').addEventListener('click', () => { el('notice').hidden = true; });
el('import-button').addEventListener('click', () => run(async () => {
  if (state.capture === 'active' || state.capture === 'starting') await pause();
  const input = unwrap(await api.importImage());
  if (input) { showFrame(input.data); el('notice').hidden = true; }
}));
el('sync-button').addEventListener('click', () => run(async () => {
  const button = el<HTMLButtonElement>('sync-button'); button.disabled = true; button.textContent = '同步中…';
  el('sync-feedback').textContent = '';
  try {
    unwrap(await api.syncCatalog());
    el('sync-feedback').textContent = `已同步 en_US 名称字典 · ${state.catalogCheckedAt ? new Date(state.catalogCheckedAt).toLocaleString('zh-CN') : ''}`;
    await searchCatalog();
  } catch (error) { el('sync-feedback').textContent = error instanceof Error ? error.message : '同步失败，请重试。'; }
  finally { button.disabled = false; button.textContent = '同步资料'; }
}));
el('catalog-search').addEventListener('input', () => run(searchCatalog));
el('clear-entry').addEventListener('click', () => run(async () => { unwrap(await api.selectEntry(null)); await searchCatalog(); }));
el('interaction-button').addEventListener('click', () => run(async () => unwrap(await api.overlay('interaction'))));
el('reset-overlay').addEventListener('click', () => run(async () => { unwrap(await api.overlay('reset')); unwrap(await api.overlay('show')); }));
el<HTMLInputElement>('opacity').addEventListener('input', event => run(async () => unwrap(await api.opacity(Number((event.target as HTMLInputElement).value) / 100))));
document.querySelectorAll<HTMLElement>('[data-close]').forEach(button => button.addEventListener('click', () => el<HTMLDialogElement>(button.dataset.close!).close()));
const settingsTabs = ['data', 'overlay'];
function selectTab(name: string) {
  for (const id of settingsTabs) {
    const selected = id === name;
    el(`${id}-tab`).setAttribute('aria-selected', String(selected));
    el(`${id}-tab`).tabIndex = selected ? 0 : -1;
    el(`${id}-panel`).hidden = !selected;
  }
}
for (const name of settingsTabs) {
  el(`${name}-tab`).addEventListener('click', () => selectTab(name));
  el(`${name}-tab`).addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 'data' : event.key === 'End' ? 'overlay' : name === 'data' ? 'overlay' : 'data';
      selectTab(next); el(`${next}-tab`).focus();
    }
  });
}
window.addEventListener('beforeunload', stopStream);
api.onState(render);
run(async () => { render(unwrap(await api.state())); });
