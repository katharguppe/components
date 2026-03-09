/**
 * Audit Service
 * Implements audit logging for all authentication events
 * Architecture Spec Section 6.5
 */

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db/prisma';

// Event types
export type AuthEventType =
  | 'login_success'
  | 'login_fail'
  | 'logout'
  | 'token_refresh'
  | 'token_refresh_fail'
  | 'password_change'
  | 'password_reset_request'
  | 'password_reset_complete'
  | 'account_locked'
  | 'account_unlocked'
  | 'user_created'
  | 'user_updated'
  | 'user_disabled'
  | 'tenant_created'
  | 'tenant_updated'
  | 'tenant_suspended';

export interface AuditEventInput {
  tenantId: string;
  userId?: string | undefined;
  eventType: AuthEventType;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Log an audit event
 */
export async function logAuditEvent(event: AuditEventInput): Promise<void> {
  await prisma.authEvent.create({
    data: {
      id: uuidv4(),
      tenantId: event.tenantId,
      userId: event.userId,
      eventType: event.eventType,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: event.metadata || null,
    },
  });
}

/**
 * Log a login success event
 */
export async function logLoginSuccess(
  tenantId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    eventType: 'login_success',
    ipAddress,
    userAgent,
  });
}

/**
 * Log a login failure event
 */
export async function logLoginFail(
  tenantId: string,
  email: string,
  reason: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    eventType: 'login_fail',
    ipAddress,
    userAgent,
    metadata: { email, reason },
  });
}

/**
 * Log a logout event
 */
export async function logLogout(
  tenantId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    eventType: 'logout',
    ipAddress,
    userAgent,
  });
}

/**
 * Log a token refresh event
 */
export async function logTokenRefresh(
  tenantId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    eventType: 'token_refresh',
    ipAddress,
    userAgent,
  });
}

/**
 * Log a token refresh failure
 */
export async function logTokenRefreshFail(
  tenantId: string,
  userId: string | undefined,
  reason: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    eventType: 'token_refresh_fail',
    ipAddress,
    userAgent,
    metadata: { reason },
  });
}

/**
 * Log a password change event
 */
export async function logPasswordChange(
  tenantId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    eventType: 'password_change',
    ipAddress,
    userAgent,
  });
}

/**
 * Log a password reset request
 */
export async function logPasswordResetRequest(
  tenantId: string,
  email: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    eventType: 'password_reset_request',
    ipAddress,
    userAgent,
    metadata: { email },
  });
}

/**
 * Log a password reset completion
 */
export async function logPasswordResetComplete(
  tenantId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    eventType: 'password_reset_complete',
    ipAddress,
    userAgent,
  });
}

/**
 * Log an account locked event
 */
export async function logAccountLocked(
  tenantId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    eventType: 'account_locked',
    ipAddress,
    userAgent,
  });
}

/**
 * Log an account unlocked event
 */
export async function logAccountUnlocked(
  tenantId: string,
  userId: string,
  unlockedBy: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    eventType: 'account_unlocked',
    ipAddress,
    userAgent,
    metadata: { unlockedBy },
  });
}

/**
 * Log a user created event
 */
export async function logUserCreated(
  tenantId: string,
  userId: string,
  createdBy: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    eventType: 'user_created',
    ipAddress,
    userAgent,
    metadata: { createdBy },
  });
}

/**
 * Log a user updated event
 */
export async function logUserUpdated(
  tenantId: string,
  userId: string,
  updatedBy: string,
  changes: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    eventType: 'user_updated',
    ipAddress,
    userAgent,
    metadata: { updatedBy, changes },
  });
}

/**
 * Log a user disabled event
 */
export async function logUserDisabled(
  tenantId: string,
  userId: string,
  disabledBy: string,
  reason: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    eventType: 'user_disabled',
    ipAddress,
    userAgent,
    metadata: { disabledBy, reason },
  });
}

/**
 * Log a tenant created event
 */
export async function logTenantCreated(
  tenantId: string,
  createdBy: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    eventType: 'tenant_created',
    ipAddress,
    userAgent,
    metadata: { createdBy },
  });
}

/**
 * Log a tenant updated event
 */
export async function logTenantUpdated(
  tenantId: string,
  updatedBy: string,
  changes: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    eventType: 'tenant_updated',
    ipAddress,
    userAgent,
    metadata: { updatedBy, changes },
  });
}

/**
 * Log a tenant suspended event
 */
export async function logTenantSuspended(
  tenantId: string,
  suspendedBy: string,
  reason: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    eventType: 'tenant_suspended',
    ipAddress,
    userAgent,
    metadata: { suspendedBy, reason },
  });
}

/**
 * Get audit events for a tenant
 */
export async function getTenantAuditEvents(
  tenantId: string,
  options?: {
    userId?: string;
    eventType?: AuthEventType;
    limit?: number;
    offset?: number;
  }
) {
  const where: any = { tenantId };

  if (options?.userId) {
    where.userId = options.userId;
  }

  if (options?.eventType) {
    where.eventType = options.eventType;
  }

  return prisma.authEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 100,
    skip: options?.offset || 0,
  });
}

export default {
  logAuditEvent,
  logLoginSuccess,
  logLoginFail,
  logLogout,
  logTokenRefresh,
  logTokenRefreshFail,
  logPasswordChange,
  logPasswordResetRequest,
  logPasswordResetComplete,
  logAccountLocked,
  logAccountUnlocked,
  logUserCreated,
  logUserUpdated,
  logUserDisabled,
  logTenantCreated,
  logTenantUpdated,
  logTenantSuspended,
  getTenantAuditEvents,
};
