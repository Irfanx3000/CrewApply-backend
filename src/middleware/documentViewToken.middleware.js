'use strict';

const { verifyDocumentViewToken } = require('../services/token.service');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

/**
 * Gates GET /user/documents/:id/file. Deliberately NOT the normal `authenticate`
 * middleware — this route is opened by native "view externally" flows
 * (Linking.openURL, <Image source={{uri}}>) that can't attach a custom
 * Authorization header, so the short-lived, single-document-scoped token is
 * passed as a query param instead. Confirms the token's docId matches the
 * requested :id before letting the request through.
 */
const requireDocumentViewToken = (req, res, next) => {
  const token = req.query.token;
  if (!token) {
    throw new AppError(AUTH_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  }

  const payload = verifyDocumentViewToken(token);
  if (payload.docId !== req.params.id) {
    throw new AppError(AUTH_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  }

  req.viewUserId = payload.sub;
  next();
};

module.exports = requireDocumentViewToken;
