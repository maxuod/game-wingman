const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {PublicDataUpdater,compareRankings,validDataCache,RANKING_INTERVAL,RETRY_INTERVAL}=require('../dist/main/data-updates.js');
const {latestOfficialPatch,parseOfficialNotes}=require('../dist/main/official-updates.js');
const {OFFICIAL_UPDATES_URL,officialPatchUrl,COMPS_URL,ITEMS_URL,parseCompPage}=require('../dist/main/public-data.js');
const {REVIEWED_GUIDES,ITEM_REFERENCE,rankGuides}=require('../dist/main/guides.js');
const {opggFixture}=require('./opgg-fixture.cjs');
const stamp='2026-09-24T18:00:00.000Z';
async function cleanup(dir){const relative=path.relative(os.tmpdir(),dir);assert.ok(/^gwm-(updates|day)-/.test(relative)&&!relative.includes(path.sep));await fs.rm(dir,{recursive:true,force:true});}
function officialFixture(patch='18.3',body=`<h2>${patch} B PATCH</h2><p>Balance changes to champions and traits, with no gameplay recipe information here.</p>`){
 const card={title:`Teamfight Tactics patch ${patch}`,publishedAt:stamp,category:{machineName:'game_updates'},product:{machineName:'teamfight_tactics'},tags:[{machineName:'patch_notes'}],action:{payload:{url:officialPatchUrl(patch)}}};
 const encode=page=>`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{pageProps:{page}}})}</script>`;
 return {index:encode({url:OFFICIAL_UPDATES_URL,blades:[{type:'articleCardGrid',items:[card]}]}),
 notes:encode({url:officialPatchUrl(patch),blades:[{type:'articleMasthead',title:card.title,publishDate:stamp},{type:'patchNotesRichText',fragmentId:patch,richText:{body}}]})};
}
test('official patch selection ignores future links and only reads the matching patch body, including hotfixes',()=>{
 const f=officialFixture(),now=Date.parse('2026-09-25T08:00:00Z');const patch=latestOfficialPatch(f.index,now);assert.equal(patch.patch,'18.3');
 const info=parseOfficialNotes(f.notes,patch);assert.equal(info.hotfix,'B');assert.equal(info.contentHash.length,64);
 assert.throws(()=>latestOfficialPatch(f.index,Date.parse(stamp)-1),/无法/);
 assert.throws(()=>parseOfficialNotes(f.notes,{...patch,patch:'18.4'}),/不匹配/);
 assert.throws(()=>latestOfficialPatch(f.index.replace(officialPatchUrl('18.3'),'https://evil.example/'),now),/无法/);
 const next=officialFixture('18.4','<p>Champions received some balance changes. Cosmetics are planned for patch 19.1 next season.</p>');
 assert.equal(parseOfficialNotes(next.notes,latestOfficialPatch(next.index,now)).patch,'18.4');
 const comp=opggFixture(REVIEWED_GUIDES,(d,c)=>{d.params.game_version=d.rows.version='18.4';c.now='$D2026-09-25T08:00:00Z';});
 assert.equal(parseCompPage(comp,now,'18.4')[0].patch,'18.4');assert.throws(()=>parseCompPage(comp,now,'18.3'),/补丁/);
});
test('rank movements, percentage-point changes, additions and removals are independent for both metrics',()=>{
 const [a,b,c]=REVIEWED_GUIDES;const previous=[{...a,top4Rate:60,winRate:30},{...b,top4Rate:50,winRate:40}];
 const next=[{...a,top4Rate:65,winRate:41},{...b,top4Rate:70,winRate:39},{...c,top4Rate:40,winRate:10}];
 const result=compareRankings(previous,next);const change=result.changes.find(x=>x.id===a.id);
 assert.equal(change.top4,-1);assert.equal(change.win,1);assert.equal(change.top4Rate,5);assert.equal(change.winRate,11);assert.equal(result.added,1);
 assert.equal(compareRankings(next,previous).removed,1);assert.equal(compareRankings(previous,previous).changes.length,0);
 assert.equal(compareRankings(previous,next.map(g=>({...g,patch:'18.4'}))).changes.length,0,'Never compare different patches');
});
test('daily startup cache, six-hour ranking checks, official patch changes, retry backoff and disk reload',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gwm-updates-'));
 try {
 let now=Date.parse('2026-09-25T08:00:00Z'),patch='18.3',fail=false,rankingFail=false,visits=[];
 const fetcher=async(url,options)=>{
  visits.push(url);assert.equal(options.headers,undefined);assert.equal(options.redirect,'error');if(fail)throw new Error('offline');
  const f=officialFixture(patch);
  if(url===OFFICIAL_UPDATES_URL)return new Response(f.index);
  if(url===officialPatchUrl(patch))return new Response(f.notes);
  assert.equal(url,COMPS_URL,'Equipment page must not be requested by the updater');
  if(rankingFail)throw new Error('rank service offline');
  return new Response(opggFixture(REVIEWED_GUIDES,(d,c)=>{d.params.game_version=d.rows.version=patch;c.now='$D'+new Date(now).toISOString();}));
 };
 const file=path.join(dir,'public.json');let updater=new PublicDataUpdater(file,fetcher,()=>now);await updater.load();
 await Promise.all([updater.check(),updater.check()]);assert.equal(visits.length,3,'Concurrent checks share one operation');assert.equal(updater.view().official.hotfix,'B');assert.ok(updater.view().rankingCheckedAt);
 const changes=updater.view().changes;assert.ok(changes.length);visits=[];
 updater=new PublicDataUpdater(file,fetcher,()=>now);await updater.load();await updater.check();assert.equal(visits.length,0,'Same-day restart reuses persistent data');assert.deepEqual(updater.view().changes,changes);assert.equal(updater.sourceKind,'cached');
 now+=RANKING_INTERVAL;await updater.check();assert.deepEqual(visits,[COMPS_URL],'Only rankings refresh after six hours');assert.equal(updater.view().changes.length,0);
 visits=[];now+=24*3600000;patch='18.4';await updater.check();assert.equal(visits.length,3);assert.equal(updater.patch(),'18.4');assert.equal(updater.entries()[0].patch,'18.4');
 assert.equal(rankGuides(updater.entries(),'top4',now,updater.patch()).length,50);assert.equal(updater.view().recipesPending,true);assert.equal(updater.view().comparedAt,null);
 assert.equal(ITEM_REFERENCE.patch,'18.3','Official patch update does not relabel old recipes');
 visits=[];now+=RANKING_INTERVAL;fail=true;await updater.check();assert.equal(visits.length,1);const preserved=updater.entries();
 updater=new PublicDataUpdater(file,fetcher,()=>now);await updater.load();await updater.check();assert.equal(visits.length,1,'Failed attempt backoff survives restart');assert.deepEqual(updater.entries(),preserved);
 now+=RETRY_INTERVAL;fail=false;await updater.check();assert.equal(visits.length,2);assert.ok(updater.view().rankingCheckedAt);
 visits=[];now+=24*3600000;patch='18.5';rankingFail=true;await updater.check();assert.equal(updater.patch(),'18.5');assert.equal(updater.entries()[0].patch,'18.4');assert.equal(rankGuides(updater.entries(),'top4',now,updater.patch()).length,0,'Old patch cannot masquerade as current after new official patch');
 now+=1000;patch='18.3';await updater.check(true);assert.equal(updater.patch(),'18.5','An older official response cannot downgrade the known patch');
 const cache=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(validDataCache(cache,now),true);
 cache.entries[0].sourceUrl='https://evil.example';assert.equal(validDataCache(cache,now),false);
 await fs.writeFile(file,JSON.stringify(cache));updater=new PublicDataUpdater(file,fetcher,()=>now);await updater.load();assert.equal(updater.sourceKind,'reviewed');
 assert.equal(visits.includes(ITEMS_URL),false);
 }finally{await cleanup(dir);}
});
test('new local calendar day triggers a check even when the ranking cache is less than six hours old',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gwm-day-'));
 try {
 let date=new Date(2026,8,25,23,59,0),now=date.getTime(),calls=0;
 const fetcher=async url=>{calls++;const f=officialFixture();return new Response(url===OFFICIAL_UPDATES_URL?f.index:url===officialPatchUrl('18.3')?f.notes:opggFixture(REVIEWED_GUIDES,(_,c)=>c.now='$D'+new Date(now).toISOString()));};
 const updater=new PublicDataUpdater(path.join(dir,'public.json'),fetcher,()=>now);await updater.check();assert.equal(calls,3);
 now+=120000;await updater.check();assert.equal(calls,6);
 }finally{await cleanup(dir);}
});
