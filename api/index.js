// Vercel entry point: the whole site is one Express app running as a serverless function.
// Static files in public/ are served directly by Vercel's CDN.
//
// The app is loaded lazily so a startup failure (a missing setting, an unreachable database
// driver) answers with a plain message and a log line, instead of crashing the function
// (FUNCTION_INVOCATION_FAILED) with no explanation. A failed start is retried on the next request.
let app = null;

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

export default async function handler(req, res) {
  try {
    app ||= import('../src/server.js').then(m => m.default);
    return (await app)(req, res);
  } catch (err) {
    app = null;
    console.error('[startup]', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(`Cocoa Caramel is temporarily unavailable. Please try again in a moment.\n\n${err?.message || err}`);
  }
}
