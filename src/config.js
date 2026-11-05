require('dotenv').config();
const path = require('path');

/** 'gemini' = Google Gemini direct, 'free' = OpenRouter free models. */
function normalizeProvider(v) {
  return v === 'free' || v === 'openrouter' ? 'free' : 'gemini';
}

module.exports = {
  normalizeProvider,
  port: Number(process.env.PORT) || 7891,
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  // Which model answers. Default for new chats; changeable per chat in Settings.
  // 'gemini' = Google Gemini 3.5 Flash-Lite, 'free' = OpenRouter free (zero cost, needs the key).
  provider: normalizeProvider(process.env.PROVIDER),
  openrouterKey: process.env.OPENROUTER_API_KEY,
  openrouterModel: process.env.OPENROUTER_MODEL || 'openrouter/free',
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),

  // Context compaction: once the last request's prompt exceeded this many
  // tokens, fold older turns into a summary and keep only the recent ones.
  compactAtTokens: Number(process.env.COMPACT_AT_TOKENS) || 24000,
  keepRecentMessages: Number(process.env.KEEP_RECENT_MESSAGES) || 8,
};
