'use strict';

require('dotenv').config();

const { validateEnv, config } = require('./src/config');
const app = require('./app');
const connectDB = require('./src/config/db');

const startServer = async () => {
  try {
    // Fail fast if any required environment variable is missing.
    validateEnv();

    await connectDB();

    app.listen(config.port, () => {
      console.log('===========================================');
      console.log(`  CrewApply API`);
      console.log(`  Port        : ${config.port}`);
      console.log(`  Environment : ${config.env}`);
      console.log('===========================================');
    });
  } catch (error) {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  }
};

startServer();
