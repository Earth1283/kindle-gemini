const test = require('node:test');
const assert = require('node:assert');
process.env.LOG_LEVEL = 'silent';
process.env.DATA_DIR = require('os').tmpdir() + '/kindle-gemini-test-' + process.pid;

const { normalizeUsage, costOf } = require('../src/services/pricing');
const store = require('../src/services/conversations');

test('usage splits cached from fresh input and counts thinking as output', () => {
  const u = normalizeUsage({ promptTokenCount: 1000, cachedContentTokenCount: 600, candidatesTokenCount: 50, thoughtsTokenCount: 30 });
  assert.deepStrictEqual(u, { prompt: 1000, cached: 600, fresh: 400, output: 80 });
});

test('cost applies the cached discount', () => {
  const u = { prompt: 1e6, cached: 1e6, fresh: 0, output: 0 };
  assert.ok(Math.abs(costOf(u, 'gemini-3.5-flash-lite') - 0.03) < 1e-9);
});

test('contents are append-only between compactions (stable cache prefix)', () => {
  const c = store.create('t1');
  c.messages.push({ role: 'user', text: 'a' }, { role: 'model', text: 'b' });
  const before = JSON.stringify(store.buildContents(c));
  c.messages.push({ role: 'user', text: 'c' });
  assert.ok(JSON.stringify(store.buildContents(c)).startsWith(before.slice(0, -1)));
});

test('summary replaces folded messages', () => {
  const c = store.create('t2');
  c.messages.push({ role: 'user', text: 'a' }, { role: 'model', text: 'b' }, { role: 'user', text: 'c' });
  c.summary = 'S';
  c.summarizedCount = 2;
  const contents = store.buildContents(c);
  assert.strictEqual(contents.length, 3);
  assert.match(contents[0].parts[0].text, /S$/);
  assert.strictEqual(contents[2].parts[0].text, 'c');
});
