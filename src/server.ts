import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { createPaymentRepository } from './repositories/repository-factory.js';
import { PaymentService } from './services/payment-service.js';
import { PaymentProcessorSimulator } from './services/payment-processor-simulator.js';
import { PaymentWorker } from './workers/payment-worker.js';
import { logger } from './utils/logger.js';

const repository = createPaymentRepository();
await repository.initialize();
let worker: PaymentWorker | undefined = undefined;
const paymentService = new PaymentService(repository, {
  enqueuePayment: (payment) => {
    if (!worker) throw new Error('Payment worker is not initialized');
    return worker.enqueue(payment);
  }
});
const processor = new PaymentProcessorSimulator({
  failureRate: config.gatewayFailureRate,
  timeoutRate: config.gatewayTimeoutRate,
  permanentFailureRate: config.gatewayPermanentFailureRate,
  minLatencyMs: config.gatewayMinLatencyMs,
  maxLatencyMs: config.gatewayMaxLatencyMs
});
worker = new PaymentWorker(paymentService, repository, processor, {
  concurrency: config.workerConcurrency,
  maxQueueSize: config.queueMaxSize,
  attemptTimeoutMs: config.gatewayAttemptTimeoutMs,
  maxAttempts: config.maxProcessingAttempts,
  retryBaseDelayMs: config.retryBaseDelayMs,
  retryMaxDelayMs: config.retryMaxDelayMs,
  shutdownTimeoutMs: config.shutdownTimeoutMs
});
await worker.recover();
worker.start();
const app = createApp(paymentService);
const server = createServer(app);

server.listen(config.port, config.host, () => {
  logger.info({ host: config.host, port: config.port, environment: config.nodeEnv }, 'server listening');
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutdown requested');
  await new Promise<void>((resolve) => server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'server shutdown failed');
      process.exitCode = 1;
    }
    resolve();
  }));
  if (worker) await worker.shutdown();
  await repository.flush();
  logger.info('server shutdown complete');
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'unhandled promise rejection');
  void shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  void shutdown('uncaughtException');
});
