'use strict';

const { emailField } = require('./auth.validation');

const inviteAdmin = [
  emailField(),
];

module.exports = { inviteAdmin };
