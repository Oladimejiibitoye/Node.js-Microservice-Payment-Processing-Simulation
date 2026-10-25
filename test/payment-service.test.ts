import { PaymentService } from '../src/services/payment-service.js';
import { InMemoryPaymentRepository } from '../src/repositories/in-memory-payment-repository.js';

async function service(): Promise<PaymentService> {
  const repository = new InMemoryPaymentRepository();
  await repository.initialize();
  return new PaymentService(repository, {
    createId: () => '00000000-0000-4000-8000-000000000001',
    now: () => new Date('2026-01-01T00:00:00.000Z')
  });
}

it('returns the original payment for concurrent duplicate idempotency requests', async () => {
  const paymentService = await service();
  const input = { amount: 500, currency: 'USD', customerId: 'customer_1' };
  const results = await Promise.all(Array.from({ length: 5 }, () => paymentService.createPayment(input, 'same-key')));
  expect(new Set(results.map((result) => result.payment.id)).size).toBe(1);
  expect(results.filter((result) => !result.replayed)).toHaveLength(1);
});

it('rejects reuse of an idempotency key with another payload', async () => {
  const paymentService = await service();
  await paymentService.createPayment({ amount: 500, currency: 'USD', customerId: 'customer_1' }, 'same-key');
  await expect(paymentService.createPayment({ amount: 501, currency: 'USD', customerId: 'customer_1' }, 'same-key')).rejects.toMatchObject({ statusCode: 422 });
});

it('requires the expected version for status updates', async () => {
  const paymentService = await service();
  const created = await paymentService.createPayment({ amount: 500, currency: 'USD', customerId: 'customer_1' }, 'status-key');
  const updated = await paymentService.updateStatus(created.payment.id, { status: 'CANCELLED' }, 1);
  expect(updated.status).toBe('CANCELLED');
  await expect(paymentService.updateStatus(created.payment.id, { status: 'PROCESSING' }, 1)).rejects.toMatchObject({ statusCode: 409 });
});
