// Small Markdown renderer. All input is HTML-escaped, and only a limited set
// of constructs is turned into tags, so model output can never inject markup.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// LaTeX is rendered by KaTeX when it has been loaded (window.katex); otherwise,
// or if KaTeX rejects the input, the source is shown escaped. KaTeX output is
// its own sanitized markup, so it is the only HTML not produced by this file.
const mathCache = new Map();
function math(tex, display) {
  const key = (display ? 'D' : 'I') + tex;
  if (mathCache.has(key)) return mathCache.get(key);
  let html;
  const katex = globalThis.katex;
  if (katex) {
    try {
      html = katex.renderToString(tex, { displayMode: display, throwOnError: true, trust: false, strict: 'ignore', output: 'htmlAndMathml' });
    } catch { /* fall through to raw */ }
  }
  html ??= `<span class="math-raw">${esc(display ? tex : `$${tex}$`)}</span>`;
  if (mathCache.size > 500) mathCache.clear();
  mathCache.set(key, html);
  return html;
}

// Inline math. `$` follows the Pandoc rules so prices like "$5 and $10" stay text:
// no space just inside the delimiters and no digit right after the closing one.
const INLINE_MATH = [
  [/\$\$([^\n]+?)\$\$/g, true],
  [/\\\[([^\n]+?)\\\]/g, true],
  [/\\\(([^\n]+?)\\\)/g, false],
  [/(?<![\\$])\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<![\s\\])\$(?![\d$])/g, false],
];

function inline(text) {
  const saved = [];
  const stash = (html) => `\u0000${saved.push(html) - 1}\u0000`;
  let s = text.replace(/`([^`\n]+)`/g, (_, c) => stash(`<code>${esc(c)}</code>`));
  for (const [re, display] of INLINE_MATH) s = s.replace(re, (_, tex) => stash(math(tex.trim(), display)));
  s = esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => saved[i]);
}

// A display block starts a line with $$ or \[ and may span lines. Returns null
// if the line is not one (or has trailing prose, which inline handles).
// `open` means the closer has not arrived yet, as happens mid-stream.
const DISPLAY = [['$$', '$$'], ['\\[', '\\]']];
function takeDisplay(lines, i) {
  const first = lines[i].trim();
  const d = DISPLAY.find(([o]) => first.startsWith(o));
  if (!d) return null;
  const [open, close] = d;
  let buf = first.slice(open.length);
  let j = i;
  for (;;) {
    const k = buf.indexOf(close);
    if (k >= 0) {
      if (buf.slice(k + close.length).trim()) return null;
      return { tex: buf.slice(0, k).trim(), next: j + 1 };
    }
    if (++j >= lines.length) return { tex: buf, next: j, open: true };
    buf += '\n' + lines[j];
  }
}

export function renderMarkdown(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isBlockStart = (l) => /^(```|\$\$|\\\[|#{1,4}\s|>\s?|\s*[-*]\s+|\s*\d+[.)]\s+|-{3,}\s*$)/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (or end of stream while still typing)
      out.push(`<pre${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(body.join('\n'))}</code></pre>`);
    } else if (takeDisplay(lines, i)) {
      const d = takeDisplay(lines, i);
      out.push(d.open
        ? `<div class="math-pending">${esc(d.tex)}</div>`
        : `<div class="math">${math(d.tex, true)}</div>`);
      i = d.next;
    } else if (/^#{1,4}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      out.push(`<h${level + 1}>${inline(line.replace(/^#+\s+/, ''))}</h${level + 1}>`);
      i++;
    } else if (/^-{3,}\s*$/.test(line)) {
      out.push('<hr>');
      i++;
    } else if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(body.join(' '))}</blockquote>`);
    } else if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
      const items = [];
      while (i < lines.length && re.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(re, ''))}</li>`);
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
    } else if (!line.trim()) {
      i++;
    } else {
      const body = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) body.push(lines[i++]);
      if (!body.length) body.push(lines[i++]);
      out.push(`<p>${body.map(inline).join('<br>')}</p>`);
    }
  }
  return out.join('');
}
