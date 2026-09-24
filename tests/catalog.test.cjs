const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseEntries, validVersion, validateCatalog } = require('../dist/main/catalog.js');

test('realm version cannot alter the resource URL', () => {
  assert.equal(validVersion('16.19.1'), true);
  for (const value of ['../../evil', 'https://other.test', '16.19.1/../../', 'latest', null, 16]) assert.equal(validVersion(value), false);
});
test('historical sets and malformed entities stay out of the Set 18 catalogue', () => {
  const document = { data: {
    old: { id: 'old', name: 'Old', image: { full: 'icon.TFT_Set17.png' } },
    current: { id: 'fixture', name: 'Fixture', cost: 3, image: { full: 'icon.TFT_Set18.png' } },
    malformed: { id: 'missing-name', image: { full: 'icon.TFT_Set18.png' } },
    future: { id: 'future', name: 'Future', image: { full: 'icon.TFT_Set180.png' } },
  } };
  assert.deepEqual(parseEntries(document, 'champion'), [{ id: 'champion:fixture', name: 'Fixture', kind: 'champion', cost: 3 }]);
  assert.throws(() => parseEntries({ error: 'upstream changed' }, 'trait'));
});
test('invalid local cache is rejected without presenting untrusted facts', () => {
  const valid = { version: '16.19.1', checkedAt: '2026-09-24T12:00:00Z', entries: [{ id: 'trait:fixture', name: 'Fixture', kind: 'trait' }] };
  assert.equal(validateCatalog(valid), true);
  for (const invalid of [{ ...valid, checkedAt: 'yesterday' }, { ...valid, entries: [] }, { ...valid, entries: [{ ...valid.entries[0], cost: -100 }] }, { ...valid, entries: [null] }]) assert.equal(validateCatalog(invalid), false);
});
