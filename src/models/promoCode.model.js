'use strict';

const mongoose = require('mongoose');

// An influencer's marketing code. Deliberately NOT modelled on top of
// Referral/User.referralCode, because the two solve opposite problems:
//
//   Referral code  — owned by a User, shared 1:1, pays the SHARER a wallet
//                    reward, no discount for the person who uses it.
//   Promo code     — owned by an external influencer with no account at all,
//                    BROADCAST publicly, discounts the BUYER, and accrues a
//                    cash commission settled off-platform.
//
// Because a promo code is broadcast rather than passed friend-to-friend, the
// liability it creates is unbounded by construction. `usageLimit`,
// `expiresAt` and `maxDiscountAmount` are the three caps that bound it, and
// they are the reason this is a real model rather than a field on User.

const DISCOUNT_TYPES = Object.freeze(['percent', 'flat']);
const COMMISSION_TYPES = Object.freeze(['percent', 'flat']);

const promoCodeSchema = new mongoose.Schema(
  {
    // The shareable string. Uppercased on write and matched uppercased on
    // read, so codes are effectively case-insensitive to whoever types them.
    code: {
      type: String,
      required: [true, 'Promo code is required.'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    // The influencer. An identity, not an account — they never log in.
    // Email is the admin-facing unique key ("one code per influencer"), which
    // is what makes "the code is linked to their email" true at the database
    // level rather than by convention.
    influencerName: { type: String, required: [true, 'Influencer name is required.'], trim: true },
    influencerEmail: {
      type: String,
      required: [true, 'Influencer email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    influencerPhone: { type: String, trim: true, default: null },
    notes: { type: String, trim: true, default: '' },

    // ── Buyer perk ──────────────────────────────────────────────────────────
    // percent: `discountValue` is 1-100, capped in absolute terms by
    //          `maxDiscountAmount` (0 = uncapped).
    // flat:    `discountValue` is an amount in the smallest currency unit,
    //          matching every other money field in this codebase (paise).
    discountType: {
      type: String,
      enum: { values: DISCOUNT_TYPES, message: 'Invalid discount type.' },
      default: 'percent',
    },
    discountValue: { type: Number, required: true, min: 0 },
    maxDiscountAmount: { type: Number, default: 0, min: 0 }, // paise, 0 = uncapped

    // ── Influencer commission ───────────────────────────────────────────────
    // percent: share of the CASH actually collected on the order (never of
    //          list price — commission on money that never arrived is a
    //          liability invented out of nothing).
    // flat:    a fixed amount per converted subscriber.
    commissionType: {
      type: String,
      enum: { values: COMMISSION_TYPES, message: 'Invalid commission type.' },
      default: 'percent',
    },
    commissionValue: { type: Number, required: true, min: 0 },

    // ── Caps ────────────────────────────────────────────────────────────────
    usageLimit: { type: Number, default: 0, min: 0 }, // 0 = unlimited signups
    // Signups attributed so far. Denormalized from User.promoCode the same
    // way User.walletBalance is denormalized from WalletTransaction — the
    // User collection stays the source of truth, this is the fast-read cache
    // the limit check reads under contention.
    usageCount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, default: null }, // null = never expires

    isActive: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Drives the admin list's default sort and the "usable right now?" lookup.
promoCodeSchema.index({ isActive: 1, createdAt: -1 });

/**
 * Discount this code grants against `baseAmount`, in the smallest currency
 * unit. Pure and synchronous so both the order-creation path and the admin
 * preview can call it without a round-trip.
 *
 * Clamped to `baseAmount` so a misconfigured code (₹500 flat off a ₹349 plan)
 * can only ever reach zero, never turn the order negative and mint credit.
 */
promoCodeSchema.methods.discountFor = function discountFor(baseAmount) {
  if (!(baseAmount > 0)) return 0;

  const raw =
    this.discountType === 'percent'
      ? Math.round((baseAmount * this.discountValue) / 100)
      : this.discountValue;

  const capped = this.maxDiscountAmount > 0 ? Math.min(raw, this.maxDiscountAmount) : raw;
  return Math.max(0, Math.min(capped, baseAmount));
};

/**
 * Commission earned on an order that actually collected `cashPaid`.
 * A zero-cash order (fully covered by wallet/proration credit) earns nothing
 * — including on the flat plan, where paying a fixed fee for a sale that
 * banked no money is a straight loss.
 */
promoCodeSchema.methods.commissionFor = function commissionFor(cashPaid) {
  if (!(cashPaid > 0)) return 0;
  return this.commissionType === 'percent'
    ? Math.round((cashPaid * this.commissionValue) / 100)
    : this.commissionValue;
};

module.exports = mongoose.model('PromoCode', promoCodeSchema);
module.exports.DISCOUNT_TYPES = DISCOUNT_TYPES;
module.exports.COMMISSION_TYPES = COMMISSION_TYPES;
