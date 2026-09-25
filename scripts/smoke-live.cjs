const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async function smokeLive({ app, main, overlay, profile, artifact, until }) {
  const state = () => main.evaluate(async () => (await window.desktop.state()).value);
  const calls = () => app.evaluate(() => global.__aiCalls);
  assert.equal((await main.evaluate(() => window.desktop.liveStart())).ok, false, 'No stream, no automatic upload');
  assert.equal((await overlay.evaluate(() => window.desktop.liveStart())).ok, false);
  assert.equal((await overlay.evaluate(() => window.desktop.liveFrame({}))).ok, false);
  assert.equal((await main.evaluate(() => window.desktop.aiSave({ provider: 'gemini', model: 'gemini-3.5-flash-lite', region: 'global', enabled: true }))).ok, false);
  await app.evaluate(async ({ BrowserWindow, dialog }) => {
    global.__resolveAi = undefined;
    global.__fixtureWindow = new BrowserWindow({ width: 640, height: 400, title: 'Live QA synthetic', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await global.__fixtureWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html><head><meta charset="UTF-8"><title>Live QA synthetic</title></head><body style="background:#284840;color:#fff;font:24px system-ui;padding:40px"><small>GAME WINGMAN · MOCK AI ONLY</small><h1>Stage 3-2 · Gold 37</h1><p>No player data</p><p id="clock"></p><script>setInterval(()=>document.getElementById("clock").textContent=new Date().toISOString(),100)</script></body></html>'));
    dialog.showMessageBox = async () => ({ response: 0 });
  });
  const before = await calls();
  await main.click('#choose-source'); await main.getByRole('button', { name: 'Live QA synthetic', exact: true }).click();
  await main.click('#capture-button'); await until(state, s => s.capture === 'active' && s.frameCount >= 2);
  assert.equal(await calls(), before, 'Local video must not start paid requests');
  const video = await main.evaluate(() => {
    const v = document.getElementById('capture-video');
    return { visible: !v.hidden, playing: !v.paused, tracks: v.srcObject.getVideoTracks().map(t => t.getSettings()), audio: v.srcObject.getAudioTracks().length };
  });
  assert.equal(video.visible, true); assert.equal(video.playing, true); assert.equal(video.audio, 0);
  await main.click('#settings-button'); await main.click('#ai-tab'); await main.click('#live-start');
  await until(() => main.locator('#live-start').isDisabled(), disabled => !disabled);
  assert.equal(await calls(), before, 'Canceling live consent must not upload');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); global.__holdAi = true; });
  await main.click('#live-start'); await main.click('[data-close="settings-dialog"]');
  await until(() => app.evaluate(() => !!global.__resolveAi), Boolean);
  const pending = await state(); assert.ok(pending.budget.reservedMicros > 0);
  await until(state, s => s.frameCount >= pending.frameCount + 2);
  assert.equal(await calls(), before + 1, 'Preview continues without overlapping AI calls');
  await app.evaluate(() => { global.__resolveAi(); global.__resolveAi = undefined; });
  await until(state, s => !!s.live.observation);
  assert.equal((await state()).live.observation.fields.gold, 37);
  assert.equal((await state()).budget.reservedMicros, 0);
  assert.match(await overlay.locator('#overlay-time').innerText(), /DeepSeek.*¥/);
  await app.evaluate(async () => {
    global.__liveFields = { stage: '3-3', gold: 41, hp: 62, level: 6, entities: ['Lux'] };
    await global.__fixtureWindow.webContents.executeJavaScript("document.body.style.background='#aaa'; document.querySelector('h1').textContent='Stage 3-3 · Gold 41'");
  });
  await until(state, s => s.live.observation?.fields.gold === 41, 20000);
  assert.match((await state()).live.events[0].summary, /金币 37 → 41/);
  await main.screenshot({ path: artifact('app-live.png') }); await overlay.screenshot({ path: artifact('app-live-overlay.png') });
  await main.click('#settings-button'); await main.click('#ai-tab');
  await main.locator('#test-budget').scrollIntoViewIfNeeded();
  await main.screenshot({ path: artifact('app-live-budget.png') }); await main.click('[data-close="settings-dialog"]');
  // Pausing a pending request must stop future sends; late usage still settles safely.
  await app.evaluate(async () => { global.__holdAi = true; await global.__fixtureWindow.webContents.executeJavaScript("document.body.style.background='#111'"); });
  await until(() => app.evaluate(() => !!global.__resolveAi), Boolean, 20000);
  await main.click('#capture-button');
  assert.equal((await state()).live.phase, 'stopped');
  await app.evaluate(() => { global.__resolveAi(); global.__resolveAi = undefined; });
  await until(state, s => s.budget.reservedMicros === 0);
  assert.equal((await state()).live.phase, 'stopped');
  const spent = (await state()).budget.chargedMicros;
  // A second session shares the same budget. Large SYNTHETIC usage exercises the native stop path.
  await main.click('#capture-button'); await until(state, s => s.capture === 'active');
  assert.equal((await state()).budget.chargedMicros, spent);
  await app.evaluate(() => { global.__usage = { prompt_tokens: 1048576, completion_tokens: 1024 }; });
  assert.equal((await main.evaluate(() => window.desktop.liveStart())).ok, true);
  for (let i = 0; i < 4; i++) {
    await app.evaluate(async (_electron, color) => { await global.__fixtureWindow.webContents.executeJavaScript(`document.body.style.background='${color}'`); }, i % 2 ? '#111' : '#ccc');
    await until(state, s => s.live.requests >= i + 1 && s.live.phase === 'watching', 20000);
  }
  const cappedCalls = await calls();
  await app.evaluate(async () => { await global.__fixtureWindow.webContents.executeJavaScript("document.body.style.background='#ccc'"); });
  await until(state, s => s.live.phase === 'stopped', 20000);
  assert.match((await state()).live.message, /剩余预算/); assert.equal(await calls(), cappedCalls);
  assert.ok((await state()).budget.chargedMicros <= 10_000_000);
  assert.equal((await main.evaluate(() => window.desktop.liveStart())).ok, false, 'New consent cannot reset spent budget');
  assert.equal((await main.evaluate(() => window.desktop.aiProbe())).ok, false, 'Manual requests share the cap');
  assert.equal(await calls(), cappedCalls);
  await fs.copyFile(path.join(profile, 'deepseek-baseline-budget.jsonl'), artifact('mock-budget-ledger.jsonl'));
  await app.evaluate(() => { global.__fixtureWindow.destroy(); });
  return { result: 'Mock only: live video, consent cancel/start, nonoverlap, field changes, pause/late responses, cumulative budget and native cap stop passed', video, budget: (await state()).budget };
};
