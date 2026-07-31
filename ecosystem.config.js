// PM2 process definition for the CrewApply API.
//
// Usage (on the server, from this directory):
//   pm2 start ecosystem.config.js --env production
//   pm2 save                 # persist the process list across reboots
//   pm2 startup              # prints (and can run) the systemd command that
//                             # makes PM2 itself start on boot
//
// After a deploy (git pull + npm install):
//   pm2 reload crewapply-api   # zero-downtime reload (cluster mode)
module.exports = {
  apps: [
    {
      name: 'crewapply-api',
      script: 'server.js',
      cwd: __dirname,
      // Single instance (fork mode), deliberately NOT cluster mode with
      // multiple workers: express-rate-limit's default store is in-memory
      // per-process, so N workers would each count requests independently —
      // the login brute-force limiter (10/15min) would effectively become
      // 10*N/15min, silently weakening it. Move to cluster mode only after
      // swapping the rate limiter to a shared store (e.g. Redis via
      // rate-limit-redis) — not needed at this traffic level yet.
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      // Restart on crash, but stop retrying if it crash-loops immediately
      // (a bad deploy shouldn't spin the CPU at 100% forever).
      max_restarts: 10,
      min_uptime: '15s',
      // PM2's own log files — separate from morgan's request logging.
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      time: true,
    },
  ],
};
