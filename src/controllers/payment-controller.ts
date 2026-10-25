import type { NextFunction, Request, Response } from 'express';
import type { CreatePaymentInput, PaymentStatus, PaymentStatusUpdate } from '../domain/payment.js';
import { PaymentService } from '../services/payment-service.js';

export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  create = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const input = request.body as CreatePaymentInput;
      const idempotencyKey = request.header('idempotency-key') as string;
      const result = await this.service.createPayment(input, idempotencyKey);
      response.status(result.replayed ? 200 : 202).json({ payment: result.payment });
    } catch (error) {
      next(error);
    }
  };

  get = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const payment = await this.service.getPayment(request.params.id as string);
      response.status(200).json({ payment });
    } catch (error) {
      next(error);
    }
  };

  list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const status = request.query.status as PaymentStatus | undefined;
      const payments = await this.service.listPayments(status);
      response.status(200).json({ payments });
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const body = request.body as PaymentStatusUpdate;
      const headerVersion = parseIfMatch(request.header('if-match'));
      const expectedVersion = body.version ?? headerVersion;
      if (expectedVersion === undefined) {
        response.status(400).json({
          error: {
            code: 'VERSION_REQUIRED',
            message: 'Provide a version field or If-Match header',
            requestId: response.locals.requestId
          }
        });
        return;
      }
      if (body.version !== undefined && headerVersion !== undefined && body.version !== headerVersion) {
        response.status(400).json({
          error: {
            code: 'VERSION_CONFLICT',
            message: 'The version field and If-Match header must match',
            requestId: response.locals.requestId
          }
        });
        return;
      }
      const payment = await this.service.updateStatus(request.params.id as string, body, expectedVersion);
      response.status(200).json({ payment });
    } catch (error) {
      next(error);
    }
  };
}

function parseIfMatch(value: string | undefined): number | undefined {
  if (!value) return undefined;
  return Number(value.replace(/^W\/?"?|"?$/g, ''));
}
