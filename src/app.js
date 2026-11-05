const path = require('path');
const express = require('express');
const classic = require('./routes/classic');
const api = require('./routes/api');
const requestLog = require('./middleware/requestLog');

const app = express();

app.use(requestLog);

// Order matters: /api and /modern are claimed before the classic routes.
app.use('/api', api);
app.use('/modern', express.static(path.join(__dirname, '..', 'public', 'modern')));
app.use(express.urlencoded({ extended: true }));
app.use('/', classic);

module.exports = app;
