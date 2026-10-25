import type { Payment } from '../domain/payment.js';

export type GatewayFailureKind = 'TRANSIENT' | 'TIMEOUT' | 'PERMANENT';

export class GatewayError extends Error {
  constructor(public readonly kind: GatewayFailureKind, message: string) {
    super(message);
    this.name = 'GatewayError';
  }

  get retryable(): boolean {
    return this.kind === 'TRANSIENT' || this.kind === 'TIMEOUT';
  }
}

export interface PaymentProcessorSimulatorOptions {
  failureRate: number;
  timeoutRate: number;
  permanentFailureRate: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  random?: () => number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export class PaymentProcessorSimulator {
  private readonly random: () => number;
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;

  constructor(private readonly options: PaymentProcessorSimulatorOptions) {
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? abortableSleep;
  }

  async process(payment: Payment, signal?: AbortSignal): Promise<void> {
    const latency = randomInteger(this.options.minLatencyMs, this.options.maxLatencyMs, this.random);
    await this.sleep(latency, signal);
    const outcome = this.random();
    if (outcome >= this.options.failureRate) return;

    const failureType = this.random();
    if (failureType < this.options.timeoutRate) {
      throw new GatewayError('TIMEOUT', `Gateway timed out while processing payment ${payment.id}`);
    }
    if (failureType < this.options.timeoutRate + this.options.permanentFailureRate) {
      throw new GatewayError('PERMANENT', `Gateway rejected payment ${payment.id}`);
    }
    throw new GatewayError('TRANSIENT', `Gateway temporarily failed payment ${payment.id}`);
  }
}

export function randomInteger(minimum: number, maximum: number, random: () => number): number {
  if (maximum <= minimum) return minimum;
  return Math.floor(random() * (maximum - minimum + 1)) + minimum;
}

function abortableSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Operation aborted'));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Operation aborted'));
    }, { once: true });
  });
}
