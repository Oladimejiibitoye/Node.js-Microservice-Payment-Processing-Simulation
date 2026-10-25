import 'dotenv/config';
import Joi from 'joi';

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  HOST: Joi.string().hostname().allow('0.0.0.0').default('0.0.0.0'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent').default('info'),
  REQUEST_ID_HEADER: Joi.string().pattern(/^[a-z0-9-]+$/i).default('x-request-id'),
  JSON_BODY_LIMIT: Joi.string().default('100kb'),
  STORAGE_TYPE: Joi.string().valid('memory', 'json').default('memory'),
  DATA_FILE_PATH: Joi.string().default('./payments.json'),
  WORKER_CONCURRENCY: Joi.number().integer().min(1).max(100).default(4),
  QUEUE_MAX_SIZE: Joi.number().integer().min(1).max(100_000).default(1_000),
  GATEWAY_FAILURE_RATE: Joi.number().min(0).max(1).default(0.1),
  GATEWAY_TIMEOUT_RATE: Joi.number().min(0).max(1).default(0.2),
  GATEWAY_PERMANENT_FAILURE_RATE: Joi.number().min(0).max(1).default(0.1),
  GATEWAY_MIN_LATENCY_MS: Joi.number().integer().min(0).max(60_000).default(50),
  GATEWAY_MAX_LATENCY_MS: Joi.number().integer().min(0).max(60_000).default(500),
  GATEWAY_ATTEMPT_TIMEOUT_MS: Joi.number().integer().min(1).max(120_000).default(2_000),
  MAX_PROCESSING_ATTEMPTS: Joi.number().integer().min(1).max(20).default(3),
  RETRY_BASE_DELAY_MS: Joi.number().integer().min(0).max(120_000).default(100),
  RETRY_MAX_DELAY_MS: Joi.number().integer().min(0).max(600_000).default(5_000),
  SHUTDOWN_TIMEOUT_MS: Joi.number().integer().min(1_000).max(300_000).default(30_000)
  ,CORS_ORIGINS: Joi.string().default('')
  ,RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1_000).max(86_400_000).default(60_000)
  ,RATE_LIMIT_MAX: Joi.number().integer().min(1).max(100_000).default(100)
  ,TRUST_PROXY: Joi.boolean().default(false)
}).unknown(true);

const { error, value } = envSchema.validate(process.env, {
  abortEarly: false,
  convert: true
});

if (error) {
  throw new Error(`Invalid environment configuration: ${error.message}`);
}

export const config = Object.freeze({
  nodeEnv: value.NODE_ENV as 'development' | 'test' | 'production',
  host: value.HOST as string,
  port: value.PORT as number,
  logLevel: value.LOG_LEVEL as string,
  requestIdHeader: value.REQUEST_ID_HEADER as string,
  jsonBodyLimit: value.JSON_BODY_LIMIT as string,
  storageType: value.STORAGE_TYPE as 'memory' | 'json',
  dataFilePath: value.DATA_FILE_PATH as string,
  workerConcurrency: value.WORKER_CONCURRENCY as number,
  queueMaxSize: value.QUEUE_MAX_SIZE as number,
  gatewayFailureRate: value.GATEWAY_FAILURE_RATE as number,
  gatewayTimeoutRate: value.GATEWAY_TIMEOUT_RATE as number,
  gatewayPermanentFailureRate: value.GATEWAY_PERMANENT_FAILURE_RATE as number,
  gatewayMinLatencyMs: value.GATEWAY_MIN_LATENCY_MS as number,
  gatewayMaxLatencyMs: value.GATEWAY_MAX_LATENCY_MS as number,
  gatewayAttemptTimeoutMs: value.GATEWAY_ATTEMPT_TIMEOUT_MS as number,
  maxProcessingAttempts: value.MAX_PROCESSING_ATTEMPTS as number,
  retryBaseDelayMs: value.RETRY_BASE_DELAY_MS as number,
  retryMaxDelayMs: value.RETRY_MAX_DELAY_MS as number,
  shutdownTimeoutMs: value.SHUTDOWN_TIMEOUT_MS as number
  ,corsOrigins: parseOrigins(value.CORS_ORIGINS as string)
  ,rateLimitWindowMs: value.RATE_LIMIT_WINDOW_MS as number
  ,rateLimitMax: value.RATE_LIMIT_MAX as number
  ,trustProxy: value.TRUST_PROXY as boolean
});

function parseOrigins(value: string): string[] {
  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
}
