const config = require('./src/config');
const app = require('./src/app');
const store = require('./src/services/conversations');
const { log, c, fmt, logFile } = require('./src/logger');
const { ratesFor } = require('./src/services/pricing');

if (!config.apiKey) {
  console.error('GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

app.listen(config.port, () => {
  const r = ratesFor(config.model);
  const row = (k, v) => `  ${c.dim(k.padEnd(11))} ${v}`;
  console.log(['',
    `  ${c.bold(c.cyan('Kindle Gemini Chat'))}`,
    row('classic', c.cyan(`http://localhost:${config.port}/`)),
    row('modern', c.cyan(`http://localhost:${config.port}/modern/`)),
    row('model', `${c.bold(config.model)} ${c.dim(`$${r.input.toFixed(2)} in / $${r.cached.toFixed(3)} cached / $${r.output.toFixed(2)} out per 1M`)}`),
    row('compaction', `at ${fmt.n(config.compactAtTokens)} prompt tokens, keeping ${config.keepRecentMessages} messages`),
    row('sessions', `${store.list().length} saved`),
    row('log file', c.dim(logFile)),
    ''].join('\n'));
  log.info('ready', `listening on :${config.port}`, c.green);
});
