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

// --- LaTeX ---
const stub = { renderToString: (tex, o) => `<k${o.displayMode ? ' d' : ''}>${tex}</k>` };
const withKatex = (fn) => { globalThis.katex = stub; try { fn(); } finally { delete globalThis.katex; } };

test('inline and display math go through KaTeX', () => withKatex(() => {
  assert.ok(renderMarkdown('so $x^2 < 1$ holds').includes('<k>x^2 < 1</k>'));
  assert.ok(renderMarkdown('\\(a\\)').includes('<k>a</k>'));
  assert.ok(renderMarkdown('$$\nE = mc^2\n$$').includes('<div class="math"><k d>E = mc^2</k></div>'));
  assert.ok(renderMarkdown('\\[ a+b \\]').includes('<k d>a+b</k>'));
}));
test('math survives markdown emphasis rules', () => withKatex(() => {
  assert.ok(renderMarkdown('$a*b*c$ and *it*').includes('<k>a*b*c</k> and <em>it</em>'));
}));
test('currency is not math', () => withKatex(() => {
  assert.ok(!renderMarkdown('costs $5 and $10 total').includes('<k>'));
}));
test('math inside code is left alone', () => withKatex(() => {
  const html = renderMarkdown('`$x$`\n\n```\n$$y$$\n```');
  assert.ok(!html.includes('<k'));
}));
test('without KaTeX the source is shown escaped', () => {
  const html = renderMarkdown('$a<b$');
  assert.ok(html.includes('<span class="math-raw">$a&lt;b$</span>'));
});
test('unfinished display block waits for its closer', () => {
  assert.ok(renderMarkdown('$$\n\\frac{a}{').includes('math-pending'));
});
