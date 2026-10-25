import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Payment, PaymentStatus } from '../domain/payment.js';
import { ConflictError, NotFoundError, ServiceUnavailableError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { AsyncMutex } from './mutex.js';
import type { PaymentRepository } from './payment-repository.js';

interface StorageDocument {
  payments: Payment[];
}

export class JsonPaymentRepository implements PaymentRepository {
  private payments = new Map<string, Payment>();
  private readonly mutex = new AsyncMutex();
  private initialized = false;

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      try {
        await mkdir(dirname(this.filePath), { recursive: true });
        let document: StorageDocument = { payments: [] };
        try {
          const raw = await readFile(this.filePath, 'utf8');
          document = JSON.parse(raw) as StorageDocument;
        } catch (error) {
          if (!isFileMissing(error)) throw error;
        }
        if (!document || !Array.isArray(document.payments)) {
          throw new Error('Storage document must contain a payments array');
        }
        this.payments = new Map(document.payments.map((payment) => [payment.id, payment]));
        this.initialized = true;
      } catch (error) {
        logger.error({ err: error, filePath: this.filePath }, 'payment storage initialization failed');
        throw new ServiceUnavailableError('Payment storage could not be initialized');
      }
    });
  }

  async create(payment: Payment): Promise<Payment> {
    return this.mutate(async () => {
      if (this.payments.has(payment.id)) throw new ConflictError(`Payment ${payment.id} already exists`);
      if ([...this.payments.values()].some((existing) => existing.idempotencyKey === payment.idempotencyKey)) {
        throw new ConflictError('Idempotency key already exists');
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
    const payment = [...this.payments.values()].find((candidate) => candidate.idempotencyKey === key);
    return payment ? structuredClone(payment) : undefined;
  }

  async update(payment: Payment, expectedVersion: number): Promise<Payment> {
    return this.mutate(async () => {
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
    if (!this.initialized) return;
    await this.mutex.runExclusive(() => this.writeToDisk());
  }

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.initialized) throw new ServiceUnavailableError('Payment storage is not initialized');
    return this.mutex.runExclusive(async () => {
      const before = new Map(this.payments);
      try {
        const result = await operation();
        await this.writeToDisk();
        return result;
      } catch (error) {
        this.payments = before;
        throw error;
      }
    });
  }

  private async writeToDisk(): Promise<void> {
    try {
      const temporaryPath = `${this.filePath}.tmp`;
      const document: StorageDocument = { payments: [...this.payments.values()] };
      await writeFile(temporaryPath, JSON.stringify(document, null, 2), 'utf8');
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      logger.error({ err: error, filePath: this.filePath }, 'payment storage write failed');
      throw new ServiceUnavailableError('Payment storage could not be written');
    }
  }
}

function isFileMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
