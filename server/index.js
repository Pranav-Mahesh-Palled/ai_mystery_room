import 'dotenv/config';
import { createServer } from 'node:http';
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';

const port = Number(process.env.PORT) || 5000;
const server = createServer(app);

server.listen(port, '0.0.0.0', () => {
  console.log(`AI Mystery Room API listening on port ${port}`);
  void connectDatabase().catch((error) => {
    // Connection details may contain credentials, so only log the safe message.
    console.error(`Database connection unavailable: ${error.message}`);
  });
});

async function shutDown(signal) {
  console.log(`${signal} received; shutting down gracefully.`);
  server.close(async (error) => {
    if (error) {
      console.error('HTTP server did not close cleanly.');
      process.exitCode = 1;
    }

    try {
      await disconnectDatabase();
    } catch {
      console.error('MongoDB connection did not close cleanly.');
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', () => void shutDown('SIGINT'));
process.once('SIGTERM', () => void shutDown('SIGTERM'));
