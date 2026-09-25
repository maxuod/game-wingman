const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {IconCache,validIconUrl}=require('../dist/main/icon-cache');
const {REVIEWED_GUIDES,ITEM_REFERENCE}=require('../dist/main/guides');
const {parseCompPage,parseItemPage}=require('../dist/main/public-data');
const {parseAugments}=require('../dist/main/comp-augments');
const {opggFixture,opggItemFixture}=require('./opgg-fixture.cjs');
const url='https://c-tft-api.op.gg/img/set/18/tft-item/DA_LastWhisper.png';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
async function folder(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gwm-icons-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('only public versioned icon assets are accepted; no arbitrary renderer URLs',async t=>{
 let calls=0;const cache=new IconCache(await folder(t),async()=>{calls++;return new Response(png)});
 for(const invalid of ['https://evil.example/icon.png','http://127.0.0.1/private',url+'?token=x',url.replace('op.gg','op.gg.evil.example'),url.replace('DA_LastWhisper','../secret'),url.replace('.png','.svg'),null,{},'file:///etc/passwd']){assert.equal(validIconUrl(invalid),false);assert.equal(await cache.get(invalid),null);}
 assert.equal(calls,0);assert.ok(validIconUrl(url));
});
test('deduplicated icons persist across restart, expire and send no credentials',async t=>{
 const dir=await folder(t);let now=Date.now()+1000,calls=0;
 const fetcher=async(u,opts)=>{assert.equal(u,url);assert.equal(opts.redirect,'error');assert.equal(opts.credentials,'omit');assert.equal(opts.headers,undefined);calls++;return new Response(png)};
 const a=new IconCache(dir,fetcher,()=>now);const results=await Promise.all([a.get(url),a.get(url),a.get(url)]);assert.equal(new Set(results).size,1);assert.match(results[0],/^data:image\/png;base64,/);assert.equal(calls,1);
 const b=new IconCache(dir,fetcher,()=>now);assert.equal(await b.get(url),results[0]);assert.equal(calls,1);
 now+=8*86400000;await b.get(url);assert.equal(calls,2);
});
test('invalid, oversized and failed assets fall back without repeated network; retry after backoff',async t=>{
 for(const bytes of [Buffer.from('<svg xmlns="test"></svg>'),Buffer.alloc(256001),Buffer.from('<html>not an image</html>')]){const cache=new IconCache(await folder(t),async()=>new Response(bytes));assert.equal(await cache.get(url),null);}
 let now=Date.now(),calls=0,fail=true;const cache=new IconCache(await folder(t),async()=>{calls++;if(fail)throw new Error('offline');return new Response(png)},()=>now);
 assert.equal(await cache.get(url),null);assert.equal(await cache.get(url),null);assert.equal(calls,1);now+=300001;fail=false;assert.ok(await cache.get(url));assert.equal(calls,2);
});
test('asset downloads stay within four concurrent requests',async t=>{
 let running=0,peak=0;const cache=new IconCache(await folder(t),async()=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,10));running--;return new Response(png)});
 const results=await Promise.all(Array.from({length:20},(_,i)=>cache.get(url.replace('DA_LastWhisper','Fixture'+i))));assert.ok(results.every(Boolean));assert.equal(peak,4);
});
test('source parsers keep asset links, discard unsafe links and keep missing-image facts usable',()=>{
 const comps=parseCompPage(opggFixture(REVIEWED_GUIDES),Date.parse('2026-09-24T23:00:00Z'));assert.ok(comps.every(g=>g.units.every(u=>validIconUrl(u.iconUrl))));
 const changed=parseCompPage(opggFixture(REVIEWED_GUIDES,d=>d.rows.decks[0].units[0].meta.imageUrl='https://evil.example/x.png'),Date.parse('2026-09-24T23:00:00Z'));assert.equal(changed[0].units[0].iconUrl,undefined);
 const {items}=parseItemPage(opggItemFixture(ITEM_REFERENCE));assert.equal(items.length,137);assert.ok(items.every(i=>validIconUrl(i.iconUrl)));
 const data={silver:[{_key:'DA_Test',name:'测试',tier:'silver',imageUrl:'https://c-tft-api.op.gg/img/set/18/tft-augment/Pandora1.png'}],gold:[],prism:[]};
 const read=()=>parseAugments('0:{"a":"$@1"}\n1:'+JSON.stringify(data)+'\n');assert.ok(read()[0].iconUrl);data.silver[0].imageUrl='javascript:alert(1)';assert.equal(read()[0].iconUrl,undefined);
});
