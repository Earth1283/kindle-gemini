import { renderMarkdown } from './markdown.js';

const $ = (id) => document.getElementById(id);
const els = {
  shell: $('shell'), convs: $('convs'), log: $('log'), scroll: $('scroll'), title: $('title'),
  tally: $('tally'), form: $('form'), input: $('input'), send: $('send'),
  thinking: $('thinking'), brief: $('brief'), settings: $('settings'),
};

const state = { list: [], conv: null, controller: null };

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

const fmtInt = (n) => n.toLocaleString();
function fmtCost(c) {
  if (c === 0) return '$0';
  if (c < 0.0001) return '<$0.0001';
  return '$' + c.toFixed(c < 0.01 ? 4 : 3);
}

async function api(path, opts) {
  const res = await fetch('/api' + path, opts);
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

/* ---------- Conversation list ---------- */
function renderList() {
  els.convs.replaceChildren();
  if (!state.list.length) {
    const p = document.createElement('p');
    p.className = 'none';
    p.textContent = 'No chats yet.';
    els.convs.append(p);
    return;
  }
  for (const c of state.list) {
    const row = document.createElement('div');
    row.className = 'conv';
    if (state.conv?.id === c.id) row.setAttribute('aria-current', 'true');

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'conv-open';
    const t = document.createElement('span');
    t.className = 'conv-title';
    t.textContent = c.title;
    const cost = document.createElement('span');
    cost.className = 'conv-cost';
    cost.textContent = fmtCost(c.totals.cost);
    open.append(t, cost);
    open.addEventListener('click', () => { openConversation(c.id); closeRail(); });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'conv-del';
    del.textContent = 'Delete';
    del.setAttribute('aria-label', `Delete chat: ${c.title}`);
    let timer;
    del.addEventListener('click', async () => {
      if (!del.classList.contains('armed')) {
        del.classList.add('armed');
        del.textContent = 'Delete?';
        timer = setTimeout(() => { del.classList.remove('armed'); del.textContent = 'Delete'; }, 3000);
        return;
      }
      clearTimeout(timer);
      await api(`/conversations/${c.id}`, { method: 'DELETE' });
      if (state.conv?.id === c.id) state.conv = null;
      await refreshList();
      if (!state.conv) await openConversation(state.list[0]?.id);
    });

    row.append(open, del);
    els.convs.append(row);
  }
}

async function refreshList() {
  state.list = await api('/conversations');
  renderList();
}

/* ---------- Log rendering ---------- */
function noteEl(text) {
  const d = document.createElement('div');
  d.className = 'note';
  d.textContent = text;
  return d;
}

function ledgerEl(usage, cost) {
  const wrap = document.createElement('div');
  wrap.className = 'ledger';
  const total = usage.cached + usage.fresh + usage.output || 1;

  const meter = document.createElement('div');
  meter.className = 'meter';
  meter.setAttribute('aria-hidden', 'true');
  for (const [cls, n] of [['seg-cached', usage.cached], ['seg-fresh', usage.fresh], ['seg-reply', usage.output]]) {
    if (!n) continue;
    const seg = document.createElement('i');
    seg.className = cls;
    seg.style.flex = `${n / total} 1 0`;
    meter.append(seg);
  }

  const legend = document.createElement('div');
  legend.className = 'legend';
  const add = (cls, text, title) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    if (title) s.title = title;
    legend.append(s);
  };
  add('cached', `cached ${fmtInt(usage.cached)}`, 'Input tokens served from cache at about a tenth of the price');
  add('fresh', `new ${fmtInt(usage.fresh)}`, 'Input tokens billed at the full input price');
  add('out', `reply ${fmtInt(usage.output)}`, 'Reply plus thinking tokens, billed at the output price');
  add('price', fmtCost(cost));

  wrap.append(meter, legend);
  return wrap;
}

function replyEl(text, usage, cost) {
  const a = document.createElement('article');
  a.className = 'reply';
  const prose = document.createElement('div');
  prose.className = 'prose';
  prose.innerHTML = renderMarkdown(text);
  a.append(prose);
  if (usage) a.append(ledgerEl(usage, cost));
  return a;
}

function foldEl() {
  const d = document.createElement('div');
  d.className = 'fold';
  const s = document.createElement('span');
  s.textContent = 'Earlier messages are now a summary, which keeps each request small.';
  d.append(s);
  return d;
}

function emptyEl() {
  const d = document.createElement('div');
  d.className = 'empty';
  d.innerHTML = '<h2>What do you want to ask?</h2><p>Under each reply, a bar shows how much of your request was served from cache and what the reply cost. Longer chats get cheaper per message as the cache fills.</p>';
  return d;
}

function renderTally() {
  const t = state.conv?.totals;
  els.tally.replaceChildren();
  if (!t || !t.prompt) return;
  const strong = document.createElement('strong');
  strong.textContent = fmtCost(t.cost);
  const pct = Math.round((t.cached / t.prompt) * 100);
  els.tally.append(strong, ` this chat, ${pct}% of input cached`);
}

function renderConversation() {
  const c = state.conv;
  els.log.replaceChildren();
  els.title.textContent = c.title;
  document.title = c.title === 'New chat' ? 'Gemini Chat' : `${c.title} — Gemini Chat`;
  els.thinking.value = c.settings.thinking;
  els.brief.checked = c.settings.brief;
  renderTally();

  if (!c.messages.length) els.log.append(emptyEl());
  c.messages.forEach((m, i) => {
    if (c.summarizedCount && i === c.summarizedCount) els.log.append(foldEl());
    els.log.append(m.role === 'user' ? noteEl(m.text) : replyEl(m.text, m.usage, m.cost));
  });
  scrollToEnd(true);
}

function scrollToEnd(instant) {
  els.scroll.scrollTo({ top: els.scroll.scrollHeight, behavior: instant ? 'instant' : 'smooth' });
}

/* ---------- Opening / creating ---------- */
async function openConversation(id) {
  if (!id) return newChat();
  try {
    state.conv = await api(`/conversations/${id}`);
  } catch {
    store.set('current', '');
    return newChat();
  }
  store.set('current', id);
  renderConversation();
  renderList();
  els.input.focus();
}

async function newChat() {
  // Reuse an empty chat instead of piling up blanks.
  const blank = state.list.find((c) => c.title === 'New chat');
  if (blank) return openConversation(blank.id);
  const conv = await api('/conversations', { method: 'POST' });
  state.conv = conv;
  store.set('current', conv.id);
  await refreshList();
  renderConversation();
  els.input.focus();
}

/* ---------- Sending ---------- */
function setStreaming(on) {
  els.send.textContent = on ? 'Stop' : 'Send';
  els.send.classList.toggle('stop', on);
  els.send.classList.toggle('primary', !on);
}

function showError(message) {
  const d = document.createElement('div');
  d.className = 'error';
  d.setAttribute('role', 'alert');
  d.textContent = message;
  els.log.append(d);
  scrollToEnd();
}

async function* readEvents(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    let end;
    while ((end = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, end);
      buf = buf.slice(end + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (event && data) yield { event, data: JSON.parse(data) };
    }
  }
}

async function sendMessage(text) {
  const conv = state.conv;
  els.log.querySelector('.empty')?.remove();
  els.log.querySelectorAll('.error').forEach((e) => e.remove());

  const note = noteEl(text);
  const reply = document.createElement('article');
  reply.className = 'reply streaming';
  const prose = document.createElement('div');
  prose.className = 'prose';
  reply.append(prose);
  els.log.append(note, reply);
  scrollToEnd();

  state.controller = new AbortController();
  setStreaming(true);

  let acc = '';
  let frame = 0;
  const paint = () => { frame = 0; prose.innerHTML = renderMarkdown(acc); scrollToEnd(true); };
  let failed = null;

  try {
    const res = await fetch(`/api/conversations/${conv.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: state.controller.signal,
      body: JSON.stringify({ text, settings: { thinking: els.thinking.value, brief: els.brief.checked } }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);

    for await (const { event, data } of readEvents(res)) {
      if (event === 'text') {
        acc += data;
        if (!frame) frame = requestAnimationFrame(paint);
      } else if (event === 'done') {
        cancelAnimationFrame(frame);
        paint();
        reply.classList.remove('streaming');
        reply.append(ledgerEl(data.usage, data.cost));
        conv.totals = data.totals;
        conv.title = data.title;
        els.title.textContent = conv.title;
        renderTally();
      } else if (event === 'compacted') {
        state.conv = await api(`/conversations/${conv.id}`);
        renderConversation();
      } else if (event === 'error') {
        failed = data.message;
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') failed = err.message;
    else failed = '';
  } finally {
    cancelAnimationFrame(frame);
    state.controller = null;
    setStreaming(false);
  }

  if (failed !== null && !reply.querySelector('.ledger')) {
    // Server discards unanswered messages, so mirror that and give the text back.
    note.remove();
    reply.remove();
    els.input.value = text;
    autosize();
    if (failed) showError(failed);
    if (!els.log.children.length) els.log.append(emptyEl());
  }
  await refreshList();
  els.input.focus();
}

/* ---------- Wiring ---------- */
function autosize() {
  els.input.style.height = 'auto';
  els.input.style.height = els.input.scrollHeight + 'px';
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (state.controller) return state.controller.abort();
  const text = els.input.value.trim();
  if (!text || !state.conv) return;
  els.input.value = '';
  autosize();
  sendMessage(text);
});

els.input.addEventListener('input', autosize);
els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    els.form.requestSubmit();
  }
});

$('new-chat').addEventListener('click', () => { newChat(); closeRail(); });
$('menu').addEventListener('click', () => els.shell.classList.add('rail-open'));
$('backdrop').addEventListener('click', closeRail);
function closeRail() { els.shell.classList.remove('rail-open'); }
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeRail(); els.settings.open = false; }
});
document.addEventListener('click', (e) => {
  if (!els.settings.contains(e.target)) els.settings.open = false;
});

await refreshList();
const saved = store.get('current');
await openConversation(state.list.find((c) => c.id === saved)?.id || state.list[0]?.id);
