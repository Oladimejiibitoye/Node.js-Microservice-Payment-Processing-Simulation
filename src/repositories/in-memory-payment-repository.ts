import type { Payment, PaymentStatus } from '../domain/payment.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';
import { AsyncMutex } from './mutex.js';
import type { PaymentRepository } from './payment-repository.js';

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly payments = new Map<string, Payment>();
  private readonly mutex = new AsyncMutex();

  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  async create(payment: Payment): Promise<Payment> {
    return this.mutex.runExclusive(async () => {
      if (this.payments.has(payment.id)) {
        throw new ConflictError(`Payment ${payment.id} already exists`);
      }
      for (const existing of this.payments.values()) {
        if (existing.idempotencyKey === payment.idempotencyKey) {
          throw new ConflictError('Idempotency key already exists');
        }
      }
      this.payments.set(payment.id, structuredClone(payment));
      return structuredClone(payment);
    });
  }

  async findById(id: string): Promise<Payment | undefined> {
    const payment = this.payments.get(id);
    return payment ? structuredClone(payment) : undefined;
  }

  async findByIdempotencyKey(key: string): Promise<Payment | undefined> {
    for (const payment of this.payments.values()) {
      if (payment.idempotencyKey === key) return structuredClone(payment);
    }
    return undefined;
  }

  async update(payment: Payment, expectedVersion: number): Promise<Payment> {
    return this.mutex.runExclusive(async () => {
      const current = this.payments.get(payment.id);
      if (!current) throw new NotFoundError(`Payment ${payment.id} not found`);
      if (current.version !== expectedVersion) {
        throw new ConflictError('Payment was modified by another request', { expectedVersion, actualVersion: current.version });
      }
      const next = { ...payment, version: expectedVersion + 1 };
      this.payments.set(payment.id, structuredClone(next));
      return structuredClone(next);
    });
  }

  async list(status?: PaymentStatus): Promise<Payment[]> {
    return [...this.payments.values()]
      .filter((payment) => !status || payment.status === status)
      .map((payment) => structuredClone(payment));
  }

  async findRecoverable(): Promise<Payment[]> {
    return (await this.list()).filter((payment) => payment.status === 'PENDING' || payment.status === 'PROCESSING');
  }

  async flush(): Promise<void> {
    return Promise.resolve();
  }
}
