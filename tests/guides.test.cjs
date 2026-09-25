const {test}=require('node:test');const assert=require('node:assert/strict');
const {initialGuides,rankGuides,parseGuideStats,refreshGuides,REVIEWED_GUIDES,GUIDE_MAX_AGE,GUIDE_URL,ITEM_REFERENCE}=require('../dist/main/guides.js');
const {parseItemPage}=require('../dist/main/public-data.js');
const {gameCandidates}=require('../dist/main/game-window.js');const {opggFixture,opggItemFixture}=require('./opgg-fixture.cjs');
const now=Date.parse('2026-09-24T23:00:00Z');const html=change=>opggFixture(REVIEWED_GUIDES,change);
test('all source variants are present and top-four/first-place rankings remain independent',()=>{
 const guides=initialGuides().entries;assert.equal(initialGuides().order,'top4');assert.equal(guides.length,50);assert.equal(new Set(guides.map(g=>g.id)).size,50);
 assert.ok(guides.every(g=>/^02[\da-f]{30}TFTSet18$/.test(g.teamCode)&&g.units.length&&g.units.every(u=>u.items.every(i=>ITEM_REFERENCE.items.some(x=>x.id===i.id)))));
 const sample=[{...guides[0],winRate:30,top4Rate:55},{...guides[1],winRate:20,top4Rate:65}];
 assert.equal(rankGuides(sample,'top4',now)[0].id,sample[1].id);assert.equal(rankGuides(sample,'win',now)[0].id,sample[0].id);
 assert.equal(rankGuides(guides,'win',now+GUIDE_MAX_AGE).length,0);assert.equal(rankGuides(guides.map(g=>({...g,games:1})),'win',now).length,0);
 assert.equal(rankGuides(guides.map(g=>({...g,patch:'18.2'})),'win',now).length,0);assert.equal(rankGuides(guides,'win',now-86400000).length,0);
});
test('OP.GG parser reads all rows with matched family counts, ignores remote strategy and validates schema/version',()=>{
 const result=parseGuideStats(html(),now);assert.equal(result.length,50);assert.equal(result[0].winRate,24);assert.equal(result[0].games,5000);assert.equal(result[0].updatedAt,'2026-09-24T20:47:00.000Z');assert.equal(JSON.stringify(result).includes('Untrusted remote'),false);
 assert.throws(()=>parseGuideStats(html(d=>d.params.game_version='18.4'),now),/补丁/);assert.throws(()=>parseGuideStats(html(d=>d.params.game_tier='DIAMOND'),now),/口径/);
 assert.throws(()=>parseGuideStats(html((d,c)=>c.now='$D2026-09-01T00:00:00Z'),now),/过期/);assert.throws(()=>parseGuideStats(html(d=>d.rows.decks[0].stat.label.top4Rate=.1),now),/无效/);
 assert.throws(()=>parseGuideStats(html(d=>d.rows.decks[0].teamCode='invalid'),now),/无效/);assert.throws(()=>parseGuideStats(html(d=>d.rows.decks[0].units[0].meta.name='<script>'),now),/无效/);
 assert.throws(()=>parseGuideStats(html(d=>d.rows.decks.push(d.rows.decks[0])),now),/重复/);assert.throws(()=>parseGuideStats('<html>sign in</html>',now),/结构/);
});
test('public refresh is fixed, bounded and credential-free',async()=>{let calls=0;await assert.rejects(refreshGuides(async(url,options)=>{calls++;assert.equal(url,GUIDE_URL);assert.equal(options.redirect,'error');assert.equal(options.headers,undefined);return new Response('x'.repeat(4000001));}),/过大/);assert.equal(calls,1);});
test('all 55 current recipes are complete; byte-length RSC text and historical entries are handled safely',()=>{
 const fixture=opggItemFixture(ITEM_REFERENCE);const result=parseItemPage(fixture,{},now);assert.equal(result.items.length,137);assert.equal(result.items.filter(i=>i.recipe.length).length,55);assert.equal(result.items.filter(i=>i.category==='component').length,10);
 assert.throws(()=>parseItemPage(fixture.replace('guides for set 18.','guides for set 19.'),{},now),/赛季/);
 assert.ok(result.items.every(i=>i.id.startsWith('DA_')));assert.equal(result.items.find(i=>i.id==='DA_RabadonsDeathcap').recipe[0],'DA_Component_NeedlesslyLargeRod');
 const bad={...ITEM_REFERENCE,items:ITEM_REFERENCE.items.filter(i=>i.id!=='DA_Deathblade')};assert.throws(()=>parseItemPage(opggItemFixture(bad),{},now),/结构|数量/);
});
test('game detection ignores launchers/browsers and checks native owner handles',()=>{
 const sources=[{id:'window:12:0',name:'League of Legends (TM) Client'},{id:'window:13:0',name:'League of Legends'},{id:'window:14:0',name:'Teamfight Tactics - Google Chrome'},{id:'window:15:0',name:'Teamfight Tactics'},{id:'screen:0:0',name:'Teamfight Tactics'},{id:'window:17:0',name:'TFT  '}];
 assert.deepEqual(gameCandidates(sources,new Set(['12'])),[sources[0]]);assert.equal(gameCandidates(sources,new Set()).length,0);assert.equal(gameCandidates(sources).length,3);assert.deepEqual(gameCandidates(sources,new Set(['17'])),[sources[5]]);
});
