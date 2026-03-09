/**
 * Authentication Middleware
 * Validates JWT access tokens and attaches user to request
 * Architecture Spec Section 5.1
 */

import { Request, Response, NextFunction } from 'express';
import { validateAccessToken, AccessTokenPayload } from '../services/token.service';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * Middleware to authenticate requests using JWT access token
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Get token from Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      code: 'MISSING_TOKEN',
      message: 'Authorization header is required',
    });
    return;
  }

  // Check Bearer format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      code: 'INVALID_TOKEN_FORMAT',
      message: 'Authorization header must be in format: Bearer <token>',
    });
    return;
  }

  const token = parts[1];

  if (!token) {
    res.status(401).json({
      code: 'MISSING_TOKEN',
      message: 'Token is required',
    });
    return;
  }

  // Validate token
  const payload = validateAccessToken(token);

  if (!payload) {
    res.status(401).json({
      code: 'TOKEN_INVALID',
      message: 'Access token is invalid or expired',
    });
    return;
  }

  // Attach user to request
  req.user = payload;

  next();
}

/**
 * Optional authentication - attaches user if token present, but doesn't require it
 */
export function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return next();
  }

  const token = parts[1];
  
  if (!token) {
    return next();
  }
  
  const payload = validateAccessToken(token);

  if (payload) {
    req.user = payload;
  }

  next();
}

/**
 * Middleware to require specific role(s)
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        code: 'FORBIDDEN',
        message: `This operation requires one of the following roles: ${roles.join(', ')}`,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to check if user belongs to the same tenant as the resource
 */
export function requireSameTenant(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = req.user;
  const tenant = req.tenant;

  // Operators can access any tenant
  if (user?.role === 'operator') {
    return next();
  }

  // Check tenant match
  if (user && tenant && user.tid !== tenant.id) {
    res.status(403).json({
      code: 'TENANT_MISMATCH',
      message: 'You do not have access to this tenant',
    });
    return;
  }

  next();
}

export default {
  authenticate,
  optionalAuthenticate,
  requireRole,
  requireSameTenant,
};
