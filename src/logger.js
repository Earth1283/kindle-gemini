// Tiny colored logger. No dependencies. Colors switch off when output is not
// a terminal or NO_COLOR is set. LOG_LEVEL=debug|info|silent (default info).
// Every line is also appended, uncolored, to LOG_FILE (default data/server.log).
const fs = require('fs');
const path = require('path');
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (open, close = 39) => (s) => (useColor ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));

const c = {
  dim: wrap(2, 22), bold: wrap(1, 22),
  red: wrap(31), green: wrap(32), yellow: wrap(33), blue: wrap(34),
  magenta: wrap(35), cyan: wrap(36), gray: wrap(90),
};

const LEVELS = { debug: 0, info: 1, silent: 9 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const logFile = process.env.LOG_FILE || path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'server.log');
let fileStream = null;
function openLogFile() {
  if (threshold >= LEVELS.silent) return;
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    // Keep one previous log: server.log.1
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_BYTES) fs.renameSync(logFile, logFile + '.1');
    fileStream = fs.createWriteStream(logFile, { flags: 'a' });
    fileStream.on('error', () => { fileStream = null; }); // never let logging crash the server
  } catch { fileStream = null; }
}
const ANSI = /\x1b\[[0-9;]*m/g;

const time = () => c.gray(new Date().toTimeString().slice(0, 8));

// Each conversation id gets a stable color so interleaved sessions are easy to follow.
const PALETTE = [c.cyan, c.magenta, c.yellow, c.green, c.blue];
const sessionColors = new Map();
function sid(id) {
  if (!sessionColors.has(id)) sessionColors.set(id, PALETTE[sessionColors.size % PALETTE.length]);
  return sessionColors.get(id)(`#${String(id).slice(0, 8)}`);
}

function emit(level, tag, tagColor, msg) {
  if (LEVELS[level] < threshold) return;
  const line = `${time()} ${tagColor(tag.padEnd(7))} ${msg}`;
  (level === 'error' ? console.error : console.log)(line);
  fileStream?.write(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${tag.padEnd(7)} ${String(msg).replace(ANSI, '')}\n`);
}

openLogFile();

const log = {
  info: (tag, msg, color = c.blue) => emit('info', tag, color, msg),
  debug: (tag, msg) => emit('debug', tag, c.gray, c.gray(msg)),
  warn: (tag, msg) => emit('info', tag, c.yellow, msg),
  error: (tag, msg) => emit('error', tag, c.red, msg),
};

const fmt = {
  n: (n) => n.toLocaleString(),
  ms: (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`),
  cost: (v) => (v < 0.0001 ? '<$0.0001' : '$' + v.toFixed(v < 0.01 ? 4 : 3)),
  preview: (s, n = 60) => {
    const one = s.replace(/\s+/g, ' ').trim();
    return one.length > n ? one.slice(0, n - 1) + '…' : one;
  },
  status: (code) => (code >= 500 ? c.red : code >= 400 ? c.yellow : code >= 300 ? c.cyan : c.green)(code),
};

module.exports = { c, log, fmt, sid, logFile };
