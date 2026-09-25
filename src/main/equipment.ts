import type { AppState, CompGuide, CraftSuggestion, EquipmentInventory, EquipmentObservation, EquipmentState, ItemDefinition, ItemReference } from '../shared/types';
import { ITEM_REFERENCE, GUIDE_MAX_AGE } from './guides';

export function initialEquipment(): EquipmentState {
  return { reference:structuredClone(ITEM_REFERENCE), manual:null, inventory:null, origin:'none', updatedAt:null,
    message:'开启自动识别后，按当前装备更新合成建议；也可以先看目标配装。', recommendations:[], alternatives:[], guideId:null };
}
export function validateInventory(value: unknown, items: ItemDefinition[]): EquipmentInventory {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'completed,components') throw new Error('装备清单格式无效。');
  const raw = value as Record<string,unknown>; const result: EquipmentInventory = {components:{},completed:{}}; let total=0;
  for (const kind of ['components','completed'] as const) {
    const counts=raw[kind]; if(!counts || typeof counts!=='object' || Array.isArray(counts) || Object.keys(counts).length>50) throw new Error('装备清单格式无效。');
    for(const [id,count] of Object.entries(counts)) {
      const item=items.find(i=>i.id===id);
      if(!item || (kind==='components')!==(item.category==='component') || typeof count!=='number' || !Number.isInteger(count) || count<0 || count>10) throw new Error('装备名称或数量无效。');
      if(count)result[kind][id]=count;total+=count;
    }
  }
  if(total>40)throw new Error('装备总数超出范围。');return result;
}
function normalize(value:string) { return value.toLowerCase().replace(/[’'\s.\-]/g,''); }
export function observedInventory(raw: EquipmentObservation | undefined, items: ItemDefinition[]): EquipmentInventory | null {
  if(!raw || raw.components===null || raw.completed===null)return null;
  const result:EquipmentInventory={components:{},completed:{}};
  for(const kind of ['components','completed'] as const)for(const name of raw[kind]!) {
    const matches=items.filter(i=>(kind==='components')===(i.category==='component')&&[i.id,i.name,i.englishName].some(n=>normalize(n)===normalize(name)));
    if(matches.length!==1)return null;const id=matches[0].id;result[kind][id]=(result[kind][id]||0)+1;
  }
  try{return validateInventory(result,items)}catch{return null}
}
function missing(recipe:string[],counts:Record<string,number>):string[] {
  const available={...counts};return recipe.filter(id=>{if(available[id]>0){available[id]--;return false}return true});
}
export function craftPlan(inventory:EquipmentInventory, guide:CompGuide|null, items:ItemDefinition[]):{recommendations:CraftSuggestion[];alternatives:CraftSuggestion[]} {
  const available={...inventory.components}, completed={...inventory.completed};const recommendations:CraftSuggestion[]=[], alternatives:CraftSuggestion[]=[];
  const targets=(guide?.units??[]).filter(u=>u.items.length).sort((a,b)=>(a.priority??99)-(b.priority??99));
  const seen=new Set<string>();
  for(const unit of targets)for(const target of unit.items) {
    if(completed[target.id]>0){completed[target.id]--;continue;}
    const item=items.find(i=>i.id===target.id);if(!item || item.recipe.length!==2)continue;
    const absent=missing(item.recipe,available), originalMissing=missing(item.recipe,inventory.components);
    const suggestion:CraftSuggestion={itemId:item.id,champion:unit.name,missing:originalMissing,reserved:!originalMissing.length&&!!absent.length,
      reason:`${unit.name} 的参考配装${unit.priority===1?'，优先补第一核心缺装':''}`};
    if(!absent.length) {for(const id of item.recipe)available[id]--;recommendations.push(suggestion);}
    else alternatives.push(suggestion);
    seen.add(item.id);
  }
  for(const item of items.filter(i=>i.recipe.length===2))if(!seen.has(item.id)&&!missing(item.recipe,inventory.components).length) {
    alternatives.push({itemId:item.id,champion:null,missing:[],reserved:!!missing(item.recipe,available).length,
      reason:guide?'可合成，但不在目标阵容的参考配装中':'可合成；选择目标阵容后再排列优先级'});
  }
  return {recommendations,alternatives};
}
export function updateEquipment(state:AppState, now=Date.now()):void {
  const eq=state.equipment;eq.recommendations=[];eq.alternatives=[];
  const guide=state.guides.entries.find(g=>g.id===(state.guides.selectedId??state.guides.recommendedId))??null;eq.guideId=guide?.id??null;
  if(eq.manual){eq.inventory=eq.manual;eq.origin='manual';eq.message='按手动确认的清单计算；合成或获得装备后请更新数量。';}
  else {
    const observation=state.live.observation??state.ai.observation;
    const age=observation?now-Date.parse(observation.capturedAt):Infinity;
    const valid=observation && observation.epoch===state.epoch && age>=-1000 && age<15000 &&
      (state.live.observation ? ['watching','running'].includes(state.live.phase) && state.capture==='active' : true);
    eq.inventory=valid?observedInventory(observation.fields.equipment,eq.reference.items):null;
    eq.origin=eq.inventory?'ai':'none';eq.updatedAt=valid?observation.capturedAt:null;
    eq.message=eq.inventory?'已自动按识别清单更新建议，合成前请核对数量。':valid?'装备未完整读清，等待下一帧；可展开手动纠正。':'等待新鲜装备画面；下方可先查看阵容配装参考。';
  }
  if(!eq.inventory)return;
  if(state.dataUpdates?.recipesPending || (guide && (guide.patch!==eq.reference.patch || now-Date.parse(guide.updatedAt)>GUIDE_MAX_AGE))) {eq.message='官方资料有变化或阵容统计过期，等待核对后再计算装备。';return;}
  Object.assign(eq,craftPlan(eq.inventory,guide,eq.reference.items));
  if(!guide)eq.message+=' 先选择目标阵容，当前仅列出可合成装备。';
}
