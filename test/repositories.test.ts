import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { InMemoryPaymentRepository } from '../src/repositories/in-memory-payment-repository.js';
import { JsonPaymentRepository } from '../src/repositories/json-payment-repository.js';
import type { Payment } from '../src/domain/payment.js';

function payment(): Payment {
  const now = new Date().toISOString();
  return { id: randomUUID(), amount: 100, currency: 'USD', customerId: 'customer', status: 'PENDING', idempotencyKey: randomUUID(), createdAt: now, updatedAt: now, version: 1 };
}

describe.each([
  ['memory', async () => new InMemoryPaymentRepository()],
  ['json', async () => new JsonPaymentRepository(join(await mkdtemp(join(tmpdir(), 'payments-')), 'payments.json'))]
])('%s payment repository', (_name, createRepository) => {
  it('creates, reads, updates, and protects stale versions', async () => {
    const repository = await createRepository();
    await repository.initialize();
    const original = payment();
    await repository.create(original);
    await expect(repository.create(original)).rejects.toThrow(/already exists/);
    expect(await repository.findByIdempotencyKey(original.idempotencyKey)).toMatchObject({ id: original.id });
    const updated = await repository.update({ ...original, status: 'PROCESSING' }, 1);
    expect(updated.version).toBe(2);
    await expect(repository.update({ ...updated, status: 'CANCELLED' }, 1)).rejects.toThrow(/modified/);
    expect((await repository.findById(original.id))?.status).toBe('PROCESSING');
    expect((await repository.list('PROCESSING')).length).toBe(1);
    expect((await repository.findRecoverable()).length).toBe(1);
    await expect(repository.update({ ...original, status: 'PROCESSING' }, 1)).rejects.toThrow(/modified/);
    await repository.flush();
  });
});

it('rejects updates for missing payments', async () => {
  const repository = new InMemoryPaymentRepository();
  await repository.initialize();
  await expect(repository.update(payment(), 1)).rejects.toMatchObject({ statusCode: 404 });
});

it('fails safely on corrupted JSON storage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'payments-corrupt-'));
  const filePath = join(directory, 'payments.json');
  await writeFile(filePath, '{not-json', 'utf8');
  const repository = new JsonPaymentRepository(filePath);
  await expect(repository.initialize()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', statusCode: 503 });
  await rm(directory, { recursive: true, force: true });
});
