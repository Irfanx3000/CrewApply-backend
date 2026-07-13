'use strict';

// Simulate a Razorpay "order.paid" webhook for an existing order — so you can test
// the FULL activation path from your terminal/Postman without a real payment or the
// checkout UI. It signs the payload with RAZORPAY_WEBHOOK_SECRET exactly like Razorpay,
// then POSTs it to your webhook endpoint.
//
//   node src/scripts/simulateWebhook.js <orderId> [baseUrl]
//   e.g. node src/scripts/simulateWebhook.js order_Q1abc... http://localhost:5000
//        node src/scripts/simulateWebhook.js order_Q1abc... https://crewapply-backend-production.up.railway.app

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const mongoose = require('mongoose');

const orderId = process.argv[2];
const baseUrl = (process.argv[3] || 'http://localhost:5000').replace(/\/$/, '');

if (!orderId) {
  console.error('Usage: node src/scripts/simulateWebhook.js <orderId> [baseUrl]');
  process.exit(1);
}
const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
if (!secret) {
  console.error('RAZORPAY_WEBHOOK_SECRET is not set in .env — set it first (same value as the Razorpay dashboard).');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Payment = require('../models/payment.model');
  const payment = await Payment.findOne({ gatewayOrderId: orderId }).lean();
  await mongoose.disconnect();

  if (!payment) {
    console.error(`No Payment found for order ${orderId}. Create an order first (POST /subscription/order).`);
    process.exit(1);
  }

  // Build the exact event shape Razorpay sends. amount must match what we recorded
  // (the server asserts this — proving the amount-tamper defense).
  const event = {
    event: 'order.paid',
    payload: {
      payment: {
        entity: {
          id: `pay_sim_${crypto.randomBytes(6).toString('hex')}`,
          order_id: orderId,
          amount: payment.amount,
          currency: payment.currency,
          status: 'captured',
        },
      },
      order: { entity: { id: orderId, amount: payment.amount, status: 'paid' } },
    },
  };

  const rawBody = JSON.stringify(event);
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const res = await fetch(`${baseUrl}/api/v1/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature },
    body: rawBody,
  });
  const text = await res.text();
  console.log(`→ POST ${baseUrl}/api/v1/payments/webhook`);
  console.log(`  order: ${orderId}  amount(paise): ${payment.amount}`);
  console.log(`  HTTP ${res.status}: ${text}`);
  console.log(res.ok ? '\n✓ Webhook accepted — check GET /subscription/me (should now be active).' : '\n✗ Rejected.');
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
