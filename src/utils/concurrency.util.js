'use strict';

/**
 * Runs `worker` over `items` with at most `limit` in flight at once, and
 * NEVER rejects — a worker that throws is recorded, not propagated.
 *
 * This exists because `Promise.all(items.map(worker))` has two properties that
 * are wrong for fan-out work: it starts every task simultaneously (so a few
 * thousand users means a few thousand concurrent sockets to Firebase and the
 * mail provider, which is how you get rate-limited or run out of file
 * descriptors), and it rejects on the first failure, abandoning every task that
 * had not yet settled. For notification delivery both are unacceptable: one
 * user's dead device token must not stop the other 4,999 people from being
 * told about a job.
 *
 * Implemented as N long-lived workers pulling from a shared cursor rather than
 * as chunk-then-await-all, so a single slow send does not stall the whole
 * window — the other workers keep draining while it finishes.
 *
 * @template T
 * @param {T[]} items
 * @param {number} limit             maximum concurrent workers
 * @param {(item: T, index: number) => Promise<any>} worker
 * @returns {Promise<{ succeeded: number, failed: number, errors: Error[] }>}
 */
const mapWithConcurrency = async (items, limit, worker) => {
  const result = { succeeded: 0, failed: 0, errors: [] };
  if (!items || items.length === 0) return result;

  const size = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  const runner = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        await worker(items[index], index);
        result.succeeded += 1;
      } catch (err) {
        result.failed += 1;
        // Bounded so a total outage (every send failing) cannot turn this into
        // an unbounded array of stack traces held in memory. The count stays
        // accurate; only the retained samples are capped.
        if (result.errors.length < 10) result.errors.push(err);
      }
    }
  };

  await Promise.all(Array.from({ length: size }, runner));
  return result;
};

module.exports = { mapWithConcurrency };
