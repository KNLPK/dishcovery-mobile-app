/**
 * dishcovery-proxy / api/index.js
 *
 * Vercel entry for the public demo proxy (see ../../vercel.json). Every path
 * is routed here and handed to the same Express app server.js runs locally;
 * nothing is re-implemented. Hosted mode is forced on Vercel (VERCEL is set).
 *
 * The app is ready once the proto schema and the generated dataset are loaded,
 * once per instance; requests that arrive earlier wait for it.
 *
 * server.js requires '../shared/contract.ts', which Node's type stripping
 * loads locally. Vercel's build compiles that traced TypeScript file to
 * CommonJS as shared/contract.js instead, so when the .ts path is not found
 * the same request is resolved to the compiled file.
 */

const Module = require('module');

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  try {
    return resolveFilename.call(this, request, ...rest);
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND' || !request.endsWith('/shared/contract.ts')) throw err;
    return resolveFilename.call(this, request.replace(/\.ts$/, '.js'), ...rest);
  }
};

const { app, ready } = require('../server.js');

module.exports = async (req, res) => {
  try {
    await ready;
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server failed to start' }));
    return;
  }
  return app(req, res);
};
