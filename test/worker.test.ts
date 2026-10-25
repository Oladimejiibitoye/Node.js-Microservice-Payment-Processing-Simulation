import { InMemoryPaymentRepository } from '../src/repositories/in-memory-payment-repository.js';
import { PaymentService } from '../src/services/payment-service.js';
import { PaymentProcessorSimulator } from '../src/services/payment-processor-simulator.js';
import { PaymentWorker, calculateBackoff } from '../src/workers/payment-worker.js';

async function waitForStatus(service: PaymentService, id: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const payment = await service.getPayment(id);
    if (payment.status !== 'PROCESSING' && payment.status !== 'PENDING') return payment.status;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('worker did not finish');
}

it('retries a transient gateway failure and then completes', async () => {
  const repository = new InMemoryPaymentRepository();
  await repository.initialize();
  const service = new PaymentService(repository);
  const created = await service.createPayment({ amount: 100, currency: 'USD', customerId: 'worker_customer' }, 'worker-key');
  const values = [0, 0, 0.5, 0, 0.99];
  const processor = new PaymentProcessorSimulator({ failureRate: 0.5, timeoutRate: 0, permanentFailureRate: 0, minLatencyMs: 0, maxLatencyMs: 0, random: () => values.shift() ?? 0.99, sleep: async () => undefined });
  const worker = new PaymentWorker(service, repository, processor, { concurrency: 1, maxQueueSize: 10, attemptTimeoutMs: 100, maxAttempts: 2, retryBaseDelayMs: 0, retryMaxDelayMs: 0, shutdownTimeoutMs: 1000, sleep: async () => undefined, random: () => 0.5 });
  await worker.enqueue(created.payment);
  worker.start();
  expect(await waitForStatus(service, created.payment.id)).toBe('COMPLETED');
  await worker.shutdown();
});

it('marks timed-out processing as failed after the attempt limit', async () => {
  const repository = new InMemoryPaymentRepository();
  await repository.initialize();
  const service = new PaymentService(repository);
  const created = await service.createPayment({ amount: 100, currency: 'USD', customerId: 'worker_customer' }, 'timeout-key');
  const processor = new PaymentProcessorSimulator({ failureRate: 0, timeoutRate: 0, permanentFailureRate: 0, minLatencyMs: 100, maxLatencyMs: 100, random: () => 0, sleep: (_milliseconds, signal) => new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) });
  const worker = new PaymentWorker(service, repository, processor, { concurrency: 1, maxQueueSize: 10, attemptTimeoutMs: 1, maxAttempts: 1, retryBaseDelayMs: 0, retryMaxDelayMs: 0, shutdownTimeoutMs: 1000, sleep: async () => undefined });
  await worker.enqueue(created.payment);
  worker.start();
  expect(await waitForStatus(service, created.payment.id)).toBe('FAILED');
  await worker.shutdown();
});

it('does not reprocess terminal payments and rejects work after shutdown', async () => {
  const repository = new InMemoryPaymentRepository();
  await repository.initialize();
  const service = new PaymentService(repository);
  const created = await service.createPayment({ amount: 100, currency: 'USD', customerId: 'worker_customer' }, 'terminal-key');
  await service.updateStatus(created.payment.id, { status: 'CANCELLED' }, 1);
  const processor = new PaymentProcessorSimulator({ failureRate: 0, timeoutRate: 0, permanentFailureRate: 0, minLatencyMs: 0, maxLatencyMs: 0, random: () => 0, sleep: async () => undefined });
  const worker = new PaymentWorker(service, repository, processor, { concurrency: 1, maxQueueSize: 1, attemptTimeoutMs: 100, maxAttempts: 1, retryBaseDelayMs: 0, retryMaxDelayMs: 0, shutdownTimeoutMs: 1000, sleep: async () => undefined });
  await worker.enqueue(created.payment);
  worker.start();
  await worker.shutdown();
  await expect(worker.enqueue(created.payment)).rejects.toMatchObject({ statusCode: 503 });
});

it('recovers pending records and dead-letters permanent gateway failures', async () => {
  const repository = new InMemoryPaymentRepository();
  await repository.initialize();
  const service = new PaymentService(repository);
  const created = await service.createPayment({ amount: 100, currency: 'USD', customerId: 'worker_customer' }, 'permanent-key');
  const processor = new PaymentProcessorSimulator({ failureRate: 1, timeoutRate: 0, permanentFailureRate: 1, minLatencyMs: 0, maxLatencyMs: 0, random: () => 0, sleep: async () => undefined });
  const worker = new PaymentWorker(service, repository, processor, { concurrency: 1, maxQueueSize: 1, attemptTimeoutMs: 100, maxAttempts: 3, retryBaseDelayMs: 0, retryMaxDelayMs: 0, shutdownTimeoutMs: 1000, sleep: async () => undefined });
  expect(await worker.recover()).toBe(1);
  worker.start();
  expect(await waitForStatus(service, created.payment.id)).toBe('FAILED');
  await worker.shutdown();
});

it('calculates bounded jittered exponential backoff', () => {
  expect(calculateBackoff(1, 100, 500, () => 0)).toBe(50);
  expect(calculateBackoff(3, 100, 500, () => 1)).toBe(500);
});
