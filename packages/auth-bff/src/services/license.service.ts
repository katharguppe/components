/**
 * License Enforcement Service
 * Implements license limit checks for tenant user counts
 * Architecture Spec Section 2.3
 */

import { prisma } from '../db/prisma';

export interface LicenseCheckResult {
  allowed: boolean;
  currentUsers: number;
  maxUsers: number;
  remaining: number;
}

/**
 * Get the count of active (non-disabled) users in a tenant
 */
export async function getActiveUserCount(tenantId: string): Promise<number> {
  const count = await prisma.user.count({
    where: {
      tenantId,
      status: {
        not: 'disabled',
      },
    },
  });

  return count;
}

/**
 * Get tenant license information
 */
export async function getTenantLicenseInfo(tenantId: string): Promise<{
  maxUsers: number;
  status: string;
} | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      maxUsers: true,
      status: true,
    },
  });

  return tenant;
}

/**
 * Check if tenant can add more users (license enforcement)
 */
export async function checkLicenseLimit(tenantId: string): Promise<LicenseCheckResult> {
  const [currentUsers, tenantInfo] = await Promise.all([
    getActiveUserCount(tenantId),
    getTenantLicenseInfo(tenantId),
  ]);

  if (!tenantInfo) {
    return {
      allowed: false,
      currentUsers: 0,
      maxUsers: 0,
      remaining: 0,
    };
  }

  const maxUsers = tenantInfo.maxUsers;
  const remaining = Math.max(0, maxUsers - currentUsers);
  const allowed = currentUsers < maxUsers;

  return {
    allowed,
    currentUsers,
    maxUsers,
    remaining,
  };
}

/**
 * Enforce license limit - throws error if limit reached
 * Use this before creating a new user
 */
export async function enforceLicenseLimit(tenantId: string): Promise<LicenseCheckResult> {
  const result = await checkLicenseLimit(tenantId);

  if (!result.allowed) {
    const error = new Error('License limit reached');
    (error as any).code = 'LICENSE_LIMIT_REACHED';
    (error as any).statusCode = 402;
    (error as any).details = {
      max_users: result.maxUsers,
      current_users: result.currentUsers,
    };
    throw error;
  }

  return result;
}

/**
 * Get license usage summary for a tenant
 */
export async function getLicenseUsageSummary(tenantId: string): Promise<{
  maxUsers: number;
  activeUsers: number;
  disabledUsers: number;
  totalUsers: number;
  usagePercentage: number;
  status: string;
}> {
  const [activeUsers, disabledUsers, tenantInfo] = await Promise.all([
    prisma.user.count({
      where: {
        tenantId,
        status: { not: 'disabled' },
      },
    }),
    prisma.user.count({
      where: {
        tenantId,
        status: 'disabled',
      },
    }),
    getTenantLicenseInfo(tenantId),
  ]);

  const totalUsers = activeUsers + disabledUsers;
  const maxUsers = tenantInfo?.maxUsers || 0;
  const usagePercentage = maxUsers > 0 ? Math.round((activeUsers / maxUsers) * 100) : 0;

  return {
    maxUsers,
    activeUsers,
    disabledUsers,
    totalUsers,
    usagePercentage,
    status: tenantInfo?.status || 'unknown',
  };
}

/**
 * Update tenant max users (operator only)
 */
export async function updateTenantMaxUsers(
  tenantId: string,
  newMaxUsers: number
): Promise<{ success: boolean; previousMax: number; newMax: number }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const previousMax = tenant.maxUsers;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { maxUsers: newMaxUsers },
  });

  return {
    success: true,
    previousMax,
    newMax: newMaxUsers,
  };
}

export default {
  getActiveUserCount,
  getTenantLicenseInfo,
  checkLicenseLimit,
  enforceLicenseLimit,
  getLicenseUsageSummary,
  updateTenantMaxUsers,
};
