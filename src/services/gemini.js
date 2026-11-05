const { GoogleGenAI, ThinkingLevel } = require('@google/genai');
const config = require('../config');
const store = require('./conversations');
const { normalizeUsage, costOf } = require('./pricing');
const openrouter = require('./openrouter');
const { log, fmt, c, sid } = require('../logger');

const ai = new GoogleGenAI({ apiKey: config.apiKey });

const PLAIN_TEXT =
  'Respond in plain text only. Do not use markdown formatting unless told later in the prompt - no asterisks, no headers, no bullet dashes, no backticks, no bold or italic syntax. Your responses can be as unhinged as you want. Answer in the language of the prompt. Be funny, add jokes, swear, or even use profanity where apt. If you really feel the urge to type an emoji, draw some emojicons or ASCII art such as :)';
const MARKDOWN = 'You may use light Markdown (lists, code blocks, bold) where it helps readability. Write math as LaTeX: $...$ for inline and $$...$$ on its own lines for display math; never put math in code blocks unless showing source. Your responses can be as unhigned as you want. Answer in the language of the prompt. Be funny, add jokes, swear, or even use profanity where apt.You can draw some emojicons or ASCII art such as :) if you\'d like';
const BRIEF = 'Keep replies short and direct. Skip preamble and recap.';

const THINKING = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/** The SDK embeds the API's JSON error in err.message; pull out the readable part. */
function friendlyError(err) {
  const m = /got status: (\w+)\. (\{.*\})/s.exec(err.message || '');
  if (!m) return err;
  try {
    const e = JSON.parse(m[2]).error;
    return new Error(`Gemini ${e.code} ${m[1]}: ${e.message}`);
  } catch { return err; }
}

function providerOf(conv) {
  return config.normalizeProvider(conv.settings.provider ?? config.provider);
}

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
async function send(conv, text, { plain = false, onText, signal, source = 'modern' } = {}) {
  const userMsg = { role: 'user', text };
  conv.messages.push(userMsg);

  const t0 = performance.now();
  let ttft = null;
  const turn = Math.ceil(conv.messages.length / 2);
  log.info('chat', `${sid(conv.id)} turn ${turn}  ${c.dim(source)}  thinking=${c.bold(conv.settings.thinking)}${conv.settings.brief ? ' brief' : ''}  ${c.dim('→')} "${fmt.preview(text)}" ${c.dim(`(${fmt.n(text.length)} chars)`)}`, c.cyan);

  try {
    const free = providerOf(conv) === 'free';
    if (free && !openrouter.available()) throw new Error('OpenRouter free is selected but OPENROUTER_API_KEY is not set. Add it to .env and restart.');
    const model = free ? config.openrouterModel : config.model;

    let reply = '';
    let usage;
    const onPiece = (piece) => {
      if (ttft === null) ttft = performance.now() - t0;
      reply += piece;
      onText?.(piece);
    };

    if (free) {
      let u = { prompt: 0, output: 0 };
      for await (const part of openrouter.stream({
        model,
        system: systemInstruction(conv, plain),
        contents: store.buildContents(conv),
        signal,
      })) {
        if (part.text) onPiece(part.text);
        if (part.usage) u = part.usage;
      }
      usage = { prompt: u.prompt, cached: 0, fresh: u.prompt, output: u.output };
    } else {
      const stream = await ai.models.generateContentStream({
        model,
        contents: store.buildContents(conv),
        config: {
          systemInstruction: systemInstruction(conv, plain),
          thinkingConfig: thinkingConfig(conv.settings.thinking),
          abortSignal: signal,
        },
      });
      let meta;
      for await (const chunk of stream) {
        if (chunk.text) onPiece(chunk.text);
        if (chunk.usageMetadata) meta = chunk.usageMetadata;
      }
      usage = normalizeUsage(meta);
    }

    if (signal?.aborted) throw new Error('aborted');
    if (!reply.trim()) throw new Error(`${free ? 'OpenRouter' : 'Gemini'} returned an empty reply. Try again.`);

    const cost = free ? 0 : costOf(usage, model);
    conv.messages.push({ role: 'model', text: reply, usage, cost, ...(free && { model }) });

    const t = conv.totals;
    t.prompt += usage.prompt;
    t.cached += usage.cached;
    t.output += usage.output;
    t.cost += cost;
    if (conv.title === 'New chat') conv.title = text.replace(/\s+/g, ' ').slice(0, 48);
    conv.updatedAt = Date.now();
    store.save();

    const pct = usage.prompt ? Math.round((usage.cached / usage.prompt) * 100) : 0;
    const pctColor = pct >= 50 ? c.green : pct > 0 ? c.yellow : c.red;
    log.info('reply',
      `${sid(conv.id)} ${c.green('✔')} in ${c.bold(fmt.n(usage.prompt))} ${c.dim(`(${pctColor(pct + '% cached')}, ${fmt.n(usage.fresh)} new)`)}  out ${c.bold(fmt.n(usage.output))}  ${c.bold(c.green(fmt.cost(cost)))}  ${c.dim(`first token ${fmt.ms(ttft ?? 0)}, total ${fmt.ms(performance.now() - t0)}`)}`,
      c.green);
    log.debug('totals', `${sid(conv.id)} chat total ${fmt.cost(conv.totals.cost)} over ${conv.messages.length} messages`);
    return { usage, cost };
  } catch (raw) {
    const err = friendlyError(raw);
    conv.messages.pop(); // drop the unanswered user message
    if (signal?.aborted) log.warn('abort', `${sid(conv.id)} client stopped the reply after ${fmt.ms(performance.now() - t0)}`);
    else log.error('error', `${sid(conv.id)} ${err.message}`);
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
  const instruction =
    'Condense this conversation into a compact summary that preserves facts, decisions, names, numbers, code, and open questions. Write plain prose or short lists. Do not address the reader.';
  const free = providerOf(conv) === 'free' && openrouter.available();
  let summary = '';
  let cost = 0;
  if (free) {
    for await (const part of openrouter.stream({
      model: config.openrouterModel,
      system: instruction,
      contents: [{ role: 'user', parts: [{ text: `${prior}${transcript}` }] }],
    })) if (part.text) summary += part.text;
  } else {
    const res = await ai.models.generateContent({
      model: config.model,
      contents: `${prior}${transcript}`,
      config: { systemInstruction: instruction, thinkingConfig: thinkingConfig('minimal') },
    });
    summary = res.text || '';
    cost = costOf(normalizeUsage(res.usageMetadata), config.model);
  }
  summary = summary.trim();
  if (!summary) return false;
  log.info('fold', `${sid(conv.id)} compacting ${upto - conv.summarizedCount} messages (last prompt ${fmt.n(last.usage.prompt)} ≥ ${fmt.n(config.compactAtTokens)} tokens)`, c.magenta);

  conv.totals.cost += cost;
  conv.summary = summary;
  conv.summarizedCount = upto;
  store.save();
  log.info('fold', `${sid(conv.id)} ${c.magenta('summary')} ${fmt.n(summary.length)} chars, cost ${fmt.cost(cost)}`, c.magenta);
  return true;
}

module.exports = { send, compactIfNeeded };
