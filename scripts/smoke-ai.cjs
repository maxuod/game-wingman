const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

// All AI transport is mocked here. The profile and every image/key are test fixtures.
module.exports = async function smokeAi({ app, main, overlay, profile, artifact, until }) {
  const state = () => main.evaluate(async () => (await window.desktop.state()).value);
  await main.evaluate(() => window.desktop.guideSettings({ enabled: false, order: 'win', selectedId: null }));
  assert.equal((await overlay.evaluate(() => window.desktop.aiSettings())).ok, false);
  assert.equal((await overlay.evaluate(() => window.desktop.aiProbe())).ok, false);
  assert.equal((await main.evaluate(() => window.desktop.aiProbe())).ok, false);
  await app.evaluate(() => {
    global.__aiCalls = 0;
    global.fetch = async (url, options) => {
      if (!/^https:\/\/(api\.deepseek\.com|api\.minimax\.cn|generativelanguage\.googleapis\.com)\//.test(url)) throw new Error('Unexpected test network request');
      global.__aiCalls++;
      if (global.__holdAi) { global.__holdAi = false; await new Promise(resolve => { global.__resolveAi = resolve; }); }
      const body = JSON.parse(options.body);
      const image = Array.isArray(body.messages?.at(-1)?.content) || body.contents?.[0]?.parts?.some(part => part.inlineData);
      const text = image ? JSON.stringify(global.__liveFields ?? { stage: '3-2', gold: 37, hp: null, level: 6, entities: ['Lux'] }) : 'OK';
      return new Response(JSON.stringify(body.contents ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 200 } } : { choices: [{ finish_reason: 'stop', message: { content: text } }], usage: global.__usage ?? { prompt_tokens: 1500, completion_tokens: 200 } }));
    };
  });
  const credentials = path.join(profile, 'fixture.env');
  await fs.writeFile(credentials, 'DEEPSEEK_API_KEY=synthetic-secret-only\nMINIMAX_API_KEY=synthetic-minimax-only\nGEMINI_API_KEY=synthetic-gemini-only');
  await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, credentials);
  await main.click('#settings-button'); await main.click('#ai-tab'); await main.click('#ai-import');
  await until(() => main.locator('#ai-credentials').innerText(), text => text.includes('系统加密'));
  await main.check('#ai-enabled'); await main.click('#ai-save');
  await until(() => main.evaluate(async () => (await window.desktop.aiSettings()).value.enabled), Boolean);
  await main.click('#ai-probe'); await until(state, s => s.ai.status === 'done');
  assert.equal(await app.evaluate(() => global.__aiCalls), 1);
  await main.screenshot({ path: artifact('app-ai-settings.png') });
  assert.equal((await fs.readFile(path.join(profile, 'ai-settings.json'), 'utf8')).includes('synthetic-secret-only'), false);
  const settings = await main.evaluate(async () => (await window.desktop.aiSettings()).value);
  assert.equal(JSON.stringify(settings).includes('synthetic-secret-only'), false);
  assert.equal(settings.providers.every(item => item.hasKey), true);
  await main.click('[data-close="settings-dialog"]');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
  await main.click('#analyze-button'); await until(state, s => s.ai.status === 'idle');
  assert.equal(await app.evaluate(() => global.__aiCalls), 1, 'Canceling consent must not send an image');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  await main.click('#analyze-button'); await until(state, s => !!s.ai.observation);
  assert.equal((await state()).ai.observation.fields.hp, null);
  assert.match(await overlay.locator('#entry-kind').innerText(), /待核对/);
  await main.click('#ai-review'); await main.fill('#field-gold', '42'); await main.click('#ai-confirm');
  await until(state, s => s.ai.observation?.corrected);
  assert.equal((await state()).ai.observation.fields.gold, 42);
  await main.screenshot({ path: artifact('app-ai-review.png') });
  await main.click('[data-close="settings-dialog"]');
  await overlay.screenshot({ path: artifact('app-ai-overlay.png') });

  // Late responses cannot revive an observation after input changes, even if fetch ignores abort.
  await app.evaluate(() => { global.__holdAi = true; });
  await main.evaluate(() => {
    window.__pendingAi = window.desktop.state().then(result => window.desktop.aiAnalyze({ data: document.getElementById('frame-preview').src,
      epoch: result.value.epoch, frameCount: result.value.frameCount, capturedAt: result.value.capturedAt }));
  });
  await until(() => app.evaluate(() => !!global.__resolveAi), Boolean);
  await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, path.join(profile, 'synthetic-input.png'));
  await main.click('#import-button');
  await app.evaluate(() => { global.__resolveAi(); });
  await main.evaluate(() => window.__pendingAi);
  assert.equal((await state()).ai.observation, null);
  assert.equal((await state()).ai.status, 'idle');
  return 'Mock transport: encrypted import, settings, probe, consent cancel/send, field correction, overlay, stale-response rejection; zero live AI calls';
};
