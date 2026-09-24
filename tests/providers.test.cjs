const { test } = require('node:test');
const assert = require('node:assert/strict');
const { providerConfig, generateText } = require('../dist/main/ai/providers.js');
const key = 'unit-test-placeholder';
const config = provider => providerConfig({ AI_ENABLED: 'true', [`${provider.toUpperCase()}_API_KEY`]: key }, provider);
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const completion = text => ({ choices: [{ finish_reason: 'stop', message: { content: text } }], usage: { prompt_tokens: 7, completion_tokens: 2 } });

test('disabled or missing credentials never cause a network call', async () => {
  const fail = () => { assert.fail('Network must not be called'); };
  await assert.rejects(generateText(providerConfig({}), { prompt: 'test' }, fail), { code: 'disabled' });
  await assert.rejects(generateText(providerConfig({ AI_ENABLED: 'true' }), { prompt: 'test' }, fail), { code: 'configuration' });
  assert.throws(() => providerConfig({}, '__proto__'), { code: 'configuration' });
  assert.throws(() => providerConfig({ GEMINI_MODEL: '../redirect?key=secret' }, 'gemini'), { code: 'configuration' });
});
for (const [provider, endpoint] of [['minimax', 'https://api.minimax.io/v1/chat/completions'], ['deepseek', 'https://api.deepseek.com/chat/completions']]) {
  test(`${provider} isolates credentials and uses a nonstreaming text request`, async () => {
    let calls = 0;
    const result = await generateText(config(provider), { system: 'Use supplied sources.', prompt: 'Explain a fixture.' }, async (url, options) => {
      calls++; assert.equal(url, endpoint); assert.equal(options.headers.Authorization, `Bearer ${key}`);
      assert.equal(options.redirect, 'error');
      const body = JSON.parse(options.body);
      assert.equal(body.stream, false); assert.equal(body.messages[0].role, 'system');
      assert.equal(body.messages[1].content, 'Explain a fixture.');
      if (provider === 'minimax') assert.equal(body.reasoning_split, true);
      return json(completion('Fixture answer'));
    });
    assert.equal(calls, 1); assert.equal(result.provider, provider); assert.equal(result.text, 'Fixture answer'); assert.equal(result.inputTokens, 7);
  });
}
test('Gemini uses header authentication and exposes final text only', async () => {
  const result = await generateText(config('gemini'), { system: 'Use sources.', prompt: 'A fixture' }, async (url, options) => {
    assert.match(url, /\/gemini-3\.8-flash:generateContent$/); assert.equal(url.includes(key), false);
    assert.equal(options.headers['x-goog-api-key'], key);
    const body = JSON.parse(options.body);
    assert.equal(body.systemInstruction.parts[0].text, 'Use sources.');
    assert.equal(body.contents[0].parts[0].text, 'A fixture');
    return json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'Not final text' }, { text: 'OK' }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 } });
  });
  assert.equal(result.text, 'OK'); assert.equal(result.outputTokens, 1);
});
test('HTTP failure does not leak provider bodies, retry or switch providers', async () => {
  let calls = 0;
  await assert.rejects(generateText(config('minimax'), { prompt: 'private prompt' }, async () => {
    calls++; return new Response(`error ${key} private prompt`, { status: 429 });
  }), error => error.code === 'http' && error.status === 429 && !error.message.includes(key) && !error.message.includes('private prompt'));
  assert.equal(calls, 1);
  await assert.rejects(generateText(config('minimax'), { prompt: 'test' }, async () => { throw new Error(key); }), error => error.code === 'network' && !error.message.includes(key));
});
test('truncated, blocked, empty and mixed-reasoning results fail closed', async () => {
  const cases = [completion(''), completion('<think>private reasoning</think>Answer'), { ...completion('partial'), choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }, { ...completion('OK'), base_resp: { status_code: 1004, status_msg: key } }];
  for (const payload of cases) await assert.rejects(generateText(config('minimax'), { prompt: 'test' }, async () => json(payload)), { code: 'response' });
  await assert.rejects(generateText(config('gemini'), { prompt: 'test' }, async () => json({ promptFeedback: { blockReason: 'SAFETY' } })), { code: 'response' });
});
test('cancellation, bounded inputs and oversized output protect the boundary', async () => {
  const controller = new AbortController(); controller.abort();
  const fail = () => assert.fail('Network must not be called');
  await assert.rejects(generateText(config('deepseek'), { prompt: 'test', signal: controller.signal }, fail), { code: 'cancelled' });
  await assert.rejects(generateText(config('deepseek'), { prompt: 'x'.repeat(32001) }, fail), { code: 'input' });
  await assert.rejects(generateText(config('deepseek'), { prompt: 'test', maxOutputTokens: 9000 }, fail), { code: 'input' });
  await assert.rejects(generateText(config('deepseek'), { prompt: 'test' }, async () => new Response('x'.repeat(1000001))), { code: 'response' });
});
test('package allowlist excludes credentials and local data', async () => {
  const { excludeFromPackage } = await import('../scripts/package-filter.mjs');
  for (const name of ['/.env', '/.env.example', '/secret.pem', '/captures/frame.png', '/user-data/cache.json', '/docs/audit.json', '/node_modules/playwright/index.js']) assert.equal(excludeFromPackage(name), true);
  for (const name of ['', '/', '/dist/main/index.js', '/assets/icon.png', '/package.json']) assert.equal(excludeFromPackage(name), false);
});
