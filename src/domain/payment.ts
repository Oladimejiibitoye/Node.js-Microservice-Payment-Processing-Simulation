export const paymentStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  description?: string;
  customerId: string;
  status: PaymentStatus;
  failureReason?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreatePaymentInput {
  amount: number;
  currency: string;
  description?: string;
  customerId: string;
}

export interface PaymentStatusUpdate {
  status: PaymentStatus;
  version?: number;
  failureReason?: string;
}
