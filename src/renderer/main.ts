import { setupEquipment, renderEquipment, renderRecipes } from './equipment.js';
import { compBuild } from './comp-build.js';
import { entityIcon, itemIcon, recipeIcons } from './icons.js';
import type { AppState, Result, AiSettings, AiSettingsInput, CompAugments, Observation } from '../shared/types.js';
const api = window.desktop;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let state: AppState;
let stream: MediaStream | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
let searchGeneration = 0;
let busy = false;
let liveSubmitting = false;
let liveStarting = false;
let autoBusy = false;
let autoEpoch = -1;
let autoFollowAttemptedEpoch = -1;
let guideSignature = '';
let quickSignature = '';
let adviceSignature = '';
let augmentKey = '';
let augmentResult: CompAugments | null = null;
let augmentError = '';
let guidePage = 0;
const GUIDE_PAGE_SIZE = 10;
let settings: AiSettings | null = null;
let lastFields = '';
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
  video.hidden = true;
  preview.hidden = !preview.getAttribute('src');
}
function clearFrame() {
  video.hidden = true;
  preview.removeAttribute('src'); preview.hidden = true;
  el('empty-preview').hidden = false; el('preview-label').hidden = true;
  canvas.width = canvas.height = 0;
}
function showFrame(data: string) {
  preview.src = data;
  const playing = !!stream && state?.capture === 'active';
  preview.hidden = playing; video.hidden = !playing;
  el('empty-preview').hidden = true; el('preview-label').hidden = false;
}
function time(iso: string) { return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function liveActive() { return state.live.phase === 'watching' || state.live.phase === 'running'; }
function renderLive() {
  const live = state.live; const observation = live.observation;
  el('live-result').hidden = live.phase === 'off';
  el('live-stop').hidden = !liveActive();
  const budget = state.budget;
  el<HTMLButtonElement>('live-start').disabled = liveStarting || liveActive() || state.capture !== 'active' || state.ai.status === 'running' || !budget.ready;
  el<HTMLButtonElement>('equipment-start').disabled=el<HTMLButtonElement>('live-start').disabled;
  el('equipment-start').textContent=liveStarting?'正在开启…':liveActive()?'装备自动识别中':'开启装备自动识别';
  const cost = `核算 ¥${(budget.chargedMicros / 1e6).toFixed(4)} / ¥10`;
  el('live-status').textContent = `${live.message} · ${cost}`;
  el('live-feedback').textContent = live.phase === 'off' ? '先开始读取窗口，再开启本次跟进。' : `${live.message} · 已尝试 ${live.requests}/720 次`;
  el('test-budget').textContent = `${budget.message} · ${cost} · 已发送 ${budget.requests} 次${budget.averageMs === null ? '' : ` · 平均响应 ${(budget.averageMs / 1000).toFixed(2)} 秒`}${budget.reservedMicros ? ` · 预算预留 ¥${(budget.reservedMicros / 1e6).toFixed(4)}（非实际扣款）` : ''}`;
  if (observation) {
    const age = Math.max(0, Math.floor((Date.now() - Date.parse(observation.capturedAt)) / 1000));
    const fields = observation.fields;
    el('live-summary').textContent = `阶段 ${fields.stage ?? '?'} · 金币 ${fields.gold ?? '?'} · 生命 ${fields.hp ?? '?'} · 等级 ${fields.level ?? '?'} · ${age} 秒前${age >= 15 ? '（已过时）' : ''}`;
  } else el('live-summary').textContent = liveActive() ? '等待识别游戏画面，未知字段不会自动补全。' : '自动发送已停止。';
  const history = el('live-history');
  history.replaceChildren(...live.events.map(event => {
    const item = document.createElement('li'); item.textContent = `${time(event.capturedAt)} · ${event.summary}`; return item;
  }));
}
function render(next: AppState) {
  if (state && next.epoch !== state.epoch) { stopStream(); clearFrame(); }
  if (next.capture === 'idle' || next.capture === 'paused') { if (stream) stopStream(); }
  const newlyFailed = next.error && next.error !== state?.error;
  state = next;
  document.body.classList.toggle('mac', state.platform === 'darwin');
  el('source-name').textContent = state.inputName ?? '选择一个游戏窗口';
  el('source-name').title = state.inputName ?? '';
  el('source-detail').textContent = state.capture === 'active' ? (liveActive() ? '实时视频跟进中 · 自动识别已开启' : '实时视频预览 · 仅在本机播放') : state.capture === 'starting' ? '正在连接窗口…' : state.capture === 'paused' ? (state.source ? '已暂停 · 画面保留在本机' : '已导入截图 · 画面保留在本机') : state.source ? '窗口已选定，点击开始读取' : '开始前不会读取屏幕';
  if (!state.source && !state.inputName) el('source-detail').textContent = state.autoDetect.enabled ? state.autoDetect.message : '开始前不会读取屏幕';
  el<HTMLInputElement>('auto-game').checked = state.autoDetect.enabled;
  el('auto-game-status').textContent = state.autoDetect.message;
  el('state-dot').classList.toggle('active', state.capture === 'active');
  const capture = el<HTMLButtonElement>('capture-button');
  capture.disabled = !state.source || state.capture === 'starting' || busy;
  capture.textContent = state.capture === 'active' ? '暂停读取' : state.capture === 'starting' ? '连接中…' : state.capture === 'paused' && state.source ? '继续读取' : '开始读取';
  el('overlay-button').textContent = state.overlayVisible ? '隐藏浮窗' : '显示浮窗';
  el('overlay-button').setAttribute('aria-pressed', String(state.overlayVisible));
  el('capture-detail').textContent = state.capturedAt ? `最近画面 ${time(state.capturedAt)} · ${state.capture === 'active' ? '读取中' : state.source ? '已暂停' : '导入截图'} · ${liveActive() ? '已允许持续发送' : state.ai.observation ? '已发送给所选模型' : '本机预览'}` : '画面仅留在本机内存';
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
  el<HTMLButtonElement>('analyze-button').disabled = !state.capturedAt || state.ai.status === 'running';
  el('ai-result').hidden = state.ai.status === 'idle';
  el('ai-status').textContent = state.ai.message;
  el('ai-cancel').hidden = state.ai.status !== 'running';
  el('ai-review').hidden = !state.ai.observation;
  for (const id of ['ai-save', 'ai-probe', 'ai-import', 'ai-remove']) el<HTMLButtonElement>(id).disabled = state.ai.status === 'running';
  const observation = state.ai.observation;
  el('ai-fields').hidden = !observation;
  el('ai-summary').textContent = observation ? `阶段 ${observation.fields.stage ?? '未知'} · 金币 ${observation.fields.gold ?? '?'} · 生命 ${observation.fields.hp ?? '?'} · 等级 ${observation.fields.level ?? '?'} · ${(observation.elapsedMs / 1000).toFixed(2)} 秒 · ${observation.corrected ? '已确认' : '待确认'}` : '';
  const signature = observation ? JSON.stringify(observation.fields) + observation.completedAt : '';
  if (observation && signature !== lastFields) {
    for (const name of ['stage', 'gold', 'hp', 'level'] as const) el<HTMLInputElement>(`field-${name}`).value = String(observation.fields[name] ?? '');
    el<HTMLInputElement>('field-entities').value = observation.fields.entities.join(', ');
    el('ai-entity-matches').textContent = observation.entities.map(item => `${item.name}：${item.id ?? '未匹配字典'}`).join('；');
  }
  lastFields = signature;
  renderLive();
  renderGuides();
  renderEquipment(state);
  renderQuickGuides();
  renderAdvice();
  // IPC replies and state broadcasts may arrive in either order. Start from the
  // rendered state so finding a window cannot leave it selected but never previewed.
  if (state.autoDetect.status === 'found') queueMicrotask(startDiscoveredCapture);
}
function renderGuides() {
  const guides=state.guides;
  el<HTMLInputElement>('guide-enabled').checked=guides.enabled;
  el<HTMLSelectElement>('guide-order').value=guides.order;
  el<HTMLButtonElement>('guide-refresh').disabled=guides.loading;
  el('guide-scope').textContent=guides.scope+'。含同名棋盘变体，比例与样本均为同类阵容统计，不是本局胜率。';
  el('guide-feedback').textContent=guides.message;
  const updates=state.dataUpdates, official=updates.official;
  el('guide-update-status').textContent=`官方 ${official?official.patch+(official.hotfix??''):'待核对'} · ${updates.officialCheckedAt?'检查 '+new Date(updates.officialCheckedAt).toLocaleString('zh-CN'):'尚未在线检查'}\n排名${updates.rankingCheckedAt?'检查 '+new Date(updates.rankingCheckedAt).toLocaleString('zh-CN'):'等待更新'} · 每天首次启动检查，同日有效缓存复用`;
  el('guide-change-summary').textContent=updates.comparedAt?`变化对比：${new Date(updates.comparedAt).toLocaleString('zh-CN')} 的快照；新增 ${updates.added} 套、移出 ${updates.removed} 套。箭头按当前排序显示，胜率差为百分点。`:'当前补丁尚无历史排名对比。';
  const query=el<HTMLInputElement>('guide-search').value.trim().toLowerCase();
  const signature=JSON.stringify([guides,query,guidePage,state.equipment.reference.checkedAt,updates.changes]);
  if(signature===guideSignature)return;guideSignature=signature;
  const names=new Map(state.equipment.reference.items.map(i=>[i.id,i.name]));
  const entries=[...guides.entries].sort((a,b)=>(guides.order==='win'?b.winRate-a.winRate:b.top4Rate-a.top4Rate)||a.averagePlace-b.averagePlace||b.games-a.games)
    .filter(g=>!query||[g.name,...g.core,...g.flex,...g.units.flatMap(u=>u.items.flatMap(i=>[i.name,names.get(i.id)??'']))].join(' ').toLowerCase().includes(query));
  guidePage=Math.min(guidePage,Math.max(0,Math.ceil(entries.length/GUIDE_PAGE_SIZE)-1));
  el('guide-count').textContent=`全部 ${guides.entries.length} 套 · 匹配 ${entries.length} · 第 ${guidePage+1}/${Math.max(1,Math.ceil(entries.length/GUIDE_PAGE_SIZE))} 页`;
  el<HTMLButtonElement>('guide-prev').disabled=guidePage===0;
  el<HTMLButtonElement>('guide-next').disabled=(guidePage+1)*GUIDE_PAGE_SIZE>=entries.length;
  const page=entries.slice(guidePage*GUIDE_PAGE_SIZE,(guidePage+1)*GUIDE_PAGE_SIZE);
  el('guide-results').replaceChildren(...page.map(guide=>{
    const article=document.createElement('article');article.className='guide-card';article.dataset.guideId=guide.id;
    const title=document.createElement('h3');title.textContent=guide.name;
    const stats=document.createElement('p');stats.className='guide-stats';stats.textContent=`前四 ${guide.top4Rate}% · 吃鸡 ${guide.winRate}% · 均名 ${guide.averagePlace} · ${guide.games.toLocaleString('zh-CN')} 局`;
    const change=updates.changes.find(c=>c.id===guide.id);
    if(change){const movement=guides.order==='win'?change.win:change.top4;const rate=guides.order==='win'?change.winRate:change.top4Rate;
      const delta=document.createElement('span');delta.className='rank-change';delta.textContent=movement===null?' · 新增阵容':` · ${movement>0?'↑'+movement:movement<0?'↓'+Math.abs(movement):'名次持平'}${rate?' / '+(rate>0?'+':'')+rate+' 个百分点':''}`;stats.append(delta);}
    const portraits=document.createElement('div');portraits.className='guide-portraits';for(const unit of guide.units)portraits.append(entityIcon(unit.name,unit.iconUrl,{kind:'champion',detail:unit.priority?'核心 '+unit.priority:'参考棋子'}));
    const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`${guide.units.length} 位棋子 · 配装 / 站位 / 海克斯`;details.append(summary);
    const plan=document.createElement('p');plan.textContent=guide.plan;details.append(plan);
    for(const unit of guide.units){if(!unit.items.length)continue;const row=document.createElement('p');row.className='unit-items';row.append(entityIcon(unit.name,unit.iconUrl,{kind:'champion'}));for(const item of unit.items){const button=document.createElement('button');button.className='text-button item-link';button.title=`${names.get(item.id)??item.name} · 查看合成配方`;button.setAttribute('aria-label',button.title);button.append(itemIcon(item.id,state.equipment.reference,{focus:false}));button.addEventListener('click',()=>{selectTab('equipment');el<HTMLInputElement>('item-search').value=names.get(item.id)??item.name;el<HTMLSelectElement>('item-category').value='all';renderRecipes();});row.append(button);}details.append(row);}
    const build=compBuild(guide,state.equipment.reference,state.dataUpdates.recipesPending);build.querySelector('.target-items')?.remove();details.append(build);
    const stamp=document.createElement('p');stamp.className='fine';stamp.textContent=`OP.GG · ${guide.patch} · 更新约 ${new Date(guide.updatedAt).toLocaleString('zh-CN')}${guides.freshIds.includes(guide.id)?'':' · 过期或样本不足，不参与推荐'}`;
    const actions=document.createElement('div');actions.className='guide-actions';
    const pin=document.createElement('button');pin.textContent=guide.id===guides.selectedId?'已选阵容':guide.id===guides.recommendedId?'当前推荐 · 选择':'选择阵容';pin.disabled=!guides.freshIds.includes(guide.id);pin.addEventListener('click',()=>run(async()=>{unwrap(await api.guideSettings({enabled:true,order:state.guides.order,selectedId:guide.id}));unwrap(await api.overlay('show'));}));
    const copy=document.createElement('button');copy.className='guide-copy';copy.textContent='复制阵容码';copy.dataset.copyGuideId=guide.id;copy.setAttribute('aria-live','polite');copy.addEventListener('click',()=>run(async()=>{copy.disabled=true;copy.textContent='复制中…';try{unwrap(await api.guideCopy(guide.id));copy.textContent='已复制';}catch(error){copy.textContent='复制阵容码';throw error;}finally{copy.disabled=false;setTimeout(()=>{if(copy.isConnected)copy.textContent='复制阵容码';},2000);}}));
    const source=document.createElement('button');source.className='text-button';source.textContent='来源';source.addEventListener('click',()=>run(async()=>unwrap(await api.guideSource(guide.id))));
    actions.append(pin,copy,source);article.append(title,portraits,stats,details,stamp,actions);return article;
  }));
  if(!page.length){const empty=document.createElement('p');empty.textContent='没有匹配的阵容，请换个关键词。';el('guide-results').append(empty);}
}
function renderQuickGuides() {
  const guides=state.guides;
  const top=guides.freshIds.slice(0,4).map(id=>guides.entries.find(guide=>guide.id===id)).filter((guide):guide is NonNullable<typeof guide>=>!!guide);
  const signature=JSON.stringify([top.map(g=>[g.id,g.name,g.top4Rate,g.winRate,g.core,g.units.map(u=>u.iconUrl)]),guides.selectedId,guides.patch]);
  el('quick-status').textContent=top.length?`${guides.scope} · 点击一套阵容后跟随它给出装备与海克斯参考。`:guides.loading?'正在核对当前补丁的阵容排名…':'当前补丁没有可用的近期统计，请在“阵容攻略”中刷新。';
  if(signature===quickSignature)return;quickSignature=signature;
  el('quick-list').replaceChildren(...top.map((guide,index)=>{
    const button=document.createElement('button');button.className='quick-card'+(guides.selectedId===guide.id?' selected':'');button.dataset.guideId=guide.id;
    button.title=`${guide.name} · 前四 ${guide.top4Rate}% · 吃鸡 ${guide.winRate}%`;
    button.setAttribute('aria-label',`选择第 ${index+1} 名 ${guide.name}，前四率 ${guide.top4Rate}%`);
    const title=document.createElement('strong');title.textContent=`${index+1}. ${guide.name.split('/')[0].trim()}`;
    const icons=document.createElement('span');icons.className='quick-card-icons';
    for(const name of guide.core.slice(0,3))icons.append(entityIcon(name,guide.units.find(u=>u.name===name)?.iconUrl,{kind:'champion',focus:false}));
    const rate=document.createElement('small');rate.textContent=`前四 ${guide.top4Rate}% · 吃鸡 ${guide.winRate}%`;
    button.append(title,icons,rate);
    button.addEventListener('click',()=>run(async()=>{unwrap(await api.guideSettings({enabled:true,order:'top4',selectedId:guide.id}));unwrap(await api.overlay('show'));}));
    return button;
  }));
}
function renderAdvice() {
  const selected=state.guides.selectedId;
  const key=selected&&liveActive()?`${state.guides.patch}:${selected}`:'';
  if(key!==augmentKey){
    augmentKey=key;augmentResult=null;augmentError='';
    if(selected&&key){
      void api.guideAugments(selected).then(result=>{
        if(augmentKey!==key)return;
        if(result.ok)augmentResult=result.value;else augmentError=result.error;
        adviceSignature='';renderAdvice();
      }).catch(()=>{if(augmentKey===key){augmentError='海克斯来源暂不可用';adviceSignature='';renderAdvice();}});
    }
  }
  const observation=liveActive()?state.live.observation:state.ai.observation;
  const age=observation?Date.now()-Date.parse(observation.capturedAt):Infinity;
  const fields=age<15000?observation?.fields:null;
  const guide=state.guides.entries.find(g=>g.id===selected);
  const craft=guide&&state.equipment.guideId===guide.id?state.equipment.recommendations[0]:null;
  const signature=JSON.stringify([selected,fields,craft,state.equipment.origin,augmentResult,augmentError,state.capture,state.live.phase,autoFollowAttemptedEpoch,settings?.enabled,settings?.providers.find(p=>p.provider==='deepseek')?.hasKey]);
  if(signature===adviceSignature)return;adviceSignature=signature;
  const aiReady=!!settings?.enabled&&!!settings.providers.find(p=>p.provider==='deepseek')?.hasKey;
  const stage=el('advice-stage');
  stage.textContent=fields?`本局 ${fields.stage??'阶段未知'} · ${fields.gold??'?'} 金币 · ${fields.hp??'?'} 生命 · ${fields.level??'?'} 级。${selected?'正在跟随所选阵容。':'选一套阵容，开始显示针对它的装备建议。'}`:
    state.capture==='active'&&!liveActive()?(aiReady&&autoFollowAttemptedEpoch===state.epoch?'本次 AI 跟进未开启，可在“AI 识别”中重新开启。':'已读取本机画面；在“AI 识别”配置 DeepSeek 并允许请求后，可开启持续跟进。'):
    '等待 TFT 游戏画面；阵容排名可以先查看和选择。';
  const craftArea=el('advice-craft');craftArea.replaceChildren();
  if(selected){
    craftArea.append(document.createTextNode(craft?'装备：现在可优先合成 ':'装备：等待读清己方散件；目标配装可在“装备合成”查看。'));
    if(craft){const item=state.equipment.reference.items.find(i=>i.id===craft.itemId);if(item)craftArea.append(recipeIcons(item,state.equipment.reference,true));if(craft.champion)craftArea.append(document.createTextNode(` 给 ${craft.champion}`));}
  }else craftArea.textContent='装备：选择阵容后按目标配装计算。';
  const augmentArea=el('advice-augment');augmentArea.replaceChildren();
  if(!selected)augmentArea.textContent='海克斯：选择阵容后读取该阵容的来源候选。';
  else if(augmentError)augmentArea.textContent=`海克斯：${augmentError}。可打开阵容详情查看来源。`;
  else if(!liveActive())augmentArea.textContent='海克斯：开始本局跟进后自动读取所选阵容的来源候选，也可在阵容详情手动展开。';
  else if(!augmentResult)augmentArea.textContent='海克斯：正在读取所选阵容的来源候选…';
  else {
    const options=fields?.stage?augmentResult.entries.filter(a=>a.rounds.includes(fields.stage!)).slice(0,3):[];
    augmentArea.append(document.createTextNode(options.length?`海克斯：${fields!.stage} 来源候选（按来源顺序，核对本局选项）`:'海克斯：2-1 / 3-2 / 4-2 显示该阶段来源候选；本局选项仍需核对。'));
    for(const augment of options)augmentArea.append(entityIcon(augment.name,augment.iconUrl,{kind:'augment',focus:false}));
  }
}
async function discoverGame() {
  if (!state || autoBusy || busy || stream || !state.autoDetect.enabled || state.source || state.inputName || state.capture !== 'idle') return;
  autoBusy = true;
  try {
    unwrap(await api.detectGame());
  } finally { autoBusy = false; }
}
function startDiscoveredCapture() {
  if (!state || busy || stream || !state.autoDetect.enabled || state.autoDetect.status !== 'found' || !state.source ||
    state.capture !== 'idle' || state.epoch === autoEpoch) return;
  autoEpoch = state.epoch;
  run(async()=>{
    await startCapture();
    await maybeAutoFollow();
  });
}
async function maybeAutoFollow() {
  if(!state||state.capture!=='active'||!state.autoDetect.enabled||state.autoDetect.status!=='found'||
    autoFollowAttemptedEpoch===state.epoch||liveActive()||liveStarting||!state.budget.ready||
    !settings?.enabled||!settings.providers.find(p=>p.provider==='deepseek')?.hasKey)return;
  autoFollowAttemptedEpoch=state.epoch;renderAdvice();
  await startTracking();
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
  const sampled = unwrap(await api.frame(epoch));
  if (current !== generation) return;
  showFrame(data);
  if ((sampled.live.phase === 'watching' || sampled.live.phase === 'running') && !liveSubmitting) {
    liveSubmitting = true;
    void api.liveFrame({ data, epoch, capturedAt: sampled.capturedAt!, frameCount: sampled.frameCount })
      .then(unwrap).catch(notify).finally(() => { liveSubmitting = false; });
  }
  timer = setTimeout(() => { run(() => sample(current, epoch)); }, 1000);
}
async function startCapture() {
  if (state.capture === 'active') { await pause(); return; }
  stopStream();
  const current = generation;
  const epoch = state.epoch;
  busy = true; el('notice').hidden = true;
  try {
    unwrap(await api.captureState('starting', epoch));
    const next = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
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
const settingsTabs = ['guide', 'equipment', 'data', 'overlay', 'ai'];
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
      const next = event.key === 'Home' ? settingsTabs[0] : event.key === 'End' ? settingsTabs[settingsTabs.length - 1] : settingsTabs[(settingsTabs.indexOf(name) + (event.key === 'ArrowRight' ? 1 : settingsTabs.length - 1)) % settingsTabs.length];
      selectTab(next); el(`${next}-tab`).focus();
    }
  });
}
function renderProvider() {
  const item = settings?.providers.find(item => item.provider === el<HTMLSelectElement>('ai-provider').value);
  if (!item) return;
  el<HTMLInputElement>('ai-model').value = item.model;
  el<HTMLSelectElement>('ai-region').value = item.region;
  el('ai-region-row').hidden = item.provider !== 'minimax';
  el('ai-endpoint').textContent = `已保存服务地址：${item.endpoint}`;
  el('ai-credentials').textContent = !settings?.secureStorage ? '系统安全存储不可用' : item.hasKey ? '密钥已保存在系统加密存储中' : '尚未配置密钥';
}
function renderSettings(value: AiSettings) {
  settings = value;
  el<HTMLSelectElement>('ai-provider').value = value.selected;
  el<HTMLInputElement>('ai-enabled').checked = value.enabled;
  renderProvider();
  renderKeyStatus();
  if(state){renderAdvice();queueMicrotask(()=>run(maybeAutoFollow));}
}
function renderKeyStatus(){
  const item=settings?.providers.find(p=>p.provider===el<HTMLSelectElement>('ai-key-provider').value);
  el('ai-key-status').textContent=!settings?.secureStorage?'系统安全存储不可用，暂不能保存':`${item?.label??''}：${item?.hasKey?'已加密保存，密钥有效性需连接测试确认':'尚未配置'}`;
  el<HTMLButtonElement>('ai-key-save').disabled=!settings?.secureStorage;
  el<HTMLButtonElement>('ai-remove').disabled=!item?.hasKey;
}
function clearKeyInput(){el<HTMLInputElement>('ai-key').value='';}
function keyWork(work:()=>Promise<void>){
  el('ai-key-feedback').textContent='';
  void work().catch(error=>{el('ai-key-feedback').textContent=error instanceof Error?error.message:'密钥操作失败';});
}
function settingsInput(): AiSettingsInput {
  return { provider: el<HTMLSelectElement>('ai-provider').value as AiSettingsInput['provider'], model: el<HTMLInputElement>('ai-model').value,
    region: el<HTMLSelectElement>('ai-region').value as AiSettingsInput['region'], enabled: el<HTMLInputElement>('ai-enabled').checked };
}
function aiWork(work: () => Promise<void>) {
  el('ai-feedback').textContent = '';
  void work().catch(error => { el('ai-feedback').textContent = error instanceof Error ? error.message : '操作失败'; });
}
el('ai-provider').addEventListener('change', renderProvider);
el('ai-save').addEventListener('click', () => aiWork(async () => { renderSettings(unwrap(await api.aiSave(settingsInput()))); el('ai-feedback').textContent = '设置已保存'; }));
el('ai-key-provider').addEventListener('change',()=>{clearKeyInput();el('ai-key-feedback').textContent='';renderKeyStatus();});
el('settings-dialog').addEventListener('close',clearKeyInput);
el('ai-key-save').addEventListener('click',()=>keyWork(async()=>{
  const input=el<HTMLInputElement>('ai-key'),key=input.value;clearKeyInput();
  const button=el<HTMLButtonElement>('ai-key-save');button.disabled=true;
  try{renderSettings(unwrap(await api.aiSetKey({provider:el<HTMLSelectElement>('ai-key-provider').value as AiSettingsInput['provider'],key})));el('ai-key-feedback').textContent='密钥已加密保存；未发送测试请求。';}
  finally{renderKeyStatus();}
}));
el('ai-import').addEventListener('click', () => keyWork(async () => { clearKeyInput();renderSettings(unwrap(await api.aiImport()));el('ai-key-feedback').textContent='当前已配置：'+(settings?.providers.filter(p=>p.hasKey).map(p=>p.label).join('、')||'无')+'。导入只保存密钥，不会启用请求。'; }));
el('ai-template').addEventListener('click',()=>keyWork(async()=>{el('ai-key-feedback').textContent=unwrap(await api.aiTemplate())?'空白模板已保存，填写所需平台的 Key 后点击“导入密钥文件”。':'已取消保存模板。';}));
el('ai-remove').addEventListener('click', () => keyWork(async () => {clearKeyInput();renderSettings(unwrap(await api.aiRemove(el<HTMLSelectElement>('ai-key-provider').value as AiSettingsInput['provider'])));el('ai-key-feedback').textContent='所选平台密钥已移除。'; }));
el('ai-probe').addEventListener('click', () => aiWork(async () => {
  renderSettings(unwrap(await api.aiSave(settingsInput())));
  const result = unwrap(await api.aiProbe());
  el('ai-feedback').textContent = `${result.model} · 固定文本通过 · ${(result.elapsedMs / 1000).toFixed(2)} 秒`;
}));
el('analyze-button').addEventListener('click', () => run(async () => {
  if (!settings?.enabled || !settings.providers.find(item => item.provider === settings?.selected)?.hasKey) {
    el<HTMLDialogElement>('settings-dialog').showModal(); selectTab('ai'); el('ai-feedback').textContent = '请先配置模型并启用手动请求。'; return;
  }
  if (state.capture === 'active') await pause();
  if (!state.capturedAt || !preview.src) throw new Error('请先导入截图或读取一帧。');
  unwrap(await api.aiAnalyze({ data: preview.src, epoch: state.epoch, capturedAt: state.capturedAt, frameCount: state.frameCount }));
}));
el('ai-cancel').addEventListener('click', () => run(async () => { unwrap(await api.aiCancel()); }));
async function startTracking(){
  if(!settings?.enabled||!settings.providers.find(p=>p.provider===settings?.selected)?.hasKey){selectTab('ai');el('ai-feedback').textContent='请先配置 DeepSeek 并启用 AI 请求，再开启跟进。';return;}
  liveStarting = true; renderLive();
  try { const result=unwrap(await api.liveStart());if(['watching','running'].includes(result.live.phase)&&result.equipment.manual)unwrap(await api.equipmentInventory(null)); }
  finally { liveStarting = false; renderLive(); }
}
el('live-start').addEventListener('click', () => run(startTracking));
el('live-stop').addEventListener('click', () => run(async () => { unwrap(await api.liveStop()); }));
el('live-details').addEventListener('click', () => { el<HTMLDialogElement>('settings-dialog').showModal(); selectTab('ai'); });
el('ai-review').addEventListener('click', () => { el<HTMLDialogElement>('settings-dialog').showModal(); selectTab('ai'); });
el('ai-confirm').addEventListener('click', () => aiWork(async () => {
  const number = (id: string) => el<HTMLInputElement>(id).value.trim() ? Number(el<HTMLInputElement>(id).value) : null;
  const fields: Observation = { stage: el<HTMLInputElement>('field-stage').value.trim() || null, gold: number('field-gold'), hp: number('field-hp'), level: number('field-level'),
    entities: el<HTMLInputElement>('field-entities').value.split(/[,，]/).map(name => name.trim()).filter(Boolean) };
  if (state.ai.observation?.fields.equipment) fields.equipment = state.ai.observation.fields.equipment;
  unwrap(await api.aiCorrect(fields)); el('ai-feedback').textContent = '字段已确认';
}));
el('auto-game').addEventListener('change', () => run(async () => { unwrap(await api.autoDetect(el<HTMLInputElement>('auto-game').checked)); await discoverGame(); }));
setupEquipment(startTracking);
el('guide-search').addEventListener('input',()=>{guidePage=0;guideSignature='';renderGuides();});
el('guide-prev').addEventListener('click',()=>{guidePage--;renderGuides();});
el('guide-next').addEventListener('click',()=>{guidePage++;renderGuides();});
el('guide-enabled').addEventListener('change', () => run(async () => unwrap(await api.guideSettings({ enabled: el<HTMLInputElement>('guide-enabled').checked, order: state.guides.order, selectedId: state.guides.selectedId }))));
el('guide-order').addEventListener('change', () => run(async () => unwrap(await api.guideSettings({ enabled: true, order: el<HTMLSelectElement>('guide-order').value as 'win' | 'top4', selectedId: null }))));
el('guide-auto').addEventListener('click', () => run(async () => unwrap(await api.guideSettings({ enabled: true, order: state.guides.order, selectedId: null }))));
el('guide-refresh').addEventListener('click', () => run(async () => unwrap(await api.guideRefresh())));
el('official-source').addEventListener('click', () => run(async () => unwrap(await api.officialSource())));
el('guide-shortcut').addEventListener('click', () => { el<HTMLDialogElement>('settings-dialog').showModal(); selectTab('guide'); });
el('quick-all').addEventListener('click', () => { el<HTMLDialogElement>('settings-dialog').showModal(); selectTab('guide'); });
window.addEventListener('beforeunload', stopStream);
api.onState(render);
setInterval(() => { if (state) renderLive(); }, 1000);
setInterval(() => run(discoverGame), 5000);
run(async () => { render(unwrap(await api.state())); renderSettings(unwrap(await api.aiSettings())); await discoverGame(); });
