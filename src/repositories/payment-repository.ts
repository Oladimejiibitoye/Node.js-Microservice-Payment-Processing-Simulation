import type { Payment, PaymentStatus } from '../domain/payment.js';

export interface PaymentRepository {
  initialize(): Promise<void>;
  create(payment: Payment): Promise<Payment>;
  findById(id: string): Promise<Payment | undefined>;
  findByIdempotencyKey(key: string): Promise<Payment | undefined>;
  update(payment: Payment, expectedVersion: number): Promise<Payment>;
  list(status?: PaymentStatus): Promise<Payment[]>;
  findRecoverable(): Promise<Payment[]>;
  flush(): Promise<void>;
}
