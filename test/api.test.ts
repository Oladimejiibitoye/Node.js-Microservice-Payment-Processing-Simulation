import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryPaymentRepository } from '../src/repositories/in-memory-payment-repository.js';
import { PaymentService } from '../src/services/payment-service.js';

async function app() {
  const repository = new InMemoryPaymentRepository();
  await repository.initialize();
  return createApp(new PaymentService(repository, { createId: () => '00000000-0000-4000-8000-000000000002' }));
}

it('supports health, create, retrieve, and status update endpoints', async () => {
  const application = await app();
  expect((await request(application).get('/health')).status).toBe(200);
  const created = await request(application)
    .post('/api/v1/payments')
    .set('Idempotency-Key', 'api-key')
    .send({ amount: 1000, currency: 'USD', customerId: 'customer_1' });
  expect(created.status).toBe(202);
  const id = created.body.payment.id;
  expect((await request(application).get(`/api/v1/payments/${id}`)).status).toBe(200);
  const updated = await request(application).patch(`/api/v1/payments/${id}/status`).send({ status: 'CANCELLED', version: 1 });
  expect(updated.status).toBe(200);
  expect(updated.body.payment.status).toBe('CANCELLED');
});

it('returns consistent errors for missing idempotency keys and invalid IDs', async () => {
  const application = await app();
  const missingKey = await request(application).post('/api/v1/payments').send({ amount: 100, currency: 'USD', customerId: 'customer_1' });
  expect(missingKey.status).toBe(400);
  expect(missingKey.body.error).toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR', requestId: expect.any(String) }));
  expect((await request(application).get('/api/v1/payments/not-a-uuid')).status).toBe(400);
});

it('returns 412-style concurrency protection as a 409 conflict', async () => {
  const application = await app();
  const created = await request(application).post('/api/v1/payments').set('Idempotency-Key', 'version-key').send({ amount: 100, currency: 'USD', customerId: 'customer_1' });
  const response = await request(application).patch(`/api/v1/payments/${created.body.payment.id}/status`).set('If-Match', '2').send({ status: 'CANCELLED' });
  expect(response.status).toBe(409);
});

it('handles list, missing versions, conflicting version sources, and not-found routes', async () => {
  const application = await app();
  const created = await request(application).post('/api/v1/payments').set('Idempotency-Key', 'edge-key').send({ amount: 100, currency: 'USD', customerId: 'customer_1' });
  const id = created.body.payment.id;
  expect((await request(application).get('/api/v1/payments?status=PENDING')).status).toBe(200);
  expect((await request(application).patch(`/api/v1/payments/${id}/status`).send({ status: 'CANCELLED' })).status).toBe(400);
  expect((await request(application).patch(`/api/v1/payments/${id}/status`).set('If-Match', '1').send({ status: 'CANCELLED', version: 2 })).status).toBe(400);
  expect((await request(application).get('/missing-route')).status).toBe(404);
});

it('rejects unsafe input before route validation', async () => {
  const application = await app();
  const response = await request(application).post('/api/v1/payments').set('Idempotency-Key', 'unsafe-key').send({ amount: 100, currency: 'USD', customerId: 'customer\u0000' });
  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe('INVALID_INPUT');
});

it('returns 413 for oversized JSON bodies', async () => {
  const application = await app();
  const response = await request(application)
    .post('/api/v1/payments')
    .set('Idempotency-Key', 'large-key')
    .send({ amount: 100, currency: 'USD', customerId: 'customer_1', description: 'x'.repeat(101 * 1024) });
  expect(response.status).toBe(413);
  expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
});
