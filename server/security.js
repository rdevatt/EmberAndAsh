'use strict';

// =============================================================
// EMBER AND ASH — HTTP SECURITY
// Headers, cross-origin policy, request limits and rate limiting.
//
//   - Content-Security-Policy: only this site's own scripts, styles,
//     images and API; no framing by other sites (clickjacking).
//   - CORS: same-origin by default. Extra origins only via
//     ALLOWED_ORIGINS (comma-separated).
//   - HSTS when the request arrived over HTTPS (TRUST_PROXY makes the
//     proxy's X-Forwarded-Proto count, e.g. on Railway).
//   - Rate limits: per IP and per account name on login, registration and
//     auto-login; per session on game actions; per IP overall.
// =============================================================

const crypto = require('crypto');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",          // style="" attributes in the markup
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

// Same-origin by default; ALLOWED_ORIGINS adds trusted front-ends.
function corsPolicy() {
  const allowed = new Set(String(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Id');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(origin && allowed.has(origin) ? 204 : 403);
    next();
  };
}

// ---------------------------------------------
// Rate limiting (in memory, sliding window)
// ---------------------------------------------
// EMBER_RATE_LIMIT_SCALE multiplies every limit (tests and bots raise it).
function scale() { return Math.max(0.1, Number(process.env.EMBER_RATE_LIMIT_SCALE || 1)); }
const buckets = new Map();

function hit(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > windowMs) { b = { start: now, count: 0 }; buckets.set(key, b); }
  b.count++;
  return { ok: b.count <= Math.ceil(limit * scale()), retryAfter: Math.ceil((b.start + windowMs - now) / 1000) };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.start > 60 * 60 * 1000) buckets.delete(k);
}, 10 * 60 * 1000).unref();

function clientIp(req) { return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown'; }

function limit(name, max, windowMs, keyFn) {
  return (req, res, next) => {
    const key = `${name}:${keyFn ? keyFn(req) : clientIp(req)}`;
    const r = hit(key, max, windowMs);
    if (!r.ok) {
      res.setHeader('Retry-After', String(r.retryAfter));
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.', retryAfter: r.retryAfter });
    }
    next();
  };
}

const MIN = 60 * 1000;
const limits = {
  // Login: per IP, and per account name (slows guessing one account from many IPs).
  login: [limit('login-ip', 20, 15 * MIN), limit('login-user', 10, 15 * MIN, req => String((req.body && req.body.username) || '').toLowerCase())],
  register: [limit('register-ip', 10, 60 * MIN)],
  autoLogin: [limit('auto-ip', 60, 15 * MIN)],
  guest: [limit('guest-ip', 60, 15 * MIN)],
  account: [limit('account-ip', 20, 15 * MIN)],
  action: [limit('action-session', 240, MIN, req => req.headers['x-session-id'] || clientIp(req))],
  api: [limit('api-ip', 1200, MIN)]
};

// Session ids are UUIDs; anything else is refused before touching the database.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validSessionId(id) { return typeof id === 'string' && UUID.test(id); }

// Remember-me tokens are stored only as hashes.
function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function newToken() { return crypto.randomBytes(32).toString('base64url'); }

// Password rules for new passwords. Existing accounts keep logging in with
// whatever they set before; they are asked for the new rules only when
// they change it.
function passwordProblem(password, username) {
  if (typeof password !== 'string') return 'Password required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 200) return 'Password is too long.';
  if (username && password.toLowerCase() === String(username).toLowerCase()) return 'Password must not be your username.';
  if (/^(.)\1+$/.test(password)) return 'Password must not be one repeated character.';
  if (['password', 'password1', '12345678', '123456789', 'qwertyui', 'iloveyou', 'emberandash'].includes(password.toLowerCase())) return 'That password is too common.';
  return null;
}

// Express error handler: no stack traces or internals to the client.
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err && (err.type === 'entity.too.large')) return res.status(413).json({ error: 'Request too large.' });
  if (err && (err.type === 'entity.parse.failed')) return res.status(400).json({ error: 'Malformed JSON.' });
  console.error('[Server] Unhandled error:', err && err.message);
  res.status(500).json({ error: 'Something went wrong.' });
}

module.exports = { securityHeaders, corsPolicy, limits, validSessionId, hashToken, newToken, passwordProblem, errorHandler, _buckets: buckets };
