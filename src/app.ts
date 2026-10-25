import express from 'express';
import { config } from './config/env.js';
import { PaymentController } from './controllers/payment-controller.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestContext } from './middleware/request-context.js';
import { createPaymentRouter } from './routes/payment-routes.js';
import { createPaymentRepository } from './repositories/repository-factory.js';
import { PaymentService } from './services/payment-service.js';
import { NotFoundError } from './utils/errors.js';

export function createApp(paymentService = new PaymentService(createPaymentRepository())): express.Express {
  const app = express();
  const paymentController = new PaymentController(paymentService);

  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(express.json({ limit: config.jsonBodyLimit }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.get('/ready', (_request, response) => {
    response.status(200).json({ status: 'ready' });
  });

  app.use('/api/v1/payments', createPaymentRouter(paymentController));

  app.use((_request, _response, next) => {
    next(new NotFoundError('Route not found'));
  });
  app.use(errorHandler);

  return app;
}
