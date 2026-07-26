'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const xss = require('xss');
const hpp = require('hpp');

const { config } = require('./src/config');
const setupRoutes = require('./src/routes');
const errorMiddleware = require('./src/middleware/error.middleware');
const { generalLimiter } = require('./src/middleware/rateLimiter.middleware');
const { UPLOADS_ROOT } = require('./src/services/storage.service');

const app = express();

// Deployed behind a reverse proxy (Railway) that terminates TLS — without
// this, req.protocol/req.ip read the proxy's own connection instead of the
// original client's, which would make generated upload URLs come back as
// http:// even in production (browsers block that as mixed content) and
// would make the rate limiter key off the proxy's IP instead of the client's.
app.set('trust proxy', 1);

// ── Security Headers ──────────────────────────────────────────────────────────
// crossOriginResourcePolicy defaults to 'same-origin', which makes browsers
// silently refuse to render <img>/<script> tags loaded from a different
// origin (e.g. the admin panel on :5173 loading an uploaded job image served
// from the API on :5000/api.crewapply.com) — it shows as a broken image with
// no visible network error, only a CORP warning in devtools. The public
// static routes below (/uploads/profile, /uploads/company) are explicitly
// meant to be embedded from other origins, so relax this globally rather
// than per-route.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. Postman, mobile apps, curl).
      if (!origin) return callback(null, true);

      if (config.cors.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error(`CORS: origin '${origin}' is not allowed.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Response Compression ──────────────────────────────────────────────────────
// Skip compression for binary file responses (documents/images) — gzip-ing an
// already-binary file provides no benefit and breaks clients that stream the
// response straight to disk (e.g. react-native-blob-util, used internally by
// the mobile app's PDF viewer), which don't reconcile a compressed/chunked
// byte stream against the expected file contents.
app.use(compression({
  filter: (req, res) => {
    const contentType = res.getHeader('Content-Type') || '';
    if (/^(application\/pdf|image\/)/.test(contentType)) return false;
    return compression.filter(req, res);
  },
}));

// ── HTTP Request Logging ──────────────────────────────────────────────────────
if (config.isDevelopment) {
  app.use(morgan('dev'));
}

// ── Body Parsing ──────────────────────────────────────────────────────────────
// `verify` stashes the exact received bytes on req.rawBody so the payment webhook
// can HMAC-verify the signature over the ORIGINAL payload (the parsed req.body is
// later mutated by the NoSQL/XSS sanitizers below and must not be used for that).
app.use(express.json({
  limit: config.body.limit,
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: config.body.limit }));

// ── Static uploads ────────────────────────────────────────────────────────────
// Only profile photos, job listing images, promo banners, and category icons
// are safe to serve publicly (avatars and images shown across the app).
// Everything else — resumes, passports, certificates, medical, CDC, visa, and
// any admin-configured document type — is sensitive and is only reachable
// through the authenticated/short-lived-token-gated GET /user/documents/:id/file
// route (see document.controller.js).
app.use('/uploads/profile', express.static(path.join(UPLOADS_ROOT, 'profile')));
app.use('/uploads/company', express.static(path.join(UPLOADS_ROOT, 'company')));
app.use('/uploads/banners', express.static(path.join(UPLOADS_ROOT, 'banners')));
app.use('/uploads/category-icons', express.static(path.join(UPLOADS_ROOT, 'category-icons')));

// ── HTTP Parameter Pollution Prevention ──────────────────────────────────────
// Guards against duplicate query parameters (e.g. ?sort=asc&sort=desc).
app.use(hpp());

// ── NoSQL Injection Prevention ────────────────────────────────────────────────
// Strips any key that starts with '$' or contains '.' from req.body and req.params,
// preventing Mongoose operator injection attacks (e.g. { "email": { "$gt": "" } }).
// Written inline because express-mongo-sanitize is incompatible with Express 5
// (it attempts to reassign the read-only req.query getter).
app.use((req, _res, next) => {
  const sanitizeKeys = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;

    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else {
        obj[key] = sanitizeKeys(obj[key]);
      }
    }

    return obj;
  };

  if (req.body) sanitizeKeys(req.body);
  if (req.params) sanitizeKeys(req.params);
  next();
});

// ── XSS Sanitization ─────────────────────────────────────────────────────────
// Sanitizes string values in req.body to strip HTML tags and malicious scripts
// before they are stored in the database.
app.use((req, _res, next) => {
  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return;

    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        obj[key] = xss(obj[key]);
      } else if (typeof obj[key] === 'object') {
        sanitizeObject(obj[key]);
      }
    }
  };

  sanitizeObject(req.body);
  next();
});

// ── General Rate Limiter ──────────────────────────────────────────────────────
// Skip the payment webhook — Razorpay retries and must never be throttled by IP.
app.use((req, res, next) => {
  if (req.path === '/api/v1/payments/webhook') return next();
  return generalLimiter(req, res, next);
});

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'CrewApply API is running.',
    environment: config.env,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
setupRoutes(app);

// ── Centralised Error Handler ─────────────────────────────────────────────────
// Must be registered last — after all routes and other middleware.
app.use(errorMiddleware);

module.exports = app;
