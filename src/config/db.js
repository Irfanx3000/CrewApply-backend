const mongoose = require("mongoose");

// ── Connection options ────────────────────────────────────────────────────────
//
// Previously mongoose.connect(uri) with no options at all, which left three
// defaults in place that stop being appropriate as the collection grows.
//
// maxPoolSize — registered users are NOT database connections. 10-20k accounts
//   produce, at realistic mobile usage, tens of concurrent in-flight requests,
//   not thousands: most of a request's life is spent in Node, not waiting on
//   Mongo. 20 sockets comfortably covers that with headroom, and matters
//   because the API is a single process (see ecosystem.config.js) so this is a
//   per-process pool, not a per-worker one. Raising it further would mostly buy
//   idle sockets and Atlas connection-limit pressure, not throughput.
//
// minPoolSize — keeps a few sockets warm so the first request after a quiet
//   period does not pay TLS + auth handshake latency to Atlas.
//
// serverSelectionTimeoutMS — the default is 30s. A request that cannot reach
//   the database should fail in a few seconds and return a clean error, not
//   hold a socket and an event-loop continuation open for half a minute; the
//   mobile client's own timeout is 15s, so anything beyond that is time nobody
//   is waiting for.
//
// autoIndex — mongoose defaults this to TRUE, which asks MongoDB to (re)build
//   every index declared across all 24 models on every boot. Harmless at
//   today's size, a long blocking operation once collections are large, and on
//   Atlas it is billable work repeated on every restart. Disabled in production
//   only, so development keeps its convenience.
//
//   IMPORTANT CONSEQUENCE: with autoIndex off, a NEW index added to a schema
//   will not exist in production until it is created deliberately. Run
//   `Model.syncIndexes()` as a release step (or create it from the Atlas UI)
//   whenever an index is added — otherwise the query silently falls back to a
//   collection scan, which is exactly the failure this project just fixed for
//   the job-alert fan-out.
const connectionOptions = {
  maxPoolSize: 20,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 8000,
  socketTimeoutMS: 45000,
  autoIndex: process.env.NODE_ENV !== "production",
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, connectionOptions);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("MongoDB Connection Error:", error.message);

    process.exit(1);
  }
};

// The catch above only covers the INITIAL connect. A cluster that goes away
// mid-flight (failover, network partition, Atlas maintenance) emits on the
// connection itself, and with no listener attached those surfaced as unhandled
// events. Logged here so an outage is visible in the logs rather than
// appearing only as a wave of timing-out requests. Deliberately does NOT exit:
// the driver retries and reconnects on its own, and killing the process would
// turn a recoverable blip into a restart.
mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected — driver will attempt to reconnect.");
});

mongoose.connection.on("reconnected", () => {
  console.log("MongoDB reconnected.");
});

module.exports = connectDB;
