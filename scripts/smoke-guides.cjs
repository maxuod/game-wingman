const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { REVIEWED_GUIDES, ITEM_REFERENCE, rankGuides } = require('../dist/main/guides.js');
const { opggFixture, opggItemFixture } = require('../tests/opgg-fixture.cjs');
async function until(read, condition, timeout = 10000) {
  const start = Date.now(); while (Date.now() - start < timeout) { const value = await read(); if (condition(value)) return value; await new Promise(r => setTimeout(r, 100)); }
  throw new Error('Hidden native state did not arrive');
}
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'gwm-guides-'));
  const artifacts = path.resolve(process.env.GWM_ARTIFACT_DIR || 'artifacts/guides-native'); await fs.mkdir(artifacts, { recursive: true });
  const env = { ...process.env, GWM_SMOKE_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => _electron.launch({ args: [path.resolve('scripts/smoke-guides-bootstrap.cjs'), `--user-data-dir=${profile}`], env });
  let app = await launch();
  try {
    const main = await until(() => Promise.resolve(app.windows().find(p => p.url().endsWith('/index.html'))), Boolean);
    const overlay = await until(() => Promise.resolve(app.windows().find(p => p.url().endsWith('/overlay.html'))), Boolean);
    const state = () => main.evaluate(async () => (await window.desktop.state()).value);
    await until(state, s => s.overlayVisible && !!s.guides.recommendedId);
    const credentials=await require('./smoke-credentials.cjs')({app,main,overlay,profile,until,artifacts});
    const native = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/overlay.html'));
      return { top: w.isAlwaysOnTop(), focusable: w.isFocusable(), requestedVisible: w.__requestedVisible, focused: w.isFocused() };
    });
    assert.deepEqual(native, { top: true, focusable: false, requestedVisible: true, focused: false });
    assert.equal((await overlay.evaluate(() => window.desktop.detectGame())).ok, false);
    assert.equal((await overlay.evaluate(() => window.desktop.guideSettings({ enabled: false, order: 'win', selectedId: null }))).ok, false);
    assert.equal((await main.evaluate(() => window.desktop.guideSource('https://evil.example'))).ok, false);
    assert.equal((await state()).guides.order, 'top4');
    const defaultGuide = rankGuides(REVIEWED_GUIDES, 'top4')[0];
    const topFour=rankGuides(REVIEWED_GUIDES,'top4').slice(0,4).map(g=>g.id);
    assert.deepEqual(await until(()=>main.locator('#quick-list .quick-card').evaluateAll(cards=>cards.map(card=>card.dataset.guideId)),ids=>ids.length===4),topFour);
    assert.match(await main.locator('#quick-status').textContent(),/点击一套阵容/);
    await main.screenshot({path:path.join(artifacts,'auto-four-comps.png')});
    await main.locator('#quick-list .quick-card').nth(1).click();
    await until(state,s=>s.guides.selectedId===topFour[1]);
    await main.evaluate(()=>window.desktop.guideSettings({enabled:true,order:'top4',selectedId:null}));
    const ashe = REVIEWED_GUIDES.find(g => g.id === 'e8b7afe7f6f89da628eea8d25607e99f');
    assert.equal(await overlay.locator('#overlay-title').textContent(), defaultGuide.name);
    await main.evaluate(() => { document.getElementById('settings-dialog').showModal(); document.getElementById('guide-tab').click(); });
    assert.equal(await main.locator('.guide-card').count(), 10);
    assert.equal((await state()).guides.entries.length, 50);
    assert.deepEqual(await app.evaluate(() => global.__clipboardWrites), [], 'No automatic clipboard changes on startup');
    const copied = [];
    for (let page = 0; page < 5; page++) {
      const ids = await main.locator('.guide-card').evaluateAll(cards => cards.map(c => c.dataset.guideId));
      for (const id of ids) {
        const guide = REVIEWED_GUIDES.find(g => g.id === id);
        await main.evaluate(id => document.querySelector(`[data-copy-guide-id="${id}"]`).click(), id);
        await until(() => app.evaluate(() => global.__clipboardWrites.at(-1)), code => code === guide.teamCode);
        assert.equal(await main.locator(`[data-copy-guide-id="${id}"]`).textContent(), '已复制');
        copied.push(id);
      }
      if (page < 4) await main.evaluate(() => document.getElementById('guide-next').click());
    }
    assert.equal(new Set(copied).size, 50);
    assert.equal(await main.locator('#guide-next').isDisabled(), true);
    await main.evaluate(() => { const input=document.getElementById('guide-search'); input.value='艾希'; input.dispatchEvent(new Event('input')); });
    assert.ok(await main.locator('.guide-card').count());
    assert.ok((await main.locator('.guide-card h3').allTextContents()).every(t => t.includes('艾希')));
    await main.evaluate(() => { document.querySelector('.guide-card details').open=true; });
    assert.equal((await main.evaluate(() => window.desktop.guideCopy('arbitrary text'))).ok, false);
    assert.equal((await overlay.evaluate(() => window.desktop.guideCopy({ teamCode: 'untrusted code' }))).ok, false);
    assert.equal((await app.evaluate(() => global.__clipboardWrites)).length, 50);
    await main.screenshot({ path: path.join(artifacts, 'guides-panel.png') });
    await overlay.screenshot({ path: path.join(artifacts, 'guides-overlay.png') });
    assert.ok(await overlay.evaluate(() => document.getElementById('guide-source').getBoundingClientRect().bottom <= window.innerHeight), 'Source link stays inside the compact overlay');
    assert.ok(await overlay.evaluate(() => document.getElementById('guide-copy').getBoundingClientRect().bottom <= window.innerHeight), 'Copy button stays inside the compact overlay');
    await main.evaluate(() => window.desktop.guideSettings({ enabled: true, order: 'top4', selectedId: null, entries: [] }));
    assert.equal((await state()).guides.entries.length, 50);
    assert.equal((await state()).guides.recommendedId, defaultGuide.id);
    await main.evaluate(() => window.desktop.guideSettings({ enabled: true, order: 'win', selectedId: 'c5a44db118188c9565578d30c786b078' }));
    assert.equal((await state()).guides.recommendedId, 'c5a44db118188c9565578d30c786b078');
    assert.equal((await app.evaluate(() => global.__clipboardWrites)).length, 50, 'Selecting a comp alone leaves clipboard unchanged');
    await app.evaluate(() => { global.__clipboardFailure = true; });
    await overlay.evaluate(() => document.getElementById('guide-copy').click());
    await until(() => overlay.locator('#guide-copy').textContent(), text => text === '复制失败，重试');
    assert.equal((await app.evaluate(() => global.__clipboardWrites)).length, 50);
    await app.evaluate(() => { global.__clipboardFailure = false; });
    await overlay.evaluate(() => document.getElementById('guide-copy').click());
    await until(() => app.evaluate(() => global.__clipboardWrites.length), count => count === 51);
    assert.equal(await app.evaluate(() => global.__clipboardWrites.at(-1)), REVIEWED_GUIDES.find(g=>g.id==='c5a44db118188c9565578d30c786b078').teamCode, 'Overlay copies the selected comp');
    await overlay.evaluate(() => document.getElementById('guide-source').click());
    assert.equal(await app.evaluate(() => global.__openedGuide), 'https://op.gg/tft/meta-trends/comps');
    await main.evaluate(() => window.desktop.guideRefresh());
    assert.match((await state()).guides.message, /保留/);
    // Public data refresh uses fixed local fixtures; the fallback above did not erase the cache.
    await app.evaluate((_, fixtures) => { global.fetch = async url => new Response(url.endsWith('/items') ? fixtures.items : fixtures.comps); }, {comps:opggFixture(REVIEWED_GUIDES, (_, clock) => { clock.now='$D'+new Date().toISOString(); }),items:opggItemFixture(ITEM_REFERENCE)});
    await main.evaluate(() => window.desktop.guideRefresh());
    assert.equal((await state()).guides.sourceKind, 'refreshed'); assert.equal((await state()).guides.entries[0].games, 5000);
    assert.ok((await state()).dataUpdates.changes.length);
    assert.ok(await main.locator('.rank-change').count(), 'Ranking changes appear on comp cards');
    assert.equal((await state()).equipment.reference.checkedAt, ITEM_REFERENCE.checkedAt, 'Rank refresh cannot modify equipment recipes');
    await main.evaluate(() => window.desktop.officialSource());
    assert.equal(await app.evaluate(() => global.__openedGuide), 'https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-18-3/');
    // Follow a visible item link into the recipe browser, then build a manual inventory.
    await main.evaluate(() => { document.querySelector('.guide-card .item-link').click(); });
    assert.equal(await main.locator('#equipment-panel').isVisible(), true);
    assert.ok(await main.locator('#item-recipes article').count());
    await main.evaluate(id => { const input=document.getElementById('equipment-target');input.value=id;input.dispatchEvent(new Event('change')); }, ashe.id);
    await until(state, s => s.guides.selectedId === ashe.id);
    await main.evaluate(() => {
      document.querySelector('[data-component-id="DA_Component_RecurveBow"]').value='2';
      document.querySelector('[data-component-id="DA_Component_SparringGloves"]').value='1';
      document.getElementById('equipment-save').click();
      document.getElementById('equipment-editor').open=false;
    });
    const planned = await until(state, s => s.equipment.recommendations.length > 0);
    assert.equal(planned.equipment.recommendations[0].itemId, 'DA_LastWhisper');
    assert.equal(planned.equipment.recommendations.length, 1, 'Shared bow cannot be allocated twice');
    await until(() => overlay.locator('#overlay-visual .icon-recipe').getAttribute('aria-label'), t => t?.includes('反曲之弓 + 拳套 → 最后的轻语'));
    await main.evaluate(() => {document.getElementById('item-search').value='';document.getElementById('item-category').value='recipes';document.getElementById('item-category').dispatchEvent(new Event('change'));});
    assert.equal(await main.locator('#item-recipes article').count(), 55);
    await main.screenshot({ path: path.join(artifacts, 'equipment-panel.png') });
    await overlay.screenshot({ path: path.join(artifacts, 'equipment-overlay.png') });
    assert.ok(await overlay.evaluate(() => document.getElementById('overlay-description').scrollHeight <= document.getElementById('overlay-description').clientHeight), 'Craft instructions are not clipped');
    await until(()=>overlay.locator('#overlay-visual img').evaluateAll(imgs=>imgs.length===4&&imgs.every(i=>i.naturalWidth>0)),Boolean);
    assert.equal(await overlay.locator('#overlay-visual [data-name="Ashe"]').getAttribute('aria-label'),'Ashe');
    assert.ok(await overlay.evaluate(()=>[...document.querySelectorAll('#overlay-visual .entity-icon,#guide-copy,#guide-source')].every(n=>{const r=n.getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight})), 'Icons and controls fit the compact overlay');
    assert.equal(await main.locator('#equipment-observed [data-name="反曲之弓"] .icon-count').textContent(),'2');
    await main.evaluate(() => {
      document.getElementById('completed-item').value='DA_LastWhisper';document.getElementById('completed-add').click();document.getElementById('equipment-save').click();
    });
    await until(state, s => s.equipment.recommendations[0]?.itemId === 'DA_RedBuff');
    assert.equal((await main.evaluate(() => window.desktop.equipmentInventory({components:{unknown:1},completed:{}}))).ok, false);
    assert.equal((await overlay.evaluate(() => window.desktop.equipmentInventory({components:{},completed:{}}))).ok, false);
    await main.evaluate(() => {document.getElementById('item-category').value='all';document.getElementById('item-category').dispatchEvent(new Event('change'));});
    assert.equal(await main.locator('#item-recipes article').count(), 137);
    await main.evaluate(() => {document.getElementById('item-search').value='轻语';document.getElementById('item-search').dispatchEvent(new Event('input'));});
    assert.ok((await main.locator('#item-recipes .icon-recipe').first().getAttribute('aria-label')).includes('反曲之弓 + 拳套'));
    await require('./smoke-icons.cjs')({main,overlay,app,until,artifacts});
    await main.evaluate(() => window.desktop.equipmentSource());
    assert.equal(await app.evaluate(() => global.__openedGuide), 'https://op.gg/tft/game-guide/items');
    await main.evaluate(() => {
      document.getElementById('settings-dialog').close();
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#abc'; ctx.fillRect(0, 0, 640, 360);
        const fixtureStream = canvas.captureStream(15);
        let tick = 0;
        const animation = setInterval(() => { if (fixtureStream.getVideoTracks()[0].readyState === 'ended') { clearInterval(animation); return; } ctx.fillStyle = tick++ % 2 ? '#abc' : '#acb'; ctx.fillRect(0, 0, 640, 360); }, 100);
        return fixtureStream;
      };
    });
    await app.evaluate(() => { global.__testSources = [{ id: 'window:111:0', name: 'League of Legends (TM) Client' }, { id: 'window:112:0', name: 'Teamfight Tactics' }]; });
    await main.evaluate(() => window.desktop.detectGame());
    assert.equal((await state()).autoDetect.status, 'ambiguous'); assert.equal((await state()).source, null);
    await app.evaluate(() => { global.__testSources = global.__testSources.slice(0, 1); });
    await until(state, s => s.capture === 'active' && s.frameCount >= 2, 20000).catch(async error => { console.error(JSON.stringify({ testState: await state(), notice: await main.locator('#notice').textContent() })); throw error; });
    assert.equal((await state()).autoDetect.status, 'found'); assert.equal((await state()).source.id, 'window:111:0');
    assert.equal((await state()).budget.requests, 0); assert.equal((await state()).live.phase, 'off');
    assert.equal((await state()).equipment.manual, null, 'Input change clears the previous inventory');
    const automaticEquipment=await require('./smoke-auto-equipment.cjs')({app,main,overlay,profile,artifacts,until,guide:ashe,comps:opggFixture(REVIEWED_GUIDES,(_,clock)=>{clock.now='$D'+new Date().toISOString()})});
    await main.evaluate(() => document.getElementById('capture-button').click());
    await until(state, s => s.capture === 'paused');
    const paused = await state();
    await main.evaluate(() => window.desktop.detectGame()); assert.equal((await state()).frameCount, paused.frameCount);
    await main.evaluate(() => window.desktop.selectSource('window:111:0'));
    assert.equal((await state()).autoDetect.enabled, false);
    const report = { native, defaultGuide: defaultGuide.id, guides: '50 variants across 5 pages; all 50 copy buttons; Chinese search and item links; top4 default, selected overlay copy, invalid input and clipboard failure; no automatic writes; public refresh fixtures and fallback',
      equipment: '137 items / 55 recipes; Chinese search; manual inventory → Last Whisper for Ashe; no double allocation; owned Last Whisper → Red Buff; overlay recipe fits; invalid inventory rejected; source change clears inventory',
      updates: 'Independent ranking changes displayed; refresh leaves recipe snapshot unchanged; fixed official source; persisted cache restores without startup network on same day',
      discovery: 'ambiguous input requires selection; unique fixture auto-previews; pause/manual selection respected', aiRequests: (await state()).budget.requests,
      visibility: 'Real native windows kept hidden; no game capture or focus changes; in-game stacking remains to be checked by user' };
    report.automaticEquipment=automaticEquipment;
    report.credentials=credentials;
    const savedUpdates=(await state()).dataUpdates;
    await app.close();app=await launch();
    const restarted=await until(()=>Promise.resolve(app.windows().find(p=>p.url().endsWith('/index.html'))),Boolean);
    const restored=await until(()=>restarted.evaluate(async()=>(await window.desktop.state()).value),s=>s.guides.sourceKind==='cached');
    assert.equal(restored.dataUpdates.rankingCheckedAt,savedUpdates.rankingCheckedAt);assert.deepEqual(restored.dataUpdates.changes,savedUpdates.changes);
    assert.deepEqual(await app.evaluate(()=>global.__publicFetches),[], 'Startup uses valid cache and persisted failure backoff');
    const restoredKeys=await restarted.evaluate(async()=>(await window.desktop.aiSettings()).value);
    assert.equal(restoredKeys.providers.find(p=>p.provider==='deepseek').hasKey,true);assert.equal(restoredKeys.providers.find(p=>p.provider==='gemini').hasKey,false);assert.equal(restoredKeys.providers.find(p=>p.provider==='minimax').hasKey,true);
    assert.equal(await restarted.locator('#ai-key').inputValue(),'');
    await app.evaluate(({dialog})=>{
      global.__testSources=[{id:'window:313:0',name:'TFT'}];global.__autoAiCalls=0;global.__autoConsents=0;
      dialog.showMessageBox=async()=>{global.__autoConsents++;return{response:1}};
      global.fetch=async(url)=>{
        if(url==='https://api.deepseek.com/chat/completions'){
          global.__autoAiCalls++;
          return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({stage:'2-1',gold:30,hp:100,level:4,entities:[],equipment:{components:[],completed:[]}})}}],usage:{prompt_tokens:1000,completion_tokens:120}}));
        }
        throw new Error('Unexpected network in automatic follow fixture');
      };
    });
    await restarted.evaluate(()=>{
      navigator.mediaDevices.getDisplayMedia=async()=>{
        const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
        const context=canvas.getContext('2d');context.fillStyle='#abc';context.fillRect(0,0,640,360);
        const stream=canvas.captureStream(15);let n=0;
        const interval=setInterval(()=>{if(stream.getVideoTracks()[0].readyState==='ended'){clearInterval(interval);return;}context.fillStyle=n++%2?'#abc':'#acb';context.fillRect(0,0,640,360);},100);
        return stream;
      };
    });
    await restarted.evaluate(()=>window.desktop.detectGame());
    const automatic=await until(async()=>({state:await restarted.evaluate(async()=>(await window.desktop.state()).value),calls:await app.evaluate(()=>global.__autoAiCalls)}),value=>value.state.capture==='active'&&['watching','running'].includes(value.state.live.phase)&&value.calls>0,20000).then(value=>value.state).catch(async error=>{
      const current=await restarted.evaluate(async()=>(await window.desktop.state()).value);
      console.error(JSON.stringify({capture:current.capture,source:current.source,autoDetect:current.autoDetect,live:current.live.phase,liveMessage:current.live.message,budget:current.budget.message,requests:current.budget.requests,aiEnabled:(await restarted.evaluate(async()=>(await window.desktop.aiSettings()).value)).enabled,consents:await app.evaluate(()=>global.__autoConsents),mockCalls:await app.evaluate(()=>global.__autoAiCalls),notice:await restarted.locator('#notice').textContent()}));
      throw error;
    });
    assert.equal(automatic.source.id,'window:313:0');
    assert.equal(await app.evaluate(()=>global.__autoConsents),1,'One session consent after automatic capture');
    assert.equal(await app.evaluate(()=>global.__autoAiCalls),1,'Only the selected synthetic game frame was sent');
    await until(()=>restarted.evaluate(async()=>(await window.desktop.state()).value.live.observation),Boolean);
    assert.match(await restarted.locator('#advice-stage').textContent(),/本局 2-1/);
    await restarted.screenshot({path:path.join(artifacts,'auto-follow-dashboard.png')});
    report.autoFollow='Unique TFT source auto-captured; one explicit session consent; mock DeepSeek observation started without clicking follow';
    await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
    const relative = path.relative(os.tmpdir(), profile); assert.ok(relative.startsWith('gwm-guides-') && !relative.includes(path.sep));
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
