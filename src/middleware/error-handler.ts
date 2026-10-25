import type { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  void next;
  const appError = error instanceof AppError ? error : undefined;
  const isMalformedJson = error instanceof SyntaxError && 'body' in error;
  const isPayloadTooLarge = isHttpErrorWithStatus(error, 413);
  const statusCode = appError?.statusCode ?? (isMalformedJson ? 400 : isPayloadTooLarge ? 413 : 500);
  const code = appError?.code ?? (isMalformedJson ? 'INVALID_JSON' : isPayloadTooLarge ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_SERVER_ERROR');
  const message = appError?.isOperational
    ? appError.message
    : isMalformedJson
      ? 'Request body contains invalid JSON'
      : isPayloadTooLarge
        ? 'Request body is too large'
      : 'An unexpected error occurred';
  const requestId = response.locals.requestId as string | undefined;

  if (isMalformedJson || isPayloadTooLarge) {
    logger.warn({ error: error instanceof Error ? error.message : String(error), requestId, method: request.method, path: request.originalUrl, statusCode }, 'request failed: invalid request body');
  } else {
    logger.error({ err: error, requestId, method: request.method, path: request.originalUrl, statusCode }, 'request failed');
  }

  response.status(statusCode).json({
    error: {
      code,
      message,
      ...(appError?.details ? { details: appError.details } : {}),
      requestId
    }
  });
};

function isHttpErrorWithStatus(error: unknown, status: number): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === status;
}
