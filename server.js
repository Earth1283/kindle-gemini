const config = require('./src/config');
const app = require('./src/app');

if (!config.apiKey) {
  console.error('GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`Kindle Gemini Chat  → http://localhost:${config.port}`);
  console.log(`Modern interface    → http://localhost:${config.port}/modern/`);
});
