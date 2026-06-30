'use strict';

const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

/**
 * Runs an array of express-validator validation chains and rejects the request
 * with a structured 400 error if any validation fails.
 *
 * Usage:
 *   router.post('/register', validate(authValidation.register), authController.register);
 *
 * @param {import('express-validator').ValidationChain[]} validations
 * @returns {import('express').RequestHandler}
 */
const validate = (validations) => {
  return async (req, res, next) => {
    for (const validation of validations) {
      const result = await validation.run(req);
      if (!result.isEmpty()) break;
    }

    const errors = validationResult(req);

    if (errors.isEmpty()) {
      return next();
    }

    const details = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));

    return next(
      new AppError(AUTH_MESSAGES.VALIDATION_FAILED, HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', details)
    );
  };
};

module.exports = validate;
