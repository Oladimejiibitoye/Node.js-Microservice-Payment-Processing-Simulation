import { assertValidTransition, canTransition } from '../src/domain/state-machine.js';
import { createPaymentSchema, updatePaymentStatusSchema } from '../src/validation/payment-schemas.js';

describe('payment domain rules', () => {
  it('allows only declared status transitions', () => {
    expect(canTransition('PENDING', 'PROCESSING')).toBe(true);
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
    expect(() => assertValidTransition('COMPLETED', 'CANCELLED')).toThrow(/Invalid payment status transition/);
  });

  it('rejects unknown payment fields and invalid amounts', () => {
    const result = createPaymentSchema.validate({ amount: 0, currency: 'USD', customerId: 'c1', extra: true }, { abortEarly: false });
    expect(result.error).toBeDefined();
    expect(result.error?.details.map((detail) => detail.type)).toEqual(expect.arrayContaining(['number.min', 'object.unknown']));
  });

  it('requires a failure reason for failed status updates', () => {
    expect(updatePaymentStatusSchema.validate({ status: 'FAILED' }).error).toBeDefined();
    expect(updatePaymentStatusSchema.validate({ status: 'FAILED', failureReason: 'declined' }).error).toBeUndefined();
  });
});
