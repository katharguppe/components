/**
 * Tenant Resolution Middleware
 * Resolves tenant from slug and sets tenant context for RLS
 * Architecture Spec Section 5.1
 */

import { Request, Response, NextFunction } from 'express';
import { prisma, setTenantContext, clearTenantContext } from '../db/prisma';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string;
        name: string;
        slug: string;
        status: string;
        maxUsers: number;
      };
    }
  }
}

/**
 * Middleware to resolve tenant from slug in request body or header
 */
export async function tenantResolver(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get tenant slug from body, header, or query
    const tenantSlug = 
      req.body?.tenant_slug ||
      req.headers['x-tenant-slug'] ||
      (req.query as any)?.['tenant_slug'];

    if (!tenantSlug) {
      // No tenant slug provided - might be an operator request
      await clearTenantContext();
      return next();
    }

    // Look up tenant by slug
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug as string },
    });

    if (!tenant) {
      res.status(404).json({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant '${tenantSlug}' not found`,
      });
      return;
    }

    if (tenant.status !== 'active') {
      res.status(403).json({
        code: 'TENANT_SUSPENDED',
        message: `Tenant '${tenantSlug}' is not active`,
      });
      return;
    }

    // Set tenant on request for later use
    req.tenant = tenant;

    // Set tenant context for RLS
    await setTenantContext(tenant.id);

    next();
  } catch (error) {
    console.error('Tenant resolution error:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to resolve tenant',
    });
  }
}

/**
 * Middleware that requires a tenant to be resolved
 * Use after tenantResolver for routes that must have a tenant context
 */
export function requireTenant(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.tenant) {
    res.status(400).json({
      code: 'TENANT_REQUIRED',
      message: 'Tenant slug is required for this operation',
    });
    return;
  }
  next();
}

/**
 * Middleware for operator-only routes
 * Ensures the user has the 'operator' role and no tenant context
 */
export function operatorOnly(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
    return;
  }

  if (user.role !== 'operator') {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'This operation requires operator privileges',
    });
    return;
  }

  next();
}

/**
 * Middleware for admin-only routes within a tenant
 */
export function adminOnly(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
    return;
  }

  if (user.role !== 'admin' && user.role !== 'operator') {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'This operation requires admin privileges',
    });
    return;
  }

  next();
}

export default {
  tenantResolver,
  requireTenant,
  operatorOnly,
  adminOnly,
};
