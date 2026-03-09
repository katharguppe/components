/**
 * Prisma Client Singleton
 * Provides a single instance of PrismaClient for the application
 */

import { PrismaClient } from '@prisma/client';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit during hot-reloading.
// Learn more: https://www.prisma.io/docs/guides/database/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices

const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Get the Prisma client instance
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] 
      : ['error'],
  });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Set tenant context for Row-Level Security
 * Must be called before executing queries that require tenant isolation
 */
export async function setTenantContext(tenantId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `SELECT set_tenant_context('${tenantId}'::uuid)`
  );
}

/**
 * Clear tenant context (for operator access)
 */
export async function clearTenantContext(): Promise<void> {
  await prisma.$executeRawUnsafe(`RESET app.current_tenant_id`);
}

/**
 * Get current tenant ID from context
 */
export async function getCurrentTenantId(): Promise<string | null> {
  const result = await prisma.$queryRaw<{ get_current_tenant_id: string | null }[]>`
    SELECT get_current_tenant_id()
  `;
  return result[0]?.get_current_tenant_id;
}

/**
 * Disconnect Prisma client (for graceful shutdown)
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

export default prisma;
