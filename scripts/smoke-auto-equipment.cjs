// Hidden Electron integration, synthetic video, fake credentials, mock provider only.
const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');
module.exports=async function({app,main,overlay,profile,artifacts,until,guide,comps}){
  const state=()=>main.evaluate(async()=>(await window.desktop.state()).value);
  const iconsReady=()=>main.evaluate(()=>{const d=document.getElementById('settings-dialog').getBoundingClientRect();return [...document.querySelectorAll('#equipment-build .entity-icon[data-icon-url]')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.top>=d.top&&r.bottom<=d.bottom}).every(n=>n.querySelector('img')?.naturalWidth>0)});
  const secret=path.join(profile,'synthetic-equipment.env');await fs.writeFile(secret,'DEEPSEEK_API_KEY=synthetic-equipment-key');
  await app.evaluate(({dialog},filename)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filename]});global.__consent=0;global.__consents=0;dialog.showMessageBox=async()=>{global.__consents++;return{response:global.__consent}};},secret);
  await main.evaluate(()=>{document.getElementById('settings-dialog').showModal();document.getElementById('ai-tab').click();document.getElementById('ai-import').click()});
  await until(()=>main.evaluate(async()=>(await window.desktop.aiSettings()).value.providers.find(p=>p.provider==='deepseek').hasKey),Boolean);
  await main.evaluate(()=>{document.getElementById('ai-enabled').checked=true;document.getElementById('ai-save').click()});
  await until(()=>main.evaluate(async()=>(await window.desktop.aiSettings()).value.enabled),Boolean);
  await main.evaluate(()=>document.getElementById('equipment-tab').click());
  assert.equal(await main.locator('#equipment-editor').getAttribute('open'),null);
  await main.evaluate(id=>window.desktop.guideSettings({enabled:true,order:'top4',selectedId:id}),guide.id);
  assert.match(await main.locator('#equipment-build').textContent(),/最后的轻语/);
  assert.match(await main.locator('#craft-plan').textContent(),/未读清/);
  assert.equal(await main.locator('#equipment-build .board-cell').count(),28);
  assert.match(await main.locator('#equipment-build [data-cell="1,1"]').getAttribute('aria-label'),/Ashe/);
  assert.match(await main.locator('#equipment-build [data-cell="4,4"]').getAttribute('aria-label'),/Maokai/);
  await app.evaluate((_,comps)=>{
    global.__fakeAiCalls=0;global.__augmentCalls=0;global.__fakeFields={stage:'3-2',gold:37,hp:80,level:8,entities:['Ashe'],equipment:{components:['Recurve Bow','Recurve Bow','Sparring Gloves'],completed:[]}};
    global.fetch=async(url,options)=>{
      if(url==='https://api.deepseek.com/chat/completions'){
        if(options.headers.Authorization!=='Bearer synthetic-equipment-key')throw new Error('Unexpected credential in isolated test');global.__fakeAiCalls++;
        return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(global.__fakeFields)}}],usage:{prompt_tokens:1500,completion_tokens:200}}));
      }
      if(url==='https://op.gg/tft/meta-trends/comps'){
        if(options.method==='POST'){global.__augmentCalls++;return new Response('0:{"a":"$@1"}\n1:'+JSON.stringify({silver:[{_key:'DA_Test',name:'测试海克斯',tier:'silver',imageUrl:'https://c-tft-api.op.gg/img/set/18/tft-augment/Pandora1.png',org:{isRound21:true}}],gold:[],prism:[]})+'\n',{headers:{'content-type':'text/x-component'}});}
        return new Response(comps+'<script src="https://c-tft-web.op.gg/_next/static/chunks/9558-0123456789abcdef.js"></script>');
      }
      if(url==='https://c-tft-web.op.gg/_next/static/chunks/9558-0123456789abcdef.js')return new Response('(0,v.createServerReference)("4040120aa22861b8b764977d2caa7fa8cc791fdf62",v.callServer,void 0,v.findSourceMapURL,"getAugment")');
      throw new Error('Network disabled in equipment fixture');
    };
  },comps);
  await main.evaluate(()=>{document.querySelector('#equipment-build .build-augments').open=true;document.querySelector('#equipment-build .build-positions').open=true;});
  await until(()=>main.locator('#equipment-build .augment-content').textContent(),t=>t.includes('测试海克斯'));
  assert.equal(await app.evaluate(()=>global.__augmentCalls),1);assert.equal(await app.evaluate(()=>global.__fakeAiCalls),0);
  assert.equal((await overlay.evaluate(id=>window.desktop.guideAugments(id),guide.id)).ok,false);
  await main.evaluate(()=>document.getElementById('equipment-start').click());
  await until(()=>app.evaluate(()=>global.__consents),n=>n===1);assert.equal((await state()).live.phase,'off');assert.equal((await state()).budget.requests,0);
  await app.evaluate(()=>{global.__consent=1});await main.evaluate(()=>document.getElementById('equipment-start').click());
  const first=await until(state,s=>s.equipment.origin==='ai'&&s.equipment.recommendations[0]?.itemId==='DA_LastWhisper',15000);
  assert.equal(first.equipment.manual,null);assert.equal(first.equipment.recommendations.length,1);
  await app.evaluate(()=>{global.__fakeFields.equipment.completed=['Last Whisper']});
  await until(state,s=>s.equipment.recommendations[0]?.itemId==='DA_RedBuff',20000);
  await until(()=>overlay.locator('#overlay-visual').getAttribute('hidden'),v=>v===null);
  assert.match(await overlay.locator('#overlay-visual').textContent(),/红霸符/);
  await main.evaluate(()=>document.getElementById('equipment-build-title').scrollIntoView());
  await until(iconsReady,Boolean);
  await main.screenshot({path:path.join(artifacts,'automatic-equipment-build.png')});
  await main.evaluate(()=>document.querySelector('#equipment-build .build-positions').scrollIntoView());
  await until(iconsReady,Boolean);
  assert.equal(await main.evaluate(()=>{const b=document.querySelector('#equipment-build .comp-board'),d=document.getElementById('settings-dialog');return b.getBoundingClientRect().right<=d.getBoundingClientRect().right}),true);
  await main.screenshot({path:path.join(artifacts,'automatic-equipment-board.png')});
  await app.evaluate(()=>{global.__fakeFields.equipment.components=null});
  await until(state,s=>s.equipment.origin==='none'&&s.live.observation?.fields.equipment.components===null,20000);
  assert.equal((await state()).equipment.recommendations.length,0);assert.match(await main.locator('#equipment-build').textContent(),/最后的轻语/);
  assert.equal(await overlay.locator('#overlay-visual .icon-recipe').count(),0,'Unknown inventory clears the previous craft icons');
  await main.evaluate(()=>document.getElementById('equipment-stop').click());await until(state,s=>s.live.phase==='stopped');
  assert.equal((await state()).equipment.inventory,null);assert.match(await main.locator('#equipment-build').textContent(),/测试海克斯/);
  await main.evaluate(()=>document.getElementById('settings-dialog').close());
  return {mockAiRequests:await app.evaluate(()=>global.__fakeAiCalls),publicAugmentRequests:await app.evaluate(()=>global.__augmentCalls),realAiRequests:0};
};
