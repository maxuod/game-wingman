const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {CompAugmentService,parseAugments,validAugmentCache}=require('../dist/main/comp-augments');
const {parseCompPage,COMPS_URL}=require('../dist/main/public-data');
const {REVIEWED_GUIDES}=require('../dist/main/guides');const {opggFixture}=require('./opgg-fixture.cjs');
const {initialEquipment,updateEquipment}=require('../dist/main/equipment');
const guide=REVIEWED_GUIDES.find(g=>g.id==='e8b7afe7f6f89da628eea8d25607e99f');
const instant=Date.parse('2026-09-24T23:00:00Z');
const raw={silver:[{_key:'DA_Test',name:'合成测试候选',tier:'silver',org:{isRound21:true,isRound32:false},desc:'<script>must not enter app</script>'}],gold:[],prism:[]};
const payload=v=>'0:{"a":"$@1","f":"","b":"fixture"}\n1:'+JSON.stringify(v)+'\n';
const chunk='https://c-tft-web.op.gg/_next/static/chunks/9558-0123456789abcdef.js';
function fixture(now){return opggFixture(REVIEWED_GUIDES,(_,clock)=>{clock.now='$D'+new Date(now).toISOString()})+`<script src="${chunk}"></script>`;}
test('reference positions preserve source coordinates and missing boards, reject overlap/out-of-bounds',()=>{
 const parsed=parseCompPage(fixture(instant),instant);assert.equal(parsed.length,50);assert.equal(parsed.filter(g=>g.units.every(u=>u.cell)).length,39);
 assert.deepEqual(parsed.find(g=>g.id===guide.id).units.find(u=>u.name==='Ashe').cell,{x:1,y:1});
 assert.throws(()=>parseCompPage(opggFixture(REVIEWED_GUIDES,d=>d.rows.decks[0].units[0].cell={x:8,y:1}),instant),/坐标/);
 assert.throws(()=>parseCompPage(opggFixture(REVIEWED_GUIDES,d=>d.rows.decks[0].units[0].cell=d.rows.decks[0].units[1].cell),instant),/重复/);
});
test('automatic recommended comp drives crafts without a manual target; unknown/stale inventory keeps only reference',()=>{
 const state={epoch:1,capture:'active',guides:{entries:REVIEWED_GUIDES,selectedId:null,recommendedId:guide.id},equipment:initialEquipment(),live:{phase:'watching',observation:{epoch:1,capturedAt:new Date(instant).toISOString(),fields:{equipment:{components:['Recurve Bow','Sparring Gloves'],completed:[]}}}},ai:{observation:null}};
 updateEquipment(state,instant);assert.equal(state.equipment.manual,null);assert.equal(state.equipment.guideId,guide.id);assert.equal(state.equipment.recommendations[0].itemId,'DA_LastWhisper');
 state.live.observation.fields.equipment.completed=null;updateEquipment(state,instant);assert.equal(state.equipment.inventory,null);assert.equal(state.equipment.recommendations.length,0);assert.equal(state.equipment.guideId,guide.id);
 updateEquipment(state,instant+15001);assert.equal(state.equipment.recommendations.length,0);assert.equal(state.equipment.guideId,guide.id);
});
test('augment extraction accepts only the referenced factual groups and does not retain prose or HTML',()=>{
 assert.deepEqual(parseAugments(payload(raw)),[{id:'DA_Test',name:'合成测试候选',tier:'silver',rounds:['2-1']}]);
 assert.throws(()=>parseAugments(payload({...raw,gold:raw.silver})),/等级/);
 assert.throws(()=>parseAugments(payload({...raw,silver:[...raw.silver,...raw.silver]})),/重复/);
 assert.throws(()=>parseAugments(payload({...raw,silver:[{...raw.silver[0],name:'<img>'}]})),/名称/);
 assert.throws(()=>parseAugments('0:{"a":"$@2"}\n1:'+JSON.stringify(raw)+'\n'),/未返回/);
});
test('augment fetch is scoped to public comp/patch, cached across restart, deduplicated and bounded on failure',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gwm-augments-'));let now=instant,calls=[],fail=false;
 const fetcher=async(url,opts)=>{calls.push({url,opts});if(fail)throw new Error('offline');
   if(url===chunk)return new Response('(0,v.createServerReference)("4040120aa22861b8b764977d2caa7fa8cc791fdf62",v.callServer,void 0,v.findSourceMapURL,"getAugment")');
   assert.equal(url,COMPS_URL);if(opts.method==='POST'){assert.deepEqual(JSON.parse(opts.body),[{deckId:guide.id,locale:'zh-cn',version:'18.3'}]);assert.equal(opts.headers.Authorization,undefined);return new Response(payload(raw),{headers:{'content-type':'text/x-component'}});}
   return new Response(fixture(now));
 };
 const service=new CompAugmentService(dir,fetcher,()=>now);const [a,b]=await Promise.all([service.get(guide),service.get(guide)]);assert.deepEqual(a,b);assert.equal(calls.length,3);
 assert.equal(validAugmentCache({...a,guideId:'other'},guide,now),false);assert.equal(validAugmentCache({...a,entries:[{...a.entries[0],rounds:['9-9']}]},guide,now),false);
 const restarted=new CompAugmentService(dir,fetcher,()=>now);assert.deepEqual(await restarted.get(guide),a);assert.equal(calls.length,3);
 now+=6*3600000;fail=true;assert.equal((await restarted.get(guide)).stale,true);const attempts=calls.length;await restarted.get(guide);assert.equal(calls.length,attempts);
 await assert.rejects(()=>restarted.get({...guide,patch:'18.4'}),/暂未读到/);
 now+=73*3600000;await assert.rejects(()=>restarted.get(guide),/暂未读到/);
});
