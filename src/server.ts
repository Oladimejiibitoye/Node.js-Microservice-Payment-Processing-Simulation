import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { createPaymentRepository } from './repositories/repository-factory.js';
import { PaymentService } from './services/payment-service.js';
import { logger } from './utils/logger.js';

const repository = createPaymentRepository();
await repository.initialize();
const app = createApp(new PaymentService(repository));
const server = createServer(app);

server.listen(config.port, config.host, () => {
  logger.info({ host: config.host, port: config.port, environment: config.nodeEnv }, 'server listening');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutdown requested');
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'server shutdown failed');
      process.exitCode = 1;
      return;
    }
    logger.info('server shutdown complete');
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'unhandled promise rejection');
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  shutdown('uncaughtException');
});
