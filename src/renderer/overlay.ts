import type { AppState } from '../shared/types.js';
import { entityIcon, recipeIcons, symbol } from './icons.js';
const api = window.desktop;
const el = (id: string) => document.getElementById(id)!;
let latest: AppState | null = null;
let copyFeedback: { id: string; text: string; expiresAt: number } | null = null;
let copying = false;
let visualSignature='';
function render(state: AppState) {
  latest = state;
  let visualKey='', visual: (()=>HTMLElement[])|null=null;
  const entry = state.selectedEntry;
  const observation = state.ai.observation;
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
  el('overlay-description').textContent = entry ? `${entry.kind === 'trait' ? '羁绊' : `${entry.cost ?? '?'} 金币`} · Set 18 · en_US` : state.capturedAt ? '可在主窗口识别这一帧，或选择阵容查看装备合成。' : '在主窗口选择游戏窗口并开始读取。';
  el('overlay-source').textContent = entry ? `Riot Data Dragon · 资源 ${state.catalogVersion}` : '试用版 · 手动识别需确认发送';
  const captured = state.capturedAt ? new Date(state.capturedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
  el('overlay-time').textContent = state.clickThrough ? `${state.platform === 'darwin' ? '⌘' : 'Ctrl'} Shift I 恢复点击` : entry ? '名称字典 · 热修覆盖未确认' : captured ? `最近画面 ${captured}${state.capture !== 'active' ? ' · 已停止更新' : ''}` : '等待画面 · 阵容与装备见主窗口';
  if (observation) {
    el('entry-kind').textContent = observation.corrected ? '画面字段 · 已由你确认' : 'AI 识别 · 待核对';
    el('overlay-title').textContent = `阶段 ${observation.fields.stage ?? '未知'}`;
    el('overlay-title').title = '';
    el('overlay-description').textContent = `金币 ${observation.fields.gold ?? '?'} · 生命 ${observation.fields.hp ?? '?'} · 等级 ${observation.fields.level ?? '?'}。这是一帧的识别结果，不是战术建议。`;
    el('overlay-source').textContent = `${observation.model} · ${(observation.elapsedMs / 1000).toFixed(2)} 秒`;
    if (!state.clickThrough) el('overlay-time').textContent = `画面 ${captured} · 静态结果`;
  }
  const live = state.live; const following = live.phase === 'watching' || live.phase === 'running';
  if (live.phase !== 'off') {
    if (!state.clickThrough) el('overlay-mode').textContent = following ? '跟进中' : '已停止';
    const observed = live.observation; const fields = observed?.fields;
    const age = observed ? Math.max(0, Math.floor((Date.now() - Date.parse(observed.capturedAt)) / 1000)) : null;
    el('entry-kind').textContent = '持续跟进 · AI 字段待核对';
    el('overlay-title').textContent = fields ? `阶段 ${fields.stage ?? '未知'}` : following ? '等待识别' : '跟进已停止';
    el('overlay-title').title = '';
    el('overlay-description').textContent = fields ? `金币 ${fields.gold ?? '?'} · 生命 ${fields.hp ?? '?'} · 等级 ${fields.level ?? '?'}${!following ? ' · 已停止更新' : age! >= 15 ? ' · 结果已过时' : ''}` : live.message;
    el('overlay-source').textContent = !following ? live.message : live.events[0]?.summary ?? '等待阶段、金币、生命和等级变化';
    if (!state.clickThrough) el('overlay-time').textContent = `DeepSeek · ${age === null ? '尚无结果' : `${age} 秒前`} · ¥${(state.budget.chargedMicros / 1e6).toFixed(3)} / 10`;
  }
  const guide = state.guides.entries.find(item => item.id === state.guides.recommendedId);
  el('guide-source').hidden = !guide;
  el('guide-copy').hidden = !guide;
  el('guide-copy').textContent = copyFeedback && copyFeedback.id === guide?.id && Date.now() < copyFeedback.expiresAt ? copyFeedback.text : '复制阵容码';
  (el('guide-copy') as HTMLButtonElement).disabled = copying;
  if (state.guides.enabled) {
    if (guide) {
      el('entry-kind').textContent = state.guides.selectedId ? '阵容目标 · 已固定' : `${state.guides.order === 'win' ? '吃鸡率' : '前四率'}优先 · ${state.guides.entries.length} 套阵容及变体`;
      el('overlay-title').textContent = guide.name; el('overlay-title').title = guide.name;
      const observed = live.phase !== 'off' ? live.observation : observation;
      const age = observed ? Math.max(0, Math.floor((Date.now() - Date.parse(observed.capturedAt)) / 1000)) : null;
      const hud = observed ? `阶段 ${observed.fields.stage ?? '?'} · 金币 ${observed.fields.gold ?? '?'} · ${age}秒前${!following || age! >= 15 ? '（静态）' : ''}` : '终盘参考 · 等待画面识别';
      el('overlay-description').textContent = hud;
      visualKey=JSON.stringify(['core',guide.id,guide.units]);
      visual=()=>guide.core.slice(0,3).map(name=>entityIcon(name,guide.units.find(u=>u.name===name)?.iconUrl,{kind:'champion',detail:'阵容核心'}));
      const equipment = state.equipment;
      const craft = equipment.guideId === guide.id ? equipment.recommendations[0] : null;
      if (craft) {
        const item = equipment.reference.items.find(i => i.id === craft.itemId);
        if (item) {
          el('entry-kind').textContent = equipment.origin === 'ai' ? '装备合成 · AI 清单待核对' : '装备合成 · 手动清单';
          el('overlay-description').textContent = '散件齐全 · 优先合成并给予';
          visualKey=JSON.stringify(['craft',guide.id,craft,item]);
          visual=()=>[recipeIcons(item,equipment.reference,true),symbol('给'),entityIcon(craft.champion??'目标英雄',guide.units.find(u=>u.name===craft.champion)?.iconUrl,{kind:'champion'})];
        }
      }
      el('overlay-source').textContent = `吃鸡 ${guide.winRate}% · 前四 ${guide.top4Rate}% · 同类 ${guide.games.toLocaleString('zh-CN')}局`;
      if (!state.clickThrough) el('overlay-time').textContent = `${guide.patch} · OP.GG全服/全段位 · 热修未隔离`;
    } else {
      el('entry-kind').textContent = '阵容参考待更新'; el('overlay-title').textContent = '暂无有效统计';
      el('overlay-description').textContent = '核查快照过期或版本不符，请在阵容攻略中刷新并核对来源。';
    }
  }
  el('overlay-visual').hidden=!visual;
  if(visualKey!==visualSignature){visualSignature=visualKey;el('overlay-visual').replaceChildren(...(visual?visual():[]));}
}
el('guide-source').addEventListener('click', () => { if (latest?.guides.recommendedId) void api.guideSource(latest.guides.recommendedId); });
el('guide-copy').addEventListener('click', async () => {
  const id = latest?.guides.recommendedId; if (!id || copying) return;
  copying = true; if (latest) render(latest);
  try {
    const result = await api.guideCopy(id);
    copyFeedback = { id, text: result.ok ? '已复制' : '复制失败，重试', expiresAt: Date.now() + 2000 };
  } catch { copyFeedback = { id, text: '复制失败，重试', expiresAt: Date.now() + 2000 }; }
  finally { copying = false; if (latest) render(latest); }
});
el('collapse-button').addEventListener('click', () => { void api.overlay('collapse'); });
api.onState(render);
void api.state().then(result => { if (result.ok) render(result.value); });
setInterval(() => { if (latest) render(latest); }, 1000);
