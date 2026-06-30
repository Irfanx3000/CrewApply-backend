'use strict';

const ROLES = Object.freeze({
  USER: 'user',
  EMPLOYER: 'employer',
  ADMIN: 'admin',
});

const ALL_ROLES = Object.values(ROLES);

module.exports = { ROLES, ALL_ROLES };
