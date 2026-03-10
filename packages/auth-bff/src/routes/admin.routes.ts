/**
 * Admin Routes
 * Implements user management endpoints within a tenant
 * Architecture Spec Section 5
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { hashPassword, validatePasswordPolicy } from '../services/password.service';
import { authenticate, requireRole, adminOnly } from '../middleware/auth.middleware';
import { tenantResolver, requireTenant } from '../middleware/tenant.middleware';
import { adminRateLimiter } from '../middleware/ratelimit.middleware';
import {
  logUserCreated,
  logUserDisabled,
  logUserRoleChanged,
  logMaxUsersChanged,
} from '../services/audit.service';
import { enforceLicenseLimit, getLicenseUsageSummary } from '../services/license.service';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ─── Validation Schemas ─────────────────────────────────────────────────────

const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(10, 'Password must be at least 10 characters'),
  role: z.enum(['user', 'admin']).optional().default('user'),
  name: z.string().optional(),
});

const updateUserSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'disabled', 'pending']).optional(),
  name: z.string().optional(),
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

// All admin routes require:
// 1. Tenant resolution
// 2. Authentication
// 3. Admin or Operator role
router.use(tenantResolver);
router.use(requireTenant);
router.use(authenticate);
router.use(requireRole('admin', 'operator'));
router.use(adminRateLimiter);

// ─── GET /admin/users ───────────────────────────────────────────────────────

router.get('/users', async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const user = req.user!;

    // Get all users in the tenant
    const users = await prisma.user.findMany({
      where: {
        tenantId: tenant.id,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get license usage
    const licenseUsage = await getLicenseUsageSummary(tenant.id);

    return res.status(200).json({
      users,
      total: users.length,
      license: {
        max_users: licenseUsage.maxUsers,
        active_users: licenseUsage.activeUsers,
        remaining: licenseUsage.maxUsers - licenseUsage.activeUsers,
        usage_percentage: licenseUsage.usagePercentage,
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── GET /admin/users/:id ───────────────────────────────────────────────────

router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const userId = req.params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    // Verify user belongs to this tenant
    const fullUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });

    if (fullUser?.tenantId !== tenant.id) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'You do not have access to this user',
      });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── POST /admin/users ──────────────────────────────────────────────────────

router.post('/users', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parseResult = createUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parseResult.error.errors,
      });
    }

    const { email, password, role } = parseResult.data;
    const tenant = req.tenant!;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);
    const actor = req.user!; // The admin creating the user

    // Validate password policy
    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        code: 'PASSWORD_POLICY_VIOLATION',
        message: 'Password does not meet requirements',
        errors: passwordValidation.errors,
      });
    }

    // Check if email already exists in this tenant
    const existingUser = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        tenantId: tenant.id,
      },
    });

    if (existingUser) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'A user with this email already exists in your tenant',
      });
    }

    // Enforce license limit BEFORE creating user
    await enforceLicenseLimit(tenant.id);

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        id: uuidv4(),
        tenantId: tenant.id,
        email: email.toLowerCase(),
        passwordHash,
        role: role || 'user',
        status: 'active',
        failedAttempts: 0,
        lockedUntil: null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    // Audit log
    await logUserCreated(
      tenant.id,
      newUser.id,
      actor.sub, // creator user id
      ipAddress,
      userAgent
    );

    return res.status(201).json({
      message: 'User created successfully',
      user: newUser,
    });
  } catch (error: any) {
    console.error('Create user error:', error);

    // Handle license limit error
    if (error.code === 'LICENSE_LIMIT_REACHED') {
      return res.status(402).json({
        code: 'LICENSE_LIMIT_REACHED',
        message: 'Maximum number of users reached for your plan',
        details: error.details,
      });
    }

    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── PATCH /admin/users/:id ─────────────────────────────────────────────────

router.patch('/users/:id', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parseResult = updateUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parseResult.error.errors,
      });
    }

    const updates = parseResult.data;
    const tenant = req.tenant!;
    const userId = req.params.id;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);
    const actor = req.user!;

    // Get the user to update
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    // Verify user belongs to this tenant
    if (user.tenantId !== tenant.id) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'You do not have access to this user',
      });
    }

    // Prevent admin from demoting themselves
    if (userId === actor.sub && updates.role && updates.role !== actor.role) {
      return res.status(400).json({
        code: 'INVALID_OPERATION',
        message: 'You cannot change your own role',
      });
    }

    // Check email uniqueness if email is being updated
    if (updates.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: updates.email.toLowerCase(),
          tenantId: tenant.id,
          id: { not: userId },
        },
      });

      if (existingUser) {
        return res.status(409).json({
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'A user with this email already exists in your tenant',
        });
      }
    }

    // Track role change for audit
    const roleChanged = updates.role && updates.role !== user.role;
    const previousRole = user.role;

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...updates,
        email: updates.email ? updates.email.toLowerCase() : undefined,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });

    // Audit logs
    if (roleChanged) {
      await logUserRoleChanged(
        tenant.id,
        userId,
        actor.sub,
        previousRole,
        updates.role!,
        ipAddress,
        userAgent
      );
    }

    if (updates.status === 'disabled') {
      await logUserDisabled(tenant.id, userId, actor.sub, ipAddress, userAgent);
    }

    return res.status(200).json({
      message: 'User updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── DELETE /admin/users/:id ────────────────────────────────────────────────

router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const userId = req.params.id;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);
    const actor = req.user!;

    // Get the user to delete
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    // Verify user belongs to this tenant
    if (user.tenantId !== tenant.id) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'You do not have access to this user',
      });
    }

    // Prevent admin from deleting themselves
    if (userId === actor.sub) {
      return res.status(400).json({
        code: 'INVALID_OPERATION',
        message: 'You cannot delete your own account',
      });
    }

    // Soft delete - disable the user instead of hard delete
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'disabled',
      },
    });

    // Audit log
    await logUserDisabled(tenant.id, userId, actor.sub, ipAddress, userAgent);

    return res.status(200).json({
      message: 'User disabled successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── GET /admin/license ─────────────────────────────────────────────────────

router.get('/license', async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;

    const licenseUsage = await getLicenseUsageSummary(tenant.id);

    return res.status(200).json({
      license: {
        max_users: licenseUsage.maxUsers,
        active_users: licenseUsage.activeUsers,
        disabled_users: licenseUsage.disabledUsers,
        total_users: licenseUsage.totalUsers,
        usage_percentage: licenseUsage.usagePercentage,
        tenant_status: licenseUsage.status,
      },
    });
  } catch (error) {
    console.error('Get license error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

export default router;
