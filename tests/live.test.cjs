const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LiveTracker, LIVE_LIMITS } = require('../dist/main/ai/live.js');

const fields = { stage: '3-2', gold: 37, hp: 65, level: 6, entities: ['Lux'] };
function observation(frame, value = fields) {
  return { fields: value, entities: [], provider: 'deepseek', model: 'fixture', capturedAt: frame.capturedAt,
    completedAt: frame.capturedAt, elapsedMs: 10, epoch: frame.epoch, frameCount: frame.frameCount, corrected: false };
}
function fixture(observe = async frame => observation(frame)) {
  let now = 0; let number = 0; let calls = 0;
  const tracker = new LiveTracker(() => {}, () => now);
  const run = async (...args) => { calls++; return observe(...args); };
  tracker.start('deepseek', 'fixture', run);
  return { tracker, run, calls: () => calls, advance(ms) { now += ms; tracker.touchFrame(); },
    offer(pixel = 0) { tracker.touchFrame(); return tracker.offer({ data: 'private-image', epoch: 1, frameCount: ++number, capturedAt: new Date(now).toISOString() },
      () => ({ data: 'prepared-private-image', fingerprint: new Uint8Array(32).fill(pixel) })); } };
}

test('live requests obey five-second spacing, skip similar frames, and refresh at fifteen seconds', async () => {
  const f = fixture();
  await f.offer(); assert.equal(f.calls(), 1);
  f.advance(4999); await f.offer(100); assert.equal(f.calls(), 1);
  f.advance(1); await f.offer(100); assert.equal(f.calls(), 2);
  f.advance(5000); await f.offer(100); assert.equal(f.calls(), 2);
  f.advance(10000); await f.offer(100); assert.equal(f.calls(), 3);
  assert.equal(f.tracker.snapshot().events.length, 1, 'Repeated fields must not flood the history');
  assert.equal(JSON.stringify(f.tracker.snapshot()).includes('private-image'), false);
});

test('live never overlaps requests and accepts a completed frame while local preview advances', async () => {
  let resolve;
  const f = fixture(frame => new Promise(done => { resolve = () => done(observation(frame)); }));
  const first = f.offer(); f.advance(5000); await f.offer(100);
  assert.equal(f.calls(), 1);
  resolve(); await first;
  assert.equal(f.tracker.snapshot().observation.frameCount, 1);
  assert.equal(f.tracker.snapshot().phase, 'watching');
});

test('stop and replacement sessions reject old responses even when transport ignores abort', async () => {
  let resolve; let signal;
  const f = fixture((frame, abort) => new Promise(done => { signal = abort; resolve = () => done(observation(frame)); }));
  const old = f.offer(); f.tracker.stop(); assert.equal(signal.aborted, true);
  f.tracker.start('gemini', 'other-fixture', async frame => observation(frame, { ...fields, gold: 90 }));
  await f.offer(); resolve(); await old;
  assert.equal(f.tracker.snapshot().observation.fields.gold, 90);
  assert.equal(f.tracker.snapshot().model, 'other-fixture');
});

test('live changes remain observations, unknown fields clear, and repeated missing HUD stops upload', async () => {
  let result = fields; const f = fixture(async frame => observation(frame, result));
  await f.offer(); result = { ...fields, stage: '3-3', gold: 41, hp: null };
  f.advance(5000); await f.offer(100);
  assert.equal(f.tracker.snapshot().observation.fields.hp, null, 'Do not fill missing HP from an earlier frame');
  assert.match(f.tracker.snapshot().events[0].summary, /阶段 3-2 → 3-3.*金币 37 → 41/);
  result = { stage: null, gold: null, hp: null, level: null, entities: [] };
  for (let i = 0; i < 3; i++) { f.advance(15000); await f.offer(200); }
  assert.equal(f.tracker.snapshot().phase, 'stopped');
  assert.equal(f.tracker.snapshot().observation, null);
  const before = f.calls(); f.advance(15000); await f.offer(); assert.equal(f.calls(), before);
});

test('failed calls stop without automatic retry, and frozen input expires', async () => {
  const f = fixture(async () => { throw new Error('private provider failure'); });
  await f.offer(); f.advance(15000); await f.offer();
  assert.equal(f.calls(), 1); assert.equal(f.tracker.snapshot().phase, 'stopped');
  assert.equal(JSON.stringify(f.tracker.snapshot()).includes('private provider failure'), false);
  let now = 0; const tracker = new LiveTracker(() => {}, () => now);
  tracker.start('deepseek', 'fixture', async frame => observation(frame));
  now = LIVE_LIMITS.staleMs; tracker.tick(); assert.equal(tracker.snapshot().phase, 'stopped');
});

test('time and request caps terminate the consented session', async () => {
  const f = fixture();
  for (let i = 0; i < LIVE_LIMITS.maxRequests; i++) { if (i) f.advance(5000); await f.offer(i % 2 ? 200 : 0); }
  assert.equal(f.calls(), LIVE_LIMITS.maxRequests); assert.equal(f.tracker.snapshot().phase, 'stopped');
  f.advance(5000); await f.offer(); assert.equal(f.calls(), LIVE_LIMITS.maxRequests);
  const expired = fixture(); expired.advance(LIVE_LIMITS.durationMs); await expired.offer();
  assert.equal(expired.calls(), 0); assert.equal(expired.tracker.snapshot().phase, 'stopped');
});
