import rateLimit from 'express-rate-limit';

export function createGenerationRateLimiter(options = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: undefined,
    handler(_request, response) {
      response.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Mystery generation is temporarily limited. Please try again later.',
        },
      });
    },
    ...options,
  });
}

// Keep the expensive provider-backed generation route to ten requests per IP
// in a rolling fifteen-minute window. Health and gameplay routes are excluded.
export const generationRateLimiter = createGenerationRateLimiter();
