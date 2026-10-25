import Joi from 'joi';
import { paymentStatuses } from '../domain/payment.js';
import { uuidSchema } from './payment-schemas.js';

export const paymentIdParamsSchema = Joi.object({ id: uuidSchema }).unknown(false);

export const idempotencyHeadersSchema = Joi.object({
  'idempotency-key': Joi.string().trim().min(1).max(255).required()
}).unknown(true);

export const ifMatchHeadersSchema = Joi.object({
  'if-match': Joi.string().pattern(/^(?:W\/)?"?\d+"?$/).optional()
}).unknown(true);

export const listPaymentsQuerySchema = Joi.object({
  status: Joi.string().valid(...paymentStatuses).optional()
}).unknown(false);
