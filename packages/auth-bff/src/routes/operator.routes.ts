/**
 * Operator Routes
 * Implements tenant management endpoints for platform operators
 * Architecture Spec Section 5
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { operatorOnly } from '../middleware/tenant.middleware';
import { adminRateLimiter } from '../middleware/ratelimit.middleware';
import {
  logTenantCreated,
  logTenantUpdated,
  logTenantSuspended,
  logMaxUsersChanged,
} from '../services/audit.service';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ─── Validation Schemas ─────────────────────────────────────────────────────

const createTenantSchema = z.object({
  name: z.string().min(2, 'Tenant name must be at least 2 characters'),
  slug: z.string()
    .min(2, 'Tenant slug must be at least 2 characters')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase, alphanumeric with hyphens'),
  maxUsers: z.number().int().positive('maxUsers must be a positive integer').default(5),
});

const updateTenantSchema = z.object({
  name: z.string().min(2, 'Tenant name must be at least 2 characters').optional(),
  slug: z.string()
    .min(2, 'Tenant slug must be at least 2 characters')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase, alphanumeric with hyphens')
    .optional(),
  status: z.enum(['active', 'suspended', 'cancelled']).optional(),
  maxUsers: z.number().int().positive('maxUsers must be a positive integer').optional(),
});

// ─── Helper Functions ───────────────────────────────────────────────────────

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
         req.ip ||
         req.connection.remoteAddress ||
         'unknown';
}

function getUserAgent(req: Request): string {
  return req.headers['user-agent'] || 'unknown';
}

// ─── Middleware Stack ───────────────────────────────────────────────────────

// All operator routes require:
// 1. Authentication
// 2. Operator role only
router.use(authenticate);
router.use(requireRole('operator'));
router.use(adminRateLimiter);

// ─── GET /operator/tenants ──────────────────────────────────────────────────

router.get('/tenants', async (req: Request, res: Response) => {
  try {
    const operator = req.user!;

    // Get all tenants
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        maxUsers: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: {
              where: {
                status: { not: 'disabled' },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Transform response
    const transformedTenants = tenants.map(tenant => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      maxUsers: tenant.maxUsers,
      activeUsers: tenant._count.users,
      availableSlots: tenant.maxUsers - tenant._count.users,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    }));

    return res.status(200).json({
      tenants: transformedTenants,
      total: transformedTenants.length,
    });
  } catch (error) {
    console.error('Get tenants error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── GET /operator/tenants/:id ──────────────────────────────────────────────

router.get('/tenants/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.id;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!tenant) {
      return res.status(404).json({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }

    // Calculate license usage
    const activeUsers = tenant.users.filter(u => u.status !== 'disabled').length;
    const disabledUsers = tenant.users.filter(u => u.status === 'disabled').length;

    return res.status(200).json({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      maxUsers: tenant.maxUsers,
      activeUsers,
      disabledUsers,
      availableSlots: tenant.maxUsers - activeUsers,
      usagePercentage: Math.round((activeUsers / tenant.maxUsers) * 100),
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      users: tenant.users.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get tenant error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── POST /operator/tenants ─────────────────────────────────────────────────

router.post('/tenants', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parseResult = createTenantSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parseResult.error.errors,
      });
    }

    const { name, slug, maxUsers } = parseResult.data;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);
    const operator = req.user!;

    // Check if slug already exists
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug },
    });

    if (existingTenant) {
      return res.status(409).json({
        code: 'SLUG_ALREADY_EXISTS',
        message: 'A tenant with this slug already exists',
      });
    }

    // Create tenant
    const newTenant = await prisma.tenant.create({
      data: {
        id: uuidv4(),
        name,
        slug,
        status: 'active',
        maxUsers: maxUsers || 5,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        maxUsers: true,
        createdAt: true,
      },
    });

    // Audit log
    await logTenantCreated(
      newTenant.id,
      operator.sub,
      ipAddress,
      userAgent
    );

    return res.status(201).json({
      message: 'Tenant created successfully',
      tenant: newTenant,
    });
  } catch (error) {
    console.error('Create tenant error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── PATCH /operator/tenants/:id ────────────────────────────────────────────

router.patch('/tenants/:id', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parseResult = updateTenantSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parseResult.error.errors,
      });
    }

    const updates = parseResult.data;
    const tenantId = req.params.id;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);
    const operator = req.user!;

    // Get the tenant to update
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return res.status(404).json({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }

    // Check slug uniqueness if slug is being updated
    if (updates.slug) {
      const existingTenant = await prisma.tenant.findFirst({
        where: {
          slug: updates.slug,
          id: { not: tenantId },
        },
      });

      if (existingTenant) {
        return res.status(409).json({
          code: 'SLUG_ALREADY_EXISTS',
          message: 'A tenant with this slug already exists',
        });
      }
    }

    // Track changes for audit
    const statusChanged = updates.status && updates.status !== tenant.status;
    const maxUsersChanged = updates.maxUsers && updates.maxUsers !== tenant.maxUsers;
    const previousStatus = tenant.status;
    const previousMaxUsers = tenant.maxUsers;

    // Update tenant
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: updates,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        maxUsers: true,
        updatedAt: true,
      },
    });

    // Audit logs
    if (statusChanged) {
      if (updates.status === 'suspended' || updates.status === 'cancelled') {
        await logTenantSuspended(
          tenantId,
          operator.sub,
          `Status changed from ${previousStatus} to ${updates.status}`,
          ipAddress,
          userAgent
        );
      }
    }

    if (maxUsersChanged) {
      await logMaxUsersChanged(
        tenantId,
        operator.sub,
        previousMaxUsers,
        updates.maxUsers!,
        ipAddress,
        userAgent
      );
    }

    await logTenantUpdated(
      tenantId,
      operator.sub,
      { updates },
      ipAddress,
      userAgent
    );

    return res.status(200).json({
      message: 'Tenant updated successfully',
      tenant: updatedTenant,
    });
  } catch (error) {
    console.error('Update tenant error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── DELETE /operator/tenants/:id ───────────────────────────────────────────

router.delete('/tenants/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.id;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);
    const operator = req.user!;

    // Get the tenant to delete
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            users: {
              where: {
                status: { not: 'disabled' },
              },
            },
          },
        },
      },
    });

    if (!tenant) {
      return res.status(404).json({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }

    // Check if tenant has active users
    if (tenant._count.users > 0) {
      return res.status(400).json({
        code: 'TENANT_HAS_USERS',
        message: `Cannot delete tenant with ${tenant._count.users} active user(s). Please disable all users first.`,
        details: {
          activeUsers: tenant._count.users,
        },
      });
    }

    // Soft delete - mark as cancelled instead of hard delete
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'cancelled',
      },
    });

    // Audit log
    await logTenantSuspended(
      tenantId,
      operator.sub,
      'Tenant cancelled (soft delete)',
      ipAddress,
      userAgent
    );

    return res.status(200).json({
      message: 'Tenant cancelled successfully',
    });
  } catch (error) {
    console.error('Delete tenant error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── GET /operator/stats ────────────────────────────────────────────────────

router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Get platform-wide statistics
    const [
      totalTenants,
      activeTenants,
      suspendedTenants,
      totalUsers,
      activeUsers,
      disabledUsers,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'active' } }),
      prisma.tenant.count({ where: { status: 'suspended' } }),
      prisma.user.count(),
      prisma.user.count({ where: { status: { not: 'disabled' } } }),
      prisma.user.count({ where: { status: 'disabled' } }),
    ]);

    // Get recent tenants
    const recentTenants = await prisma.tenant.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
      },
    });

    // Get tenants by status
    const tenantsByStatus = await prisma.tenant.groupBy({
      by: ['status'],
      _count: {
        id: true,
      },
    });

    return res.status(200).json({
      stats: {
        tenants: {
          total: totalTenants,
          active: activeTenants,
          suspended: suspendedTenants,
          cancelled: totalTenants - activeTenants - suspendedTenants,
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          disabled: disabledUsers,
        },
        averageUsersPerTenant: totalTenants > 0 ? (totalUsers / totalTenants).toFixed(2) : '0',
        totalLicenseSlots: await prisma.tenant.aggregate({
          _sum: { maxUsers: true },
        }).then(r => r._sum.maxUsers || 0),
      },
      recentTenants,
      tenantsByStatus: tenantsByStatus.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── POST /operator/tenants/:id/suspend ─────────────────────────────────────

router.post('/tenants/:id/suspend', async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.id;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);
    const operator = req.user!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return res.status(404).json({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }

    if (tenant.status === 'suspended') {
      return res.status(400).json({
        code: 'ALREADY_SUSPENDED',
        message: 'Tenant is already suspended',
      });
    }

    // Suspend tenant
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'suspended',
      },
    });

    // Audit log
    await logTenantSuspended(
      tenantId,
      operator.sub,
      'Tenant suspended by operator',
      ipAddress,
      userAgent
    );

    return res.status(200).json({
      message: 'Tenant suspended successfully',
    });
  } catch (error) {
    console.error('Suspend tenant error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── POST /operator/tenants/:id/activate ────────────────────────────────────

router.post('/tenants/:id/activate', async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.id;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);
    const operator = req.user!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return res.status(404).json({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }

    if (tenant.status === 'active') {
      return res.status(400).json({
        code: 'ALREADY_ACTIVE',
        message: 'Tenant is already active',
      });
    }

    // Activate tenant
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'active',
      },
    });

    // Audit log
    await logTenantUpdated(
      tenantId,
      operator.sub,
      { status: { from: tenant.status, to: 'active' } },
      ipAddress,
      userAgent
    );

    return res.status(200).json({
      message: 'Tenant activated successfully',
    });
  } catch (error) {
    console.error('Activate tenant error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

export default router;
