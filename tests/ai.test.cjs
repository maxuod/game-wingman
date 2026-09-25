const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { AiSettingsStore } = require('../dist/main/ai/settings.js');
const { providerConfig, generateText } = require('../dist/main/ai/providers.js');
const { parseObservation, validateObservation, mapEntities } = require('../dist/main/ai/observation.js');

test('encrypted credentials survive restart and never appear in settings snapshots', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gwm-vault-test-'));
  const key = crypto.randomBytes(32);
  const cipher = { isEncryptionAvailable: () => true,
    encryptString: text => { const iv = crypto.randomBytes(16); const c = crypto.createCipheriv('aes-256-cbc', key, iv); return Buffer.concat([iv, c.update(text), c.final()]); },
    decryptString: bytes => { const c = crypto.createDecipheriv('aes-256-cbc', key, bytes.subarray(0, 16)); return Buffer.concat([c.update(bytes.subarray(16)), c.final()]).toString(); } };
  const filename = path.join(directory, 'ai-settings.json');
  const store = new AiSettingsStore(filename, cipher);
  try {
    await store.load();
    await Promise.all([store.importKeys({ deepseek: 'test-private-token' }), store.save({ provider: 'deepseek', model: 'deepseek-flash', region: 'global', enabled: true })]);
    const disk = await fs.readFile(filename, 'utf8');
    assert.equal(disk.includes('test-private-token'), false);
    assert.equal(JSON.stringify(store.status()).includes('test-private-token'), false);
    assert.equal(JSON.stringify(store.status()).includes('"key"'), false);
    const restored = new AiSettingsStore(filename, cipher); await restored.load();
    assert.equal(restored.config().apiKey, 'test-private-token');
    assert.equal(restored.config().enabled, true);
    await restored.setKey('gemini','another-test-token');
    assert.equal(restored.status().selected,'deepseek');assert.equal(restored.config().apiKey,'test-private-token');
    assert.equal(restored.config('gemini').apiKey,'another-test-token');
    assert.throws(()=>restored.setKey('__proto__','other'));assert.throws(()=>restored.setKey('deepseek',{}));
    assert.throws(()=>restored.setKey('deepseek','secret\u0000control'));
    assert.equal(JSON.stringify(restored.status()).includes('another-test-token'),false);
    await restored.removeKey('deepseek'); assert.throws(() => restored.config());
    const disabled = new AiSettingsStore(filename, { ...cipher, isEncryptionAvailable: () => false });
    assert.throws(() => disabled.importKeys({ gemini: 'test-private-token' }));
    await fs.writeFile(filename, '{broken'); await assert.rejects(restored.load(), /配置无法读取/);
  } finally {
    const relative = path.relative(os.tmpdir(), directory);
    assert.ok(relative.startsWith('gwm-vault-test-') && !relative.includes(path.sep));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('each provider sends the selected inline image to its fixed endpoint', async () => {
  for (const provider of ['minimax', 'deepseek', 'gemini']) {
    const config = providerConfig({ AI_ENABLED: 'true', MINIMAX_REGION: 'cn', [`${provider.toUpperCase()}_API_KEY`]: 'test-token' }, provider);
    await generateText(config, { prompt: 'Read fields', image: { mimeType: 'image/png', data: 'eA==' } }, async (url, options) => {
      const body = JSON.parse(options.body);
      if (provider === 'gemini') {
        assert.deepEqual(body.contents[0].parts[1].inlineData, { mimeType: 'image/png', data: 'eA==' });
        assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low');
        return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'OK' }] } }] }));
      }
      if (provider === 'minimax') assert.equal(url, 'https://api.minimax.cn/v1/chat/completions');
      assert.equal(body.messages[0].content[1].image_url.url, 'data:image/png;base64,eA==');
      assert.equal(body.thinking.type, 'disabled');
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'OK' } }] }));
    });
    await assert.rejects(generateText(config, { prompt: 'test', image: { mimeType: 'image/png', data: 'https://other.test/private' } }, () => assert.fail('no network')), { code: 'input' });
  }
  assert.throws(() => providerConfig({ MINIMAX_REGION: 'https://other.test' }));
});

test('observation validation retains unknowns, rejects tactical text and maps only known names', () => {
  const fields = { stage: '3-2', gold: 37, hp: null, level: 6, entities: ['Lux', 'Unseen hero'] };
  assert.deepEqual(parseObservation(JSON.stringify(fields)), fields);
  assert.deepEqual(mapEntities(fields, [{ id: 'champion:Lux', name: 'Lux', kind: 'champion' }]), [{ name: 'Lux', id: 'champion:Lux' }, { name: 'Unseen hero', id: null }]);
  for (const invalid of [{ ...fields, gold: -1 }, { ...fields, level: 100 }, { ...fields, advice: 'Buy Lux' }, { ...fields, hp: 'unknown' }, { ...fields, entities: ['<script>\n'] }]) assert.throws(() => validateObservation(invalid));
});
