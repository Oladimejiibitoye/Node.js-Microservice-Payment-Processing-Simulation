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
  DATA_FILE_PATH: Joi.string().default('./payments.json')
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
  dataFilePath: value.DATA_FILE_PATH as string
});
