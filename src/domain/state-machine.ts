import type { PaymentStatus } from './payment.js';
import { ConflictError } from '../utils/errors.js';

const transitions: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: ['REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: []
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return transitions[from].includes(to);
}

export function assertValidTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictError(`Invalid payment status transition from ${from} to ${to}`, { from, to });
  }
}

export function getAllowedTransitions(status: PaymentStatus): readonly PaymentStatus[] {
  return transitions[status];
}
