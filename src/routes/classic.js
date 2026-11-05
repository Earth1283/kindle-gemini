const express = require('express');
const store = require('../services/conversations');
const gemini = require('../services/gemini');
const { renderClassic } = require('../views/classic');

const router = express.Router();
const ID = 'classic';

router.get('/', (req, res) => {
  res.send(renderClassic(store.getOrCreate(ID).messages, null));
});

router.post('/', async (req, res) => {
  const text = (req.body.msg || '').trim();
  if (!text) return res.redirect('/');

  const conv = store.getOrCreate(ID);
  let error = null;
  try {
    await gemini.send(conv, text, { plain: true });
    await gemini.compactIfNeeded(conv).catch(() => {});
  } catch (err) {
    error = err.message;
  }
  res.send(renderClassic(conv.messages, error));
});

router.post('/clear', (req, res) => {
  store.clear(store.getOrCreate(ID));
  res.redirect('/');
});

module.exports = router;
