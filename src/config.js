require('dotenv').config();
const path = require('path');

/** Accepts 'off' | 'gemini' | 'free'; 'openrouter' is the old name for 'free'. */
function normalizeFallback(v) {
  if (v === 'openrouter') return 'free';
  return ['gemini', 'free'].includes(v) ? v : 'off';
}

module.exports = {
  normalizeFallback,
  port: Number(process.env.PORT) || 7891,
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  // OpenRouter fallback, used when Google's API fails. `fallback` is the
  // default for new chats: 'off' | 'gemini' (Gemini via OpenRouter, paid) | 'free' (zero-cost models).
  openrouterKey: process.env.OPENROUTER_API_KEY,
  openrouterModels: {
    gemini: process.env.OPENROUTER_GEMINI_MODEL || 'google/gemini-3.5-flash-lite',
    free: process.env.OPENROUTER_FREE_MODEL || 'openrouter/free',
  },
  fallback: normalizeFallback(process.env.FALLBACK),
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),

  // Context compaction: once the last request's prompt exceeded this many
  // tokens, fold older turns into a summary and keep only the recent ones.
  compactAtTokens: Number(process.env.COMPACT_AT_TOKENS) || 24000,
  keepRecentMessages: Number(process.env.KEEP_RECENT_MESSAGES) || 8,
};
