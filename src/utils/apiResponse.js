'use strict';

/**
 * Sends a standardised success response.
 *
 * @param {import('express').Response} res
 * @param {string} message
 * @param {*}      [data=null]       - Response payload.
 * @param {number} [statusCode=200]
 * @param {object} [meta=null]       - Optional metadata (e.g. pagination).
 */
const successResponse = (res, message = 'Success', data = null, statusCode = 200, meta = null) => {
  const body = { success: true, message, data };

  if (meta) {
    body.meta = meta;
  }

  return res.status(statusCode).json(body);
};

/**
 * Sends a standardised error response.
 *
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} [statusCode=500]
 * @param {string} [code=null]        - Machine-readable error code.
 * @param {Array}  [details=null]     - Validation field errors.
 */
const errorResponse = (res, message = 'Something went wrong', statusCode = 500, code = null, details = null) => {
  const body = { success: false, message };

  if (code) body.code = code;
  if (details) body.details = details;

  return res.status(statusCode).json(body);
};

/**
 * Builds a pagination meta object for list endpoints.
 *
 * @param {number} page
 * @param {number} limit
 * @param {number} total - Total documents matching the query.
 * @returns {object}
 */
const paginationMeta = (page, limit, total) => ({
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  },
});

module.exports = { successResponse, errorResponse, paginationMeta };
