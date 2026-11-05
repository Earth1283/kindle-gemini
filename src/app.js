const path = require('path');
const express = require('express');
const classic = require('./routes/classic');
const api = require('./routes/api');
const requestLog = require('./middleware/requestLog');

const app = express();

app.use(requestLog);

// Order matters: /api and /modern are claimed before the classic routes.
app.use('/api', api);
// KaTeX css, fonts and js are served straight from the npm package.
app.use('/vendor/katex', express.static(path.join(__dirname, '..', 'node_modules', 'katex', 'dist')));
app.use('/modern', express.static(path.join(__dirname, '..', 'public', 'modern')));
app.use(express.urlencoded({ extended: true }));
app.use('/', classic);

module.exports = app;
