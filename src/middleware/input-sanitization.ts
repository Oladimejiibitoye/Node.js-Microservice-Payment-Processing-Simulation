import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';

const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);

export function rejectUnsafeInput(request: Request, _response: Response, next: NextFunction): void {
  try {
    inspectValue(request.body);
    inspectValue(request.query);
    inspectValue(request.params);
    next();
  } catch (error) {
    next(error);
  }
}

function inspectValue(value: unknown): void {
  if (typeof value === 'string') {
    if (value.includes('\u0000')) {
      throw new AppError(400, 'INVALID_INPUT', 'Request contains an invalid control character');
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) inspectValue(item);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (unsafeKeys.has(key)) throw new AppError(400, 'INVALID_INPUT', 'Request contains an invalid field');
      inspectValue(child);
    }
  }
}
