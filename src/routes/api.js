const express = require('express');
const store = require('../services/conversations');
const gemini = require('../services/gemini');
const config = require('../config');
const { ratesFor } = require('../services/pricing');
const { log, sid } = require('../logger');

const router = express.Router();
router.use(express.json({ limit: '200kb' }));

const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'];
const busy = new Set(); // conversation ids with a request in flight

router.get('/meta', (req, res) => {
  res.json({ model: config.model, rates: ratesFor(config.model), compactAtTokens: config.compactAtTokens, openrouter: Boolean(config.openrouterKey) });
});

router.get('/conversations', (req, res) => res.json(store.list()));

router.post('/conversations', (req, res) => res.status(201).json(store.create()));

router.get('/conversations/:id', (req, res) => {
  const conv = store.get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  res.json(conv);
});

router.delete('/conversations/:id', (req, res) => {
  store.remove(req.params.id);
  res.status(204).end();
});

// Streams the reply as server-sent events: text, done, compacted, error.
router.post('/conversations/:id/messages', async (req, res) => {
  const conv = store.get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message is empty.' });
  if (busy.has(conv.id)) return res.status(409).json({ error: 'Still answering the last message.' });

  const { thinking, brief, fallback } = req.body.settings || {};
  if (THINKING_LEVELS.includes(thinking)) conv.settings.thinking = thinking;
  if (typeof brief === 'boolean') conv.settings.brief = brief;
  if (['gemini', 'openrouter'].includes(fallback)) conv.settings.fallback = fallback;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });

  busy.add(conv.id);
  try {
    const result = await gemini.send(conv, text, {
      signal: controller.signal,
      onText: (t) => emit('text', t),
      source: 'modern',
    });
    emit('done', { ...result, title: conv.title, totals: conv.totals });

    if (await gemini.compactIfNeeded(conv).catch(() => false)) {
      emit('compacted', { totals: conv.totals });
    }
  } catch (err) {
    if (!controller.signal.aborted) emit('error', { message: err.message });
  } finally {
    busy.delete(conv.id);
    res.end();
  }
});

module.exports = router;
