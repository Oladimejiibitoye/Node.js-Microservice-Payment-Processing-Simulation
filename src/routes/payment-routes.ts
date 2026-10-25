import { Router } from 'express';
import { PaymentController } from '../controllers/payment-controller.js';
import { validate } from '../middleware/validate.js';
import { createPaymentSchema, updatePaymentStatusSchema } from '../validation/payment-schemas.js';
import { idempotencyHeadersSchema, ifMatchHeadersSchema, listPaymentsQuerySchema, paymentIdParamsSchema } from '../validation/request-schemas.js';

export function createPaymentRouter(controller: PaymentController): Router {
  const router = Router();
  router.post('/', validate(idempotencyHeadersSchema, 'headers'), validate(createPaymentSchema, 'body'), controller.create);
  router.get('/', validate(listPaymentsQuerySchema, 'query'), controller.list);
  router.get('/:id', validate(paymentIdParamsSchema, 'params'), controller.get);
  router.patch('/:id/status', validate(paymentIdParamsSchema, 'params'), validate(ifMatchHeadersSchema, 'headers'), validate(updatePaymentStatusSchema, 'body'), controller.updateStatus);
  return router;
}
