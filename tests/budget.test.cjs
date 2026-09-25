const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BaselineBudget, BASELINE, RESERVATION } = require('../dist/main/ai/budget.js');
const config = { provider: 'deepseek', model: 'deepseek-flash', enabled: true, apiKey: 'fixture-only', timeoutMs: 1000 };
const input = { prompt: 'private fixture prompt', maxOutputTokens: 1024 };
const result = { provider: 'deepseek', model: 'deepseek-flash', text: 'OK', inputTokens: 1500, outputTokens: 200 };
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gwm-budget-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'ledger.jsonl');
  const budget = new BaselineBudget(filename); budget.load(); return { budget, filename };
}
test('budget reserves durably BEFORE dispatch and settles reported tokens at conservative rates', async t => {
  const { budget, filename } = fixture(t);
  await budget.generate(config, input, async () => {
    const restart = new BaselineBudget(filename); restart.load();
    assert.equal(restart.snapshot().reservedMicros, RESERVATION);
    return result;
  });
  const state = budget.snapshot();
  assert.equal(state.chargedMicros, 4600); assert.equal(state.reservedMicros, 0);
  assert.equal(state.requests, 1); assert.equal(state.completed, 1);
  const raw = fs.readFileSync(filename, 'utf8');
  assert.equal(raw.includes(input.prompt), false); assert.equal(raw.includes(config.apiKey), false);
  const restart = new BaselineBudget(filename); restart.load(); assert.deepEqual(restart.snapshot(), state);
});
test('failed, cancelled and unmetered calls retain their reservation across restart', async t => {
  const { budget, filename } = fixture(t);
  await assert.rejects(budget.generate(config, input, async () => { throw new Error('timeout'); }));
  await assert.rejects(budget.generate(config, input, async () => ({ ...result, inputTokens: undefined })), /用量缺失/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(budget.generate(config, { ...input, signal: controller.signal }, async () => { assert.fail('Must not send'); }));
  const restart = new BaselineBudget(filename); restart.load();
  assert.equal(restart.snapshot().requests, 2); assert.equal(restart.snapshot().reservedMicros, 2 * RESERVATION);
});
test('concurrent callers cannot exceed the cap; exhausted ledger stays exhausted on restart', async t => {
  const { budget, filename } = fixture(t); const resolvers = []; let calls = 0;
  const pending = [];
  for (let i = 0; i < 4; i++) pending.push(budget.generate(config, input, () => { calls++; return new Promise(resolve => resolvers.push(resolve)); }));
  await assert.rejects(budget.generate(config, input, async () => { calls++; return result; }), /剩余预算/);
  assert.equal(calls, 4); assert.ok(budget.snapshot().reservedMicros <= BASELINE.limit);
  for (const resolve of resolvers) resolve({ ...result, inputTokens: BASELINE.maxInput, outputTokens: BASELINE.maxOutput });
  await Promise.all(pending);
  const restart = new BaselineBudget(filename); restart.load();
  await assert.rejects(restart.generate(config, input, async () => { assert.fail('Must not send'); }), /剩余预算/);
});
test('corruption and persistence failure lock requests instead of resetting the budget', async t => {
  const { budget, filename } = fixture(t);
  fs.appendFileSync(filename, '{partial');
  const broken = new BaselineBudget(filename); assert.throws(() => broken.load(), /无法核验/);
  await assert.rejects(broken.generate(config, input, async () => { assert.fail('Must not send'); }));
  fs.unlinkSync(filename); fs.mkdirSync(filename);
  await assert.rejects(budget.generate(config, input, async () => { assert.fail('Must not send'); }), /写入失败/);
  assert.equal(budget.snapshot().ready, false);
});
test('baseline rejects other providers/models and excessive output before spending', async t => {
  const { budget } = fixture(t);
  for (const changed of [{ provider: 'gemini' }, { model: 'deepseek-v4-pro' }, { enabled: false }]) {
    await assert.rejects(budget.generate({ ...config, ...changed }, input, async () => { assert.fail('Must not send'); }));
  }
  await assert.rejects(budget.generate(config, { ...input, maxOutputTokens: 8192 }, async () => { assert.fail('Must not send'); }));
  assert.equal(budget.snapshot().requests, 0);
});
test('a simulated 30 minute game at five-second intervals uses one cumulative ledger', async t => {
  const { budget, filename } = fixture(t);
  for (let i = 0; i < 360; i++) await budget.generate(config, input, async () => result);
  const restart = new BaselineBudget(filename); restart.load();
  assert.equal(restart.snapshot().requests, 360); assert.equal(restart.snapshot().chargedMicros, 1_656_000);
  assert.equal(restart.snapshot().reservedMicros, 0);
});
