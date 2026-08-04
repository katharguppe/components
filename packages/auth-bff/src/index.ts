/**
 * Auth BFF Service Entry Point
 * Starts the Express server and initializes database connection
 */

import { createApp } from './app';
import { getConfig } from './config';

const config = getConfig();
const app = createApp();

const PORT = config.app.port;

/**
 * Start the server
 */
async function startServer() {
  try {
    // Start listening
    const server = app.listen(PORT, () => undefined);

    // Graceful shutdown handler
    const shutdown = async (_signal: string) => {
      server.close(async () => {
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', () => {
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', () => {
      process.exit(1);
    });

  } catch (error) {
    process.exit(1);
  }
}

startServer();

export { app };
