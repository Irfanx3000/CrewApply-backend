'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { successResponse, paginationMeta } = require('../utils/apiResponse');
const walletService = require('../services/wallet.service');
const { HTTP_STATUS } = require('../constants/httpStatus');
const { AUTH_MESSAGES } = require('../constants/messages');

// GET /wallet — balance, quick stats, and a recent-activity preview in one
// call for the Wallet home screen.
const getWallet = asyncHandler(async (req, res) => {
  const [balance, stats, recent] = await Promise.all([
    walletService.getBalance(req.user._id),
    walletService.getStats(req.user._id),
    walletService.getHistory(req.user._id, { page: 1, limit: 5 }),
  ]);
  return successResponse(res, AUTH_MESSAGES.WALLET_FETCHED, {
    balance,
    stats,
    recentTransactions: recent.transactions,
  });
});

// GET /wallet/history — full paginated transaction list.
const getHistory = asyncHandler(async (req, res) => {
  const { transactions, page, limit, total } = await walletService.getHistory(req.user._id, req.query);
  return successResponse(
    res,
    AUTH_MESSAGES.WALLET_HISTORY_FETCHED,
    { transactions },
    HTTP_STATUS.OK,
    paginationMeta(page, limit, total)
  );
});

// GET /wallet/:id — single transaction detail.
const getTransactionById = asyncHandler(async (req, res) => {
  const transaction = await walletService.getTransactionById(req.user._id, req.params.id);
  return successResponse(res, AUTH_MESSAGES.WALLET_TRANSACTION_FETCHED, { transaction });
});

module.exports = { getWallet, getHistory, getTransactionById };
