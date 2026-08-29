'use strict';

// Influencer promo code money math.
//
// discountFor() and commissionFor() are the two places where an admin-entered
// number turns into money leaving the business, so the properties pinned here
// are the ones that would be a revenue incident if they broke:
//
//   1. A discount can never exceed the order — a misconfigured flat discount
//      must clamp to zero payable, never go negative and mint credit.
//   2. maxDiscountAmount actually caps a percentage.
//   3. Commission is only ever earned on cash that actually arrived — a
//      wallet-covered ₹0 order pays the influencer nothing, on BOTH the
//      percent and the flat plan.
//
// Runs entirely in-process against the schema's methods — no DB, no network.

const test = require('node:test');
const assert = require('node:assert/strict');

const PromoCode = require('../src/models/promoCode.model');

// A non-persisted document is enough: these are pure instance methods.
const promo = (fields) => new PromoCode({
  code: 'TESTXX',
  influencerName: 'Test Influencer',
  influencerEmail: 'test@example.com',
  discountValue: 0,
  commissionValue: 0,
  ...fields,
});

test('percent discount is rounded to whole paise', () => {
  const p = promo({ discountType: 'percent', discountValue: 15 });
  assert.equal(p.discountFor(34900), 5235); // 15% of ₹349.00
});

test('percent discount honours maxDiscountAmount', () => {
  const capped = promo({ discountType: 'percent', discountValue: 50, maxDiscountAmount: 10000 });
  assert.equal(capped.discountFor(34900), 10000, 'must clamp to the ₹100 cap, not 50%');

  const uncapped = promo({ discountType: 'percent', discountValue: 50, maxDiscountAmount: 0 });
  assert.equal(uncapped.discountFor(34900), 17450, '0 means uncapped');
});

test('a flat discount larger than the order clamps to the order', () => {
  const p = promo({ discountType: 'flat', discountValue: 50000 });
  assert.equal(p.discountFor(34900), 34900, 'never more than the plan price');
  assert.ok(p.discountFor(34900) <= 34900, 'a negative payable would mint credit');
});

test('no discount on a zero or negative base', () => {
  const p = promo({ discountType: 'percent', discountValue: 50 });
  assert.equal(p.discountFor(0), 0);
  assert.equal(p.discountFor(-100), 0);
});

test('percent commission is taken on cash collected', () => {
  const p = promo({ commissionType: 'percent', commissionValue: 20 });
  assert.equal(p.commissionFor(29665), 5933); // 20% of what actually arrived
});

test('no commission is owed on a zero-cash order', () => {
  const percent = promo({ commissionType: 'percent', commissionValue: 20 });
  const flat = promo({ commissionType: 'flat', commissionValue: 5000 });

  assert.equal(percent.commissionFor(0), 0);
  // The one that would silently bleed money: a fixed fee per "sale" that
  // collected nothing, e.g. an order fully covered by wallet credit.
  assert.equal(flat.commissionFor(0), 0);
});

test('flat commission is a fixed amount per converted subscriber', () => {
  const p = promo({ commissionType: 'flat', commissionValue: 5000 });
  assert.equal(p.commissionFor(34900), 5000);
  assert.equal(p.commissionFor(100), 5000);
});
