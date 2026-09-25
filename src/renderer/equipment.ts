import type { AppState, EquipmentInventory, CraftSuggestion } from '../shared/types.js';
import { compBuild } from './comp-build.js';
import { entityIcon, itemIcon, recipeIcons, symbol } from './icons.js';
const api=window.desktop;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
let state:AppState;
let referenceSignature='', manualSignature='', recommendationSignature='', targetSignature='', buildSignature='', observedSignature='';
let completed:Record<string,number>={};
const itemName=(id:string)=>state.equipment.reference.items.find(i=>i.id===id)?.name??id;
function feedback(error:unknown){el('equipment-status').textContent=error instanceof Error?error.message:String(error);}
function run(work:()=>Promise<unknown>){void work().catch(feedback);}
function unwrap<T>(r:{ok:true;value:T}|{ok:false;error:string}):T{if(!r.ok)throw new Error(r.error);return r.value;}
function chips(){el('completed-items').replaceChildren(...Object.entries(completed).map(([id,count])=>{const b=document.createElement('button');b.className='text-button inventory-chip';b.title=`${itemName(id)} ×${count} · 减少一件`;b.setAttribute('aria-label',b.title);b.append(itemIcon(id,state.equipment.reference,{count,focus:false}),symbol('−'));b.addEventListener('click',()=>{if(--completed[id]<=0)delete completed[id];chips()});return b}));}
function setEditor(input:EquipmentInventory|null){for(const node of document.querySelectorAll<HTMLInputElement>('[data-component-id]'))node.value=String(input?.components[node.dataset.componentId!]??0);completed={...input?.completed};chips();}
function suggestion(s:CraftSuggestion){
  const li=document.createElement('li'),row=document.createElement('div');row.className='craft-icons';
  const reference=state.equipment.reference,item=reference.items.find(i=>i.id===s.itemId);
  row.append(item?recipeIcons(item,reference):itemIcon(s.itemId,reference));
  if(s.champion){const unit=state.guides.entries.find(g=>g.id===state.equipment.guideId)?.units.find(u=>u.name===s.champion);row.append(symbol('给'),entityIcon(s.champion,unit?.iconUrl,{kind:'champion'}));}
  const p=document.createElement('p');p.className='craft-status';
  if(s.missing.length){p.append('还缺 ',...s.missing.map(id=>itemIcon(id,reference,{small:true})));}else p.textContent=s.reserved?'与优先方案共用散件':'散件齐全';
  const reason=document.createElement('p');reason.textContent=s.reason;li.append(row,p,reason);return li;
}
function renderObserved(){
  const eq=state.equipment,signature=JSON.stringify([eq.inventory,eq.origin,eq.updatedAt]);if(signature===observedSignature)return;observedSignature=signature;
  const area=el('equipment-observed');area.replaceChildren();if(!eq.inventory)return;
  const heading=document.createElement('p');heading.className='fine';heading.textContent=`${eq.origin==='ai'?'AI 识别':'手动清单'}${eq.updatedAt?' · '+new Date(eq.updatedAt).toLocaleTimeString('zh-CN'):''}`;area.append(heading);
  for(const [label,counts] of [['散件',eq.inventory.components],['已有成装',eq.inventory.completed]] as const){const row=document.createElement('div');row.className='inventory-row';const title=document.createElement('span');title.textContent=label;row.append(title);const entries=Object.entries(counts).filter(([,n])=>n>0);row.append(...(entries.length?entries.map(([id,count])=>itemIcon(id,eq.reference,{count})):['无']));area.append(row);}
}
export function renderRecipes(){if(!state)return;const q=el<HTMLInputElement>('item-search').value.trim().toLowerCase(),category=el<HTMLSelectElement>('item-category').value;const items=state.equipment.reference.items.filter(i=>(category==='all'||category==='recipes'&&i.recipe.length===2||category===i.category)&&(!q||[i.name,i.englishName,i.id,...i.recipe.map(itemName)].join(' ').toLowerCase().includes(q)));el('item-count').textContent=`显示 ${items.length} 项 · ${state.equipment.reference.items.length} 件装备 / 55 种配方`;el('item-recipes').replaceChildren(...items.map(i=>{const article=document.createElement('article');article.title=`${i.name} · ${i.englishName}`;article.append(recipeIcons(i,state.equipment.reference,true));if(i.recipe.length!==2){const p=document.createElement('p');p.textContent=i.category==='component'?'基础散件':'非普通合成';article.append(p);}return article}));}
export function renderEquipment(next:AppState){state=next;const eq=state.equipment;el('equipment-status').textContent=eq.message;
  el('equipment-version').textContent=`OP.GG · Set ${eq.reference.set} / ${eq.reference.patch} · 配方核对 ${new Date(eq.reference.checkedAt).toLocaleString('zh-CN')}`;
  el('equipment-update-status').textContent=state.dataUpdates.recipeMessage;
  const live=['watching','running'].includes(state.live.phase);
  el('equipment-tracking').textContent=live?`自动识别中 · ${state.live.message} · 累计核算 ¥${(state.budget.chargedMicros/1e6).toFixed(4)} / ¥10`:'开启后每 5–15 秒识别己方装备，并自动重算；沿用 DeepSeek 累计 ¥10 上限。';
  el('equipment-stop').hidden=!live;
  el('equipment-adopt').hidden=eq.origin!=='ai'||!eq.inventory;
  renderObserved();
  const ref=JSON.stringify(eq.reference.items);
  if(ref!==referenceSignature){referenceSignature=ref;manualSignature='';const components=eq.reference.items.filter(i=>i.category==='component');el('component-counts').replaceChildren(...components.map(i=>{const label=document.createElement('label');label.append(entityIcon(i.name,i.iconUrl,{focus:false}));const input=document.createElement('input');input.setAttribute('aria-label',`${i.name} 数量`);input.type='number';input.min='0';input.max='10';input.value='0';input.step='1';input.dataset.componentId=i.id;label.append(input);return label}));el('completed-item').replaceChildren(...eq.reference.items.filter(i=>i.category!=='component').map(i=>{const o=document.createElement('option');o.value=i.id;o.textContent=i.name;return o}));renderRecipes();}
  const manual=JSON.stringify(eq.manual);if(manual!==manualSignature){manualSignature=manual;setEditor(eq.manual);}
  const targets=JSON.stringify([next.guides.entries.map(g=>[g.id,g.name]),next.guides.freshIds]);if(targets!==targetSignature){targetSignature=targets;const blank=document.createElement('option');blank.value='';blank.textContent='跟随当前推荐阵容';el('equipment-target').replaceChildren(blank,...[...next.guides.entries].sort((a,b)=>b.top4Rate-a.top4Rate).map(g=>{const o=document.createElement('option');o.value=g.id;o.textContent=g.name;o.disabled=!next.guides.freshIds.includes(g.id);return o}));}
  el<HTMLSelectElement>('equipment-target').value=next.guides.selectedId??'';
  const guide=state.guides.entries.find(g=>g.id===eq.guideId);
  el('equipment-build-title').textContent=guide?`${next.guides.selectedId?'已选':'当前推荐'}：${guide.name}`:'暂无有效推荐阵容';
  const build=JSON.stringify([guide,ref,state.dataUpdates.recipesPending]);if(build!==buildSignature){buildSignature=build;el('equipment-build').replaceChildren(...(guide?[compBuild(guide,eq.reference,state.dataUpdates.recipesPending)]:[]));}
  const rec=JSON.stringify([eq.inventory,eq.recommendations,eq.alternatives,eq.guideId,eq.message]);if(rec!==recommendationSignature){recommendationSignature=rec;const plan=eq.recommendations.map(suggestion);if(!plan.length){const p=document.createElement('li');p.textContent=!eq.inventory?'装备未读清时不判断“现在能合”；下方仍可查看目标配装。':/等待核对/.test(eq.message)?eq.message:!eq.guideId?'先启用阵容推荐或选择目标阵容。':'当前没有能直接合出的目标装备；展开下方查看缺少什么。';plan.push(p)}el('craft-plan').replaceChildren(...plan);el('craft-alternatives').replaceChildren(...eq.alternatives.map(suggestion));}
}
export function setupEquipment(startTracking:()=>Promise<void>){
  el('equipment-start').addEventListener('click',()=>run(startTracking));
  el('equipment-stop').addEventListener('click',()=>run(async()=>unwrap(await api.liveStop())));
  el('item-search').addEventListener('input',renderRecipes);el('item-category').addEventListener('change',renderRecipes);
  el('completed-add').addEventListener('click',()=>{const id=el<HTMLSelectElement>('completed-item').value;if(!id)return;completed[id]=Math.min(10,(completed[id]??0)+1);chips();});
  el('equipment-save').addEventListener('click',()=>run(async()=>{const components:Record<string,number>={};for(const input of document.querySelectorAll<HTMLInputElement>('[data-component-id]'))components[input.dataset.componentId!]=Number(input.value);unwrap(await api.equipmentInventory({components,completed}));}));
  el('equipment-auto').addEventListener('click',()=>run(async()=>{setEditor(null);unwrap(await api.equipmentInventory(null));}));
  el('equipment-adopt').addEventListener('click',()=>run(async()=>{if(state.equipment.origin==='ai'&&state.equipment.inventory)unwrap(await api.equipmentInventory(state.equipment.inventory));}));
  el('equipment-target').addEventListener('change',()=>run(async()=>unwrap(await api.guideSettings({enabled:true,order:state.guides.order,selectedId:el<HTMLSelectElement>('equipment-target').value||null}))));
  el('equipment-source').addEventListener('click',()=>run(async()=>unwrap(await api.equipmentSource())));
}
