/**
 * Rate Limiting Middleware
 * Implements rate limiting per endpoint
 * Architecture Spec Section 6.4
 */

import rateLimit from 'express-rate-limit';
import { getConfig } from '../config';

const config = getConfig();

/**
 * Rate limiter for login endpoint
 * 10 requests per minute per IP
 */
export const loginRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.loginMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMITED',
    message: 'Too many login attempts. Please try again later.',
  },
  keyGenerator: (req) => {
    // Use IP address as key
    return req.ip || req.connection.remoteAddress || 'unknown';
  },
});

/**
 * Rate limiter for forgot password endpoint
 * 3 requests per hour per email
 */
export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: config.rateLimit.forgotPasswordMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMITED',
    message: 'Too many password reset requests. Please try again later.',
  },
  keyGenerator: (req) => {
    // Use email from body as key, fallback to IP
    const email = req.body?.email || req.ip;
    return `forgot-password:${email}`;
  },
  skipSuccessfulRequests: true, // Only count failed requests
});

/**
 * Rate limiter for token refresh endpoint
 * 60 requests per minute per token
 */
export const refreshRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.refreshMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMITED',
    message: 'Too many token refresh requests. Token has been revoked.',
  },
  keyGenerator: (req) => {
    // Use refresh token from cookie or body as key
    const refreshToken = req.cookies?.['refresh_token'] || (req.body as any)?.refresh_token;
    return `refresh:${refreshToken || req.ip}`;
  },
});

/**
 * Rate limiter for admin endpoints
 * 120 requests per minute per tenant
 */
export const adminRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.adminMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMITED',
    message: 'Too many admin requests. Please try again later.',
  },
  keyGenerator: (req) => {
    // Use tenant ID from request or user as key
    const tenantId = req.tenant?.id || (req as any).user?.tid || req.ip;
    return `admin:${tenantId}`;
  },
});

/**
 * General API rate limiter
 * 300 requests per minute per IP
 */
export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please try again later.',
  },
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress || 'unknown';
  },
});

export default {
  loginRateLimiter,
  forgotPasswordRateLimiter,
  refreshRateLimiter,
  adminRateLimiter,
  apiRateLimiter,
};
