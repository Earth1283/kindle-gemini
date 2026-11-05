const { GoogleGenAI, ThinkingLevel } = require('@google/genai');
const config = require('../config');
const store = require('./conversations');
const { normalizeUsage, costOf } = require('./pricing');

const ai = new GoogleGenAI({ apiKey: config.apiKey });

const PLAIN_TEXT =
  'Respond in plain text only. Do not use markdown formatting unless told later in the prompt - no asterisks, no headers, no bullet dashes, no backticks, no bold or italic syntax. Your responses can be as unhinged as you want. Answer in the language of the prompt. Be funny, add jokes, swear, or even use profanity where apt. If you really feel the urge to type an emoji, draw some emojicons or ASCII art such as :)';
const MARKDOWN = 'You may use light Markdown (lists, code blocks, bold) where it helps readability.';
const BRIEF = 'Keep replies short and direct. Skip preamble and recap.';

const THINKING = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

function systemInstruction(conv, plain) {
  return [plain ? PLAIN_TEXT : MARKDOWN, conv.settings.brief ? BRIEF : null].filter(Boolean).join(' ');
}

function thinkingConfig(level) {
  return { thinkingLevel: THINKING[level] || ThinkingLevel.MINIMAL };
}

/**
 * Send one user message and append the reply to the conversation.
 * `onText` receives streamed chunks. Throws (and leaves the conversation
 * unchanged) on failure or abort.
 */
async function send(conv, text, { plain = false, onText, signal } = {}) {
  const userMsg = { role: 'user', text };
  conv.messages.push(userMsg);

  try {
    const stream = await ai.models.generateContentStream({
      model: config.model,
      contents: store.buildContents(conv),
      config: {
        systemInstruction: systemInstruction(conv, plain),
        thinkingConfig: thinkingConfig(conv.settings.thinking),
        abortSignal: signal,
      },
    });

    let reply = '';
    let meta;
    for await (const chunk of stream) {
      const piece = chunk.text || '';
      if (piece) {
        reply += piece;
        onText?.(piece);
      }
      if (chunk.usageMetadata) meta = chunk.usageMetadata;
    }
    if (signal?.aborted) throw new Error('aborted');
    if (!reply.trim()) throw new Error('Gemini returned an empty reply. Try again.');

    const usage = normalizeUsage(meta);
    const cost = costOf(usage, config.model);
    conv.messages.push({ role: 'model', text: reply, usage, cost });

    const t = conv.totals;
    t.prompt += usage.prompt;
    t.cached += usage.cached;
    t.output += usage.output;
    t.cost += cost;
    if (conv.title === 'New chat') conv.title = text.replace(/\s+/g, ' ').slice(0, 48);
    conv.updatedAt = Date.now();
    store.save();
    return { usage, cost };
  } catch (err) {
    conv.messages.pop(); // drop the unanswered user message
    throw err;
  }
}

/**
 * Fold older turns into a summary when the conversation has grown large.
 * Uses the real prompt size from the last response, so no extra
 * countTokens call is needed. Returns true if it compacted.
 */
async function compactIfNeeded(conv) {
  const last = [...conv.messages].reverse().find((m) => m.usage);
  if (!last || last.usage.prompt < config.compactAtTokens) return false;

  const upto = conv.messages.length - config.keepRecentMessages;
  if (upto <= conv.summarizedCount) return false;

  const transcript = conv.messages
    .slice(conv.summarizedCount, upto)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n\n');

  const prior = conv.summary ? `Existing summary:\n${conv.summary}\n\nNew turns to fold in:\n` : '';
  const res = await ai.models.generateContent({
    model: config.model,
    contents: `${prior}${transcript}`,
    config: {
      systemInstruction:
        'Condense this conversation into a compact summary that preserves facts, decisions, names, numbers, code, and open questions. Write plain prose or short lists. Do not address the reader.',
      thinkingConfig: thinkingConfig('minimal'),
    },
  });
  const summary = (res.text || '').trim();
  if (!summary) return false;

  const usage = normalizeUsage(res.usageMetadata);
  conv.totals.cost += costOf(usage, config.model);
  conv.summary = summary;
  conv.summarizedCount = upto;
  store.save();
  return true;
}

module.exports = { send, compactIfNeeded };
