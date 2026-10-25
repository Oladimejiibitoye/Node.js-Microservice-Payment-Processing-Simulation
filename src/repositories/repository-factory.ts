import { config } from '../config/env.js';
import { InMemoryPaymentRepository } from './in-memory-payment-repository.js';
import { JsonPaymentRepository } from './json-payment-repository.js';
import type { PaymentRepository } from './payment-repository.js';

export function createPaymentRepository(): PaymentRepository {
  if (config.storageType === 'json') {
    return new JsonPaymentRepository(config.dataFilePath);
  }
  return new InMemoryPaymentRepository();
}
