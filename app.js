'use strict';

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

const app = express();

// ── Security Headers ──────────────────────────────────────────────────────────
app.use(helmet());

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
app.use(compression());

// ── HTTP Request Logging ──────────────────────────────────────────────────────
if (config.isDevelopment) {
  app.use(morgan('dev'));
}

// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: config.body.limit }));
app.use(express.urlencoded({ extended: true, limit: config.body.limit }));

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
app.use(generalLimiter);

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
