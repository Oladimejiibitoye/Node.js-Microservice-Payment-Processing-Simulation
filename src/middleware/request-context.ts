import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const incomingId = request.header(config.requestIdHeader);
  const requestId = incomingId && requestIdPattern.test(incomingId) ? incomingId : randomUUID();

  response.setHeader('x-request-id', requestId);
  response.locals.requestId = requestId;
  const startedAt = process.hrtime.bigint();

  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info({ requestId, method: request.method, path: request.originalUrl, statusCode: response.statusCode, durationMs }, 'request completed');
  });

  next();
}
