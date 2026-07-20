'use strict';

const REGIONS = Object.freeze(['india', 'global']);
const CURRENCY_BY_REGION = Object.freeze({ india: 'INR', global: 'USD' });

/**
 * Resolves which pricing region a user should be charged under. India-country
 * users get the India/INR bucket; everyone else (including missing/unrecognized
 * country values) falls back to Global/USD.
 *
 * @param {{ country?: string }} user
 * @returns {'india'|'global'}
 */
const resolveRegion = (user) => {
  const country = (user?.country || '').trim().toLowerCase();
  return country === 'india' ? 'india' : 'global';
};

module.exports = { REGIONS, CURRENCY_BY_REGION, resolveRegion };
