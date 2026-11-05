const { log, fmt, c } = require('../logger');

function client(req) {
  const ua = req.headers['user-agent'] || '';
  const kind = /kindle|silk/i.test(ua) ? c.magenta('kindle')
    : /mobile|iphone|android/i.test(ua) ? 'mobile'
    : /firefox|chrome|safari|edg/i.test(ua) ? 'desktop' : 'other';
  const ip = (req.ip || '').replace('::ffff:', '').replace('::1', 'localhost');
  return `${ip} ${c.dim(kind)}`;
}

/** One line per request, printed when the response finishes. */
module.exports = function requestLog(req, res, next) {
  const t0 = performance.now();
  res.on('close', () => {
    const url = req.originalUrl.split('?')[0];
    const isStatic = /^\/modern\/.+\.(css|js|map|ico)$/.test(url);
    const line = `${c.bold(req.method.padEnd(6))} ${url}  ${fmt.status(res.statusCode)}  ${c.dim(fmt.ms(performance.now() - t0))}  ${c.dim(client(req))}`;
    // Static assets and the polling-ish list endpoint are debug-level noise.
    if (isStatic || (req.method === 'GET' && url === '/api/conversations')) log.debug('http', line);
    else log.info('http', line, c.gray);
  });
  next();
};
