import type { AppState } from '../shared/types.js';
const api = window.desktop;
const el = (id: string) => document.getElementById(id)!;
function render(state: AppState) {
  const entry = state.selectedEntry;
  document.body.classList.toggle('click-through', state.clickThrough);
  el('overlay-dot').classList.toggle('active', state.capture === 'active');
  el('overlay-mode').textContent = state.clickThrough ? '点击穿透' : state.capture === 'active' ? '读取中' : state.capture === 'paused' ? '已暂停' : '待机';
  el('overlay-content').hidden = state.collapsed;
  el('collapse-button').textContent = state.collapsed ? '+' : '−';
  el('collapse-button').setAttribute('aria-expanded', String(!state.collapsed));
  el('collapse-button').setAttribute('aria-label', state.collapsed ? '展开浮窗' : '收起浮窗');
  el('collapse-button').title = state.collapsed ? '展开浮窗' : '收起浮窗';
  el('entry-kind').textContent = entry ? '手动固定 · 名称资料' : '游戏画面';
  el('overlay-title').textContent = entry?.name ?? (state.capturedAt ? '画面已就绪' : '等待画面');
  el('overlay-title').title = entry?.name ?? '';
  el('overlay-description').textContent = entry ? `${entry.kind === 'trait' ? '羁绊' : `${entry.cost ?? '?'} 金币`} · Set 18 · en_US` : state.capturedAt ? '识别与攻略尚未接入，暂不生成建议。' : '在主窗口选择游戏窗口并开始读取。';
  el('overlay-source').textContent = entry ? `Riot Data Dragon · 资源 ${state.catalogVersion}` : '试用版 · 仅本机处理';
  const captured = state.capturedAt ? new Date(state.capturedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
  el('overlay-time').textContent = state.clickThrough ? `${state.platform === 'darwin' ? '⌘' : 'Ctrl'} Shift I 恢复点击` : entry ? '名称字典 · 热修覆盖未确认' : captured ? `最近画面 ${captured}${state.capture !== 'active' ? ' · 已停止更新' : ''}` : '识别与攻略尚未接入';
}
el('collapse-button').addEventListener('click', () => { void api.overlay('collapse'); });
el('hide-button').addEventListener('click', () => { void api.overlay('hide'); });
api.onState(render);
void api.state().then(result => { if (result.ok) render(result.value); });
