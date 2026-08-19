'use strict';

// Rate-limit keying regression test.
//
// The general limiter was changed from per-IP to per-USER-when-authenticated.
// These tests pin the two properties that change has to hold, because getting
// either wrong is a production incident:
//
//   1. Two different users sharing ONE IP must NOT share a budget.
//      (The CGNAT case this change exists for.)
//   2. Anonymous traffic must STILL be limited per IP.
//      (Otherwise the change quietly removes throttling for logged-out abuse.)
//
// Runs entirely in-process with supertest-free plain http — no DB, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');

const { generalLimiter } = require('../src/middleware/rateLimiter.middleware');

// A tiny app that mounts ONLY the limiter, so nothing else can influence the result.
const buildApp = () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(generalLimiter);
  app.get('/probe', (_req, res) => res.json({ ok: true }));
  return app;
};

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve(server));
});

const call = (port, { token, ip }) => new Promise((resolve, reject) => {
  const headers = { 'X-Forwarded-For': ip };
  if (token) headers.Authorization = `Bearer ${token}`;
  const req = http.request(
    { host: '127.0.0.1', port, path: '/probe', method: 'GET', headers },
    (res) => {
      res.resume();
      res.on('end', () => resolve({
        status: res.statusCode,
        remaining: Number(res.headers['ratelimit-remaining']),
      }));
    }
  );
  req.on('error', reject);
  req.end();
});

const tokenFor = (sub) => jwt.sign({ sub, role: 'seafarer', type: 'access' }, 'test-only-secret');

test('two users behind ONE shared IP get independent budgets', async () => {
  const server = await listen(buildApp());
  const { port } = server.address();
  const SHARED_IP = '203.0.113.77'; // both users on the same carrier NAT address

  try {
    const a1 = await call(port, { token: tokenFor('user-aaa'), ip: SHARED_IP });
    const a2 = await call(port, { token: tokenFor('user-aaa'), ip: SHARED_IP });
    const b1 = await call(port, { token: tokenFor('user-bbb'), ip: SHARED_IP });

    assert.equal(a1.status, 200);
    assert.equal(b1.status, 200);

    // user-aaa consumed two; user-bbb must still be on its first.
    assert.ok(a2.remaining < a1.remaining, 'same user must consume from one bucket');
    assert.equal(b1.remaining, a1.remaining,
      'a different user on the SAME IP must start from a fresh budget');
  } finally {
    server.close();
  }
});

test('anonymous traffic is still limited per IP', async () => {
  const server = await listen(buildApp());
  const { port } = server.address();

  try {
    const first = await call(port, { ip: '198.51.100.5' });
    const second = await call(port, { ip: '198.51.100.5' });
    const otherIp = await call(port, { ip: '198.51.100.6' });

    assert.ok(second.remaining < first.remaining,
      'unauthenticated requests from one IP must share a bucket');
    assert.equal(otherIp.remaining, first.remaining,
      'a different IP must get its own bucket');
  } finally {
    server.close();
  }
});

test('a malformed bearer token falls back to IP keying rather than erroring', async () => {
  const server = await listen(buildApp());
  const { port } = server.address();

  try {
    const r1 = await call(port, { token: 'not.a.jwt', ip: '198.51.100.9' });
    const r2 = await call(port, { token: 'garbage', ip: '198.51.100.9' });

    assert.equal(r1.status, 200, 'a junk token must not break the limiter');
    assert.ok(r2.remaining < r1.remaining,
      'junk-token requests from one IP must share the IP bucket');
  } finally {
    server.close();
  }
});
