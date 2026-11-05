import test from 'node:test';
import assert from 'node:assert';
import { renderMarkdown } from '../public/modern/markdown.js';

test('escapes raw HTML', () => {
  assert.ok(!renderMarkdown('<img src=x onerror=alert(1)>').includes('<img'));
});
test('blocks javascript: links', () => {
  assert.ok(!renderMarkdown('[x](javascript:alert(1))').includes('<a '));
});
test('code fences are escaped and survive inline syntax', () => {
  const html = renderMarkdown('```js\n**not bold** <b>\n```');
  assert.ok(html.includes('**not bold** &lt;b&gt;'));
});
test('lists and emphasis', () => {
  const html = renderMarkdown('- one\n- **two**');
  assert.ok(html.includes('<ul><li>one</li><li><strong>two</strong></li></ul>'));
});
