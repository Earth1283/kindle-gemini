// USD per 1M tokens. Source: Gemini API pricing page (standard tier).
// "output" includes thinking tokens. Unknown models fall back to 3.5 Flash-Lite.
const RATES = {
  'gemini-3.5-flash-lite': { input: 0.30, cached: 0.03, output: 2.50 },
  'gemini-3.1-flash-lite': { input: 0.25, cached: 0.025, output: 1.50 },
};

function ratesFor(model) {
  return RATES[model] || RATES['gemini-3.5-flash-lite'];
}

/** Normalise the SDK's usageMetadata into the numbers we store and show. */
function normalizeUsage(meta = {}) {
  const prompt = meta.promptTokenCount || 0;
  const cached = Math.min(meta.cachedContentTokenCount || 0, prompt);
  const output = (meta.candidatesTokenCount || 0) + (meta.thoughtsTokenCount || 0);
  return { prompt, cached, fresh: prompt - cached, output };
}

function costOf(usage, model) {
  const r = ratesFor(model);
  return (usage.fresh * r.input + usage.cached * r.cached + usage.output * r.output) / 1e6;
}

module.exports = { RATES, ratesFor, normalizeUsage, costOf };
