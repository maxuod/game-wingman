const {test}=require('node:test');const assert=require('node:assert/strict');
const {craftPlan,validateInventory,observedInventory,initialEquipment,updateEquipment}=require('../dist/main/equipment.js');
const {ITEM_REFERENCE,REVIEWED_GUIDES}=require('../dist/main/guides.js');const {validateObservation}=require('../dist/main/ai/observation.js');
const items=ITEM_REFERENCE.items,guide=REVIEWED_GUIDES.find(g=>g.id==='e8b7afe7f6f89da628eea8d25607e99f'),bow='DA_Component_RecurveBow',glove='DA_Component_SparringGloves';
test('craft plan consumes shared and repeated components once and deducts owned finished items',()=>{
 const inv={components:{[bow]:2,[glove]:1},completed:{}};const result=craftPlan(inv,guide,items);assert.equal(result.recommendations[0].itemId,'DA_LastWhisper');assert.ok(result.alternatives.some(r=>r.itemId==='DA_RedBuff'&&r.reserved));
 const used={};for(const rec of result.recommendations)for(const id of items.find(i=>i.id===rec.itemId).recipe)used[id]=(used[id]||0)+1;for(const[id,n]of Object.entries(used))assert.ok(n<=inv.components[id]);
 const owned=craftPlan({...inv,completed:{DA_LastWhisper:1}},guide,items);assert.ok(!owned.recommendations.some(r=>r.itemId==='DA_LastWhisper'));assert.equal(owned.recommendations[0].itemId,'DA_RedBuff');
 const one=craftPlan({components:{[bow]:1},completed:{}},guide,items);assert.ok(!one.recommendations.some(r=>r.itemId==='DA_RedBuff'));
 assert.deepEqual(inv,{components:{[bow]:2,[glove]:1},completed:{}},'planner does not mutate inventory');
});
test('inventory keeps duplicate observations and rejects unknown items, wrong categories and impossible quantities',()=>{
 assert.equal(observedInventory({components:['Recurve Bow','Recurve Bow'],completed:[]},items).components[bow],2);
 assert.equal(observedInventory({components:['反曲之弓'],completed:[]},items).components[bow],1);
 assert.equal(observedInventory({components:['mystery'],completed:[]},items),null);assert.equal(observedInventory({components:null,completed:[]},items),null);
 assert.throws(()=>validateInventory({components:{DA_LastWhisper:1},completed:{}},items),/无效/);assert.throws(()=>validateInventory({components:{[bow]:11},completed:{}},items),/无效/);
 const obs=validateObservation({stage:'3-2',gold:10,hp:80,level:6,entities:[],equipment:{components:['Recurve Bow','Recurve Bow'],completed:[]}});assert.equal(obs.equipment.components.length,2);
 assert.throws(()=>validateObservation({...obs,equipment:{components:[],completed:[],extra:1}}),/装备/);
});
test('stopped, stale and unclear AI equipment cannot produce current craft advice; manual list survives AI updates',()=>{
 const now=Date.parse('2026-09-24T23:00:00Z');const eq=initialEquipment();const observation={epoch:1,capturedAt:new Date(now).toISOString(),fields:{equipment:{components:['Recurve Bow','Sparring Gloves'],completed:[]}}};
 const state={epoch:1,capture:'active',guides:{entries:REVIEWED_GUIDES,selectedId:guide.id},equipment:eq,live:{phase:'watching',observation},ai:{observation:null}};
 updateEquipment(state,now);assert.equal(eq.origin,'ai');assert.ok(eq.recommendations.length);
 updateEquipment(state,now+15000);assert.equal(eq.origin,'none');assert.equal(eq.recommendations.length,0);
 state.live.phase='stopped';updateEquipment(state,now);assert.equal(eq.origin,'none');
 eq.manual={components:{[bow]:2},completed:{DA_LastWhisper:1}};updateEquipment(state,now);assert.equal(eq.origin,'manual');assert.equal(eq.recommendations[0].itemId,'DA_RedBuff');
 state.guides.selectedId=null;updateEquipment(state,now);assert.equal(eq.recommendations.length,0);assert.ok(eq.alternatives.length);
});
