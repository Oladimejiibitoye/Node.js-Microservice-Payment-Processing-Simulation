import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type Joi from 'joi';
import { AppError } from '../utils/errors.js';

type ValidationTarget = 'body' | 'params' | 'query' | 'headers';

export function validate(schema: Joi.ObjectSchema, target: ValidationTarget): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(request[target], { abortEarly: false, convert: true });
    if (error) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', error.details.map((detail) => ({
        path: detail.path,
        message: detail.message,
        type: detail.type
      }))));
      return;
    }
    request[target] = value;
    next();
  };
}
