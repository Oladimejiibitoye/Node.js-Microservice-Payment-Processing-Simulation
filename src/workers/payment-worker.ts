import type { Payment } from '../domain/payment.js';
import { PaymentService } from '../services/payment-service.js';
import { GatewayError, PaymentProcessorSimulator } from '../services/payment-processor-simulator.js';
import type { PaymentRepository } from '../repositories/payment-repository.js';
import { ConflictError, ServiceUnavailableError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface PaymentWorkerOptions {
  concurrency: number;
  maxQueueSize: number;
  attemptTimeoutMs: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  shutdownTimeoutMs: number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class PaymentWorker {
  private readonly queue: Payment[] = [];
  private readonly queuedIds = new Set<string>();
  private readonly activeIds = new Set<string>();
  private readonly random: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private running = false;
  private accepting = true;
  private idleResolvers: Array<() => void> = [];

  constructor(
    private readonly service: PaymentService,
    private readonly repository: PaymentRepository,
    private readonly processor: PaymentProcessorSimulator,
    private readonly options: PaymentWorkerOptions
  ) {
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  start(): void {
    this.running = true;
    this.pump();
  }

  async recover(): Promise<number> {
    const payments = await this.repository.findRecoverable();
    let enqueued = 0;
    for (const payment of payments) {
      if (this.tryEnqueue(payment)) enqueued += 1;
    }
    return enqueued;
  }

  async enqueue(payment: Payment): Promise<void> {
    if (!this.accepting) throw new ServiceUnavailableError('Payment worker is shutting down');
    if (!this.tryEnqueue(payment)) {
      throw new ServiceUnavailableError('Payment processing queue is full');
    }
    this.pump();
  }

  async shutdown(): Promise<void> {
    this.accepting = false;
    this.running = true;
    this.pump();
    const deadline = Date.now() + this.options.shutdownTimeoutMs;
    while (this.queue.length > 0 || this.activeIds.size > 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        logger.warn({ queued: this.queue.length, active: this.activeIds.size }, 'worker shutdown deadline reached');
        return;
      }
      await this.waitForIdle(Math.min(remaining, 100));
    }
  }

  private tryEnqueue(payment: Payment): boolean {
    if (this.queuedIds.has(payment.id) || this.activeIds.has(payment.id)) return true;
    if (this.queue.length >= this.options.maxQueueSize) return false;
    this.queue.push(payment);
    this.queuedIds.add(payment.id);
    return true;
  }

  private pump(): void {
    while (this.running && this.activeIds.size < this.options.concurrency && this.queue.length > 0) {
      const payment = this.queue.shift();
      if (!payment) break;
      this.queuedIds.delete(payment.id);
      this.activeIds.add(payment.id);
      void this.process(payment).catch((error: unknown) => {
        logger.error({ err: error, paymentId: payment.id }, 'payment worker job failed unexpectedly');
      }).finally(() => {
        this.activeIds.delete(payment.id);
        this.pump();
        if (this.queue.length === 0 && this.activeIds.size === 0) this.resolveIdle();
      });
    }
  }

  private async process(payment: Payment): Promise<void> {
    let current = await this.service.getPayment(payment.id);
    if (current.status === 'COMPLETED' || current.status === 'FAILED' || current.status === 'CANCELLED' || current.status === 'REFUNDED') return;

    if (current.status === 'PENDING') {
      try {
        current = await this.service.updateStatus(current.id, { status: 'PROCESSING' }, current.version);
      } catch (error) {
        if (error instanceof ConflictError) return;
        throw error;
      }
    }

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt += 1) {
      try {
        await this.runAttempt(current);
        const latest = await this.service.getPayment(current.id);
        if (latest.status === 'PROCESSING') await this.service.updateStatus(latest.id, { status: 'COMPLETED' }, latest.version);
        return;
      } catch (error) {
        const retryable = error instanceof GatewayError && error.retryable;
        if (!retryable || attempt === this.options.maxAttempts) {
          const latest = await this.service.getPayment(current.id);
          if (latest.status === 'PROCESSING') {
            await this.service.updateStatus(latest.id, {
              status: 'FAILED',
              failureReason: error instanceof Error ? error.message : 'Payment gateway failure'
            }, latest.version);
          }
          return;
        }
        const delay = calculateBackoff(attempt, this.options.retryBaseDelayMs, this.options.retryMaxDelayMs, this.random);
        logger.warn({ paymentId: current.id, attempt, delay, error: error instanceof Error ? error.message : String(error) }, 'retrying payment processing');
        await this.sleep(delay);
      }
    }
  }

  private async runAttempt(payment: Payment): Promise<void> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.processor.process(payment, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new GatewayError('TIMEOUT', `Payment gateway attempt timed out after ${this.options.attemptTimeoutMs}ms`));
          }, this.options.attemptTimeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private waitForIdle(timeoutMs: number): Promise<void> {
    if (this.queue.length === 0 && this.activeIds.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.idleResolvers.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private resolveIdle(): void {
    const resolvers = this.idleResolvers.splice(0);
    for (const resolve of resolvers) resolve();
  }
}

export function calculateBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number, random: () => number): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));
  return Math.floor(exponential * (0.5 + random()));
}
