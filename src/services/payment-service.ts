import { randomUUID } from 'node:crypto';
import type { CreatePaymentInput, Payment, PaymentStatusUpdate } from '../domain/payment.js';
import { assertValidTransition } from '../domain/state-machine.js';
import type { PaymentRepository } from '../repositories/payment-repository.js';
import { ConflictError, NotFoundError, UnprocessableEntityError } from '../utils/errors.js';

export type EnqueuePayment = (payment: Payment) => Promise<void>;

export interface PaymentServiceOptions {
  now?: () => Date;
  createId?: () => string;
  enqueuePayment?: EnqueuePayment;
}

export class PaymentService {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly enqueuePayment?: EnqueuePayment;

  constructor(private readonly repository: PaymentRepository, options: PaymentServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.enqueuePayment = options.enqueuePayment;
  }

  async createPayment(input: CreatePaymentInput, idempotencyKey: string): Promise<{ payment: Payment; replayed: boolean }> {
    const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
    if (existing) return this.resolveIdempotency(existing, input);

    const timestamp = this.now().toISOString();
    const payment: Payment = {
      id: this.createId(),
      ...input,
      status: 'PENDING',
      idempotencyKey,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1
    };

    try {
      const created = await this.repository.create(payment);
      if (this.enqueuePayment) await this.enqueuePayment(created);
      return { payment: created, replayed: false };
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      const concurrent = await this.repository.findByIdempotencyKey(idempotencyKey);
      if (!concurrent) throw error;
      return this.resolveIdempotency(concurrent, input);
    }
  }

  async getPayment(id: string): Promise<Payment> {
    const payment = await this.repository.findById(id);
    if (!payment) throw new NotFoundError(`Payment ${id} not found`);
    return payment;
  }

  async listPayments(status?: Payment['status']): Promise<Payment[]> {
    return this.repository.list(status);
  }

  async updateStatus(id: string, update: PaymentStatusUpdate, expectedVersion: number): Promise<Payment> {
    const current = await this.getPayment(id);
    if (current.version !== expectedVersion) {
      throw new ConflictError('Payment version does not match the current resource', {
        expectedVersion,
        actualVersion: current.version
      });
    }
    assertValidTransition(current.status, update.status);
    const updated: Payment = {
      ...current,
      status: update.status,
      ...(update.failureReason ? { failureReason: update.failureReason } : {}),
      updatedAt: this.now().toISOString()
    };
    return this.repository.update(updated, expectedVersion);
  }

  private async resolveIdempotency(existing: Payment, input: CreatePaymentInput): Promise<{ payment: Payment; replayed: boolean }> {
    if (!samePaymentInput(existing, input)) {
      throw new UnprocessableEntityError('Idempotency key was already used with a different payload');
    }
    if (this.enqueuePayment && (existing.status === 'PENDING' || existing.status === 'PROCESSING')) {
      await this.enqueuePayment(existing);
    }
    return { payment: existing, replayed: true };
  }
}

function samePaymentInput(payment: Payment, input: CreatePaymentInput): boolean {
  return payment.amount === input.amount
    && payment.currency === input.currency
    && payment.customerId === input.customerId
    && (payment.description ?? '') === (input.description ?? '');
}
