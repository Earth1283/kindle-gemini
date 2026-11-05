const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { log, sid } = require('../logger');

const FILE = path.join(config.dataDir, 'conversations.json');
const conversations = new Map();
let saveTimer = null;

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const c of raw) conversations.set(c.id, c);
  } catch { /* first run or unreadable file: start empty */ }
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify([...conversations.values()]));
      fs.renameSync(tmp, FILE);
    } catch (err) {
      console.error('Could not save conversations:', err.message);
    }
  }, 300);
}

function create(id = crypto.randomUUID()) {
  const now = Date.now();
  const conv = {
    id,
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    settings: { thinking: 'minimal', brief: false, fallback: config.fallback },
    messages: [],        // { role: 'user'|'model', text, usage?, cost? }
    summary: null,       // text standing in for messages[0..summarizedCount)
    summarizedCount: 0,
    totals: { prompt: 0, cached: 0, output: 0, cost: 0 },
  };
  conversations.set(id, conv);
  save();
  log.info('session', `${sid(id)} created`, require('../logger').c.blue);
  return conv;
}

const get = (id) => conversations.get(id);
const getOrCreate = (id) => get(id) || create(id);

function remove(id) {
  const ok = conversations.delete(id);
  if (ok) { save(); log.info('session', `${sid(id)} deleted`, require('../logger').c.red); }
  return ok;
}

function list() {
  return [...conversations.values()]
    .filter((c) => c.id !== 'classic')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ id, title, updatedAt, totals }) => ({ id, title, updatedAt, totals }));
}

function clear(conv) {
  conv.messages = [];
  conv.summary = null;
  conv.summarizedCount = 0;
  conv.totals = { prompt: 0, cached: 0, output: 0, cost: 0 };
  conv.updatedAt = Date.now();
  save();
  log.info('session', `${sid(conv.id)} cleared`, require('../logger').c.yellow);
}

/**
 * Build the `contents` array sent to Gemini. History is append-only between
 * compactions, so every request starts with the previous request's exact
 * bytes. That stable prefix is what lets Gemini's implicit cache hit.
 */
function buildContents(conv) {
  const contents = [];
  if (conv.summary) {
    contents.push(
      { role: 'user', parts: [{ text: `Summary of our earlier conversation:\n${conv.summary}` }] },
      { role: 'model', parts: [{ text: 'Understood. I will continue from there.' }] },
    );
  }
  for (const m of conv.messages.slice(conv.summarizedCount)) {
    contents.push({ role: m.role, parts: [{ text: m.text }] });
  }
  return contents;
}

load();
module.exports = { create, get, getOrCreate, remove, list, clear, save, buildContents };
