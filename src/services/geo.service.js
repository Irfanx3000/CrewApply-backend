'use strict';

// The mobile app used to bundle country-state-city's city dataset (7.7MB
// JSON, tens of MB once parsed) and parse it on-device — on low-end phones
// that parse could exceed available memory and get silently OOM-killed by
// the OS, which presented as the whole app closing with no catchable error.
// A server has no such constraint, so city lookup lives here instead: the
// mobile client now asks for just the handful of cities it needs for one
// country+state pair, and only that small slice crosses the wire.
const City = require('country-state-city/lib/cjs/city').default;

const getCitiesOfState = (countryCode, stateCode) =>
  City.getCitiesOfState(countryCode, stateCode).map((c) => ({
    value: c.name,
    label: c.name,
  }));

module.exports = { getCitiesOfState };
