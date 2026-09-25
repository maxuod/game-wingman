const { test } = require('node:test');
const assert = require('node:assert/strict');
const { REVIEWED_GUIDES } = require('../dist/main/guides.js');

test('selected comp and recent observed fields change the next coaching step', async () => {
  const { coachingStep } = await import('../dist/renderer/coaching.js');
  const guide = REVIEWED_GUIDES[0];
  const observed = (stage, gold, hp) => ({ stage, gold, hp, level: 6, entities: [] });
  assert.match(coachingStep(null, null, false).title, /选一套阵容/);
  assert.match(coachingStep(guide, null, true).detail, new RegExp(guide.name.split(' / ')[0]));
  assert.match(coachingStep(guide, observed('2-1', 30, 100), true).title, /稳过渡/);
  assert.match(coachingStep(guide, observed('3-2', 50, 70), true).title, /保持经济/);
  assert.match(coachingStep(guide, observed('4-1', 20, 28), true).title, /稳住血量/);
  assert.match(coachingStep(guide, observed('4-1', 20, 60), true).detail, new RegExp(guide.core[0]));
  assert.match(coachingStep(guide, observed(null, null, null), true).title, /核对当前阶段/);
  assert.match(coachingStep(guide, observed('3-2', 50, 70), false).title, /资料更新/);
});
