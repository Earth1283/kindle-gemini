require('dotenv').config();
const path = require('path');

module.exports = {
  port: Number(process.env.PORT) || 7891,
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  // OpenRouter: optional fallback. `fallback` is the default for new chats:
  // 'gemini' = stay on Gemini, 'openrouter' = switch to the free model if Gemini fails.
  openrouterKey: process.env.OPENROUTER_API_KEY,
  openrouterModel: process.env.OPENROUTER_MODEL || 'openrouter/free',
  fallback: process.env.FALLBACK === 'openrouter' ? 'openrouter' : 'gemini',
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),

  // Context compaction: once the last request's prompt exceeded this many
  // tokens, fold older turns into a summary and keep only the recent ones.
  compactAtTokens: Number(process.env.COMPACT_AT_TOKENS) || 24000,
  keepRecentMessages: Number(process.env.KEEP_RECENT_MESSAGES) || 8,
};
