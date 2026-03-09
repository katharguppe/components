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
    const server = app.listen(PORT, () => {
      console.log(`🚀 Auth BFF service running on port ${PORT}`);
      console.log(`📝 Environment: ${config.app.nodeEnv}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      
      server.close(async () => {
        console.log('HTTP server closed.');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { app };
