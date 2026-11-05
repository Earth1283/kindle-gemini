const config = require('../config');

const URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Gemini-style contents -> OpenAI-style messages. */
function toMessages(system, contents) {
  return [
    { role: 'system', content: system },
    ...contents.map((c) => ({
      role: c.role === 'model' ? 'assistant' : 'user',
      content: c.parts.map((p) => p.text).join(''),
    })),
  ];
}

/**
 * Stream a reply from OpenRouter. Yields { text } chunks and a final
 * { usage } with prompt/output token counts. `usage.cost` is the real USD charge (0 for free models).
 */
async function* stream({ model, system, contents, signal }) {
  const res = await fetch(URL, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${config.openrouterKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'kindle-gemini',
    },
    body: JSON.stringify({
      model,
      messages: toMessages(system, contents),
      stream: true,
      usage: { include: true },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`OpenRouter ${res.status}: ${body.error?.message || res.statusText}`);
  }

  const decoder = new TextDecoder();
  let buf = '';
  for await (const part of res.body) {
    buf += decoder.decode(part, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      if (j.error) throw new Error(`OpenRouter: ${j.error.message || 'stream error'}`);
      const text = j.choices?.[0]?.delta?.content;
      if (text) yield { text };
      if (j.usage) yield { usage: { prompt: j.usage.prompt_tokens || 0, output: j.usage.completion_tokens || 0, cost: j.usage.cost || 0 } };
    }
  }
}

module.exports = { stream, available: () => Boolean(config.openrouterKey) };
