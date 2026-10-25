import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { RequestHandler, Response } from 'express';
import { config } from '../config/env.js';

export const securityHeaders = helmet();

export const corsPolicy = cors({
  credentials: false,
  origin: (origin, callback) => {
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'If-Match', 'Idempotency-Key', 'X-Request-Id']
});

export const apiRateLimiter: RequestHandler = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_request, response: Response) => {
    response.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        requestId: response.locals.requestId
      }
    });
  }
});
