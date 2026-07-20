'use strict';

const { config } = require('../config');
const User = require('../models/user.model');

let app = null;
let attemptedInit = false;

/**
 * Lazily initialise the Firebase Admin SDK. Returns null when a service
 * account isn't configured (the app still boots — push sends become
 * silent no-ops instead of crashing the server).
 */
const getApp = () => {
  if (app) return app;
  if (attemptedInit) return null;
  attemptedInit = true;

  const { serviceAccountBase64 } = config.firebase;
  if (!serviceAccountBase64) return null;

  try {
    // firebase-admin v13+ restructured to a modular API — the classic
    // require('firebase-admin').credential.cert(...) / .messaging() no
    // longer exist on the top-level CJS export.
    // eslint-disable-next-line global-require
    const { initializeApp, cert } = require('firebase-admin/app');
    const serviceAccount = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf8'));
    app = initializeApp({ credential: cert(serviceAccount) });
    return app;
  } catch (err) {
    console.error('PushService: failed to initialise Firebase Admin:', err.message);
    return null;
  }
};

// FCM requires every value in `data` to be a string.
const stringifyData = (data) => {
  if (!data) return undefined;
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value == null ? '' : String(value)])
  );
};

/**
 * Removes device tokens that FCM reports as dead/invalid — standard token
 * hygiene so `deviceTokens` doesn't accumulate stale entries over time.
 */
const pruneDeadTokens = async (userId, deadTokens) => {
  if (!deadTokens.length) return;
  try {
    await User.updateOne({ _id: userId }, { $pull: { deviceTokens: { token: { $in: deadTokens } } } });
  } catch (err) {
    console.error('PushService: failed to prune dead tokens:', err.message);
  }
};

/**
 * Sends a push notification to every device registered for a user.
 *
 * Never throws — push failures must not interrupt the caller (this is always
 * invoked fire-and-forget from notification.service.js).
 */
const sendToUser = async (userId, { title, body, data }) => {
  try {
    const firebaseApp = getApp();
    if (!firebaseApp) return; // not configured — silent no-op

    const user = await User.findById(userId).select('+deviceTokens');
    const tokens = (user?.deviceTokens || []).map((d) => d.token);
    if (!tokens.length) return;

    // eslint-disable-next-line global-require
    const { getMessaging } = require('firebase-admin/messaging');
    const response = await getMessaging(firebaseApp).sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: stringifyData(data),
    });

    if (response.failureCount > 0) {
      const deadTokens = [];
      response.responses.forEach((result, i) => {
        const code = result.error?.code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          deadTokens.push(tokens[i]);
        }
      });
      await pruneDeadTokens(userId, deadTokens);
    }
  } catch (err) {
    console.error('PushService: failed to send push:', err.message);
  }
};

module.exports = { isConfigured: () => !!getApp(), sendToUser };
