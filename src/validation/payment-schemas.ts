import Joi from 'joi';
import { paymentStatuses } from '../domain/payment.js';

const currencyCodes = ['AUD', 'CAD', 'EUR', 'GBP', 'JPY', 'NGN', 'USD'] as const;

export const createPaymentSchema = Joi.object({
  amount: Joi.number().integer().min(1).max(100_000_000_00).required(),
  currency: Joi.string().uppercase().valid(...currencyCodes).required(),
  description: Joi.string().trim().max(500).optional(),
  customerId: Joi.string().trim().min(1).max(128).pattern(/^[A-Za-z0-9_-]+$/).required()
}).required().unknown(false);

export const updatePaymentStatusSchema = Joi.object({
  status: Joi.string().valid(...paymentStatuses).required(),
  version: Joi.number().integer().min(1).optional(),
  failureReason: Joi.string().trim().max(500).when('status', {
    is: 'FAILED',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  })
}).required().unknown(false);

export const uuidSchema = Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required();
