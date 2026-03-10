import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/db/prisma';
import { hashPassword } from '../../src/services/password.service';
import { canConnectToDb } from '../helpers/db';

const hasDb = await canConnectToDb();

describe.skipIf(!hasDb)('RLS (tenant isolation) - smoke [to be revisited]', () => {
  it.skip('limits user reads to current tenant context inside a transaction', async () => {
    const tenantA = await prisma.tenant.upsert({
      where: { slug: 'vitest-rls-a' },
      update: { name: 'Vitest RLS A', status: 'active' },
      create: { slug: 'vitest-rls-a', name: 'Vitest RLS A', status: 'active' },
    });

    const tenantB = await prisma.tenant.upsert({
      where: { slug: 'vitest-rls-b' },
      update: { name: 'Vitest RLS B', status: 'active' },
      create: { slug: 'vitest-rls-b', name: 'Vitest RLS B', status: 'active' },
    });

    // Ensure at least one user per tenant exists
    const mkUser = async (tenantId: string, email: string) => {
      const existing = await prisma.user.findFirst({ where: { tenantId, email } });
      if (existing) return existing;
      return prisma.user.create({
        data: {
          tenantId,
          email,
          passwordHash: await hashPassword('User@Acme123!'),
          role: 'user',
          status: 'active',
        },
      });
    };

    await mkUser(tenantA.id, 'rls-a@tenant.local');
    await mkUser(tenantB.id, 'rls-b@tenant.local');

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_tenant_context('${tenantA.id}'::uuid)`);
      const usersVisibleToA = await tx.user.findMany({ select: { tenantId: true, email: true } });
      await tx.$executeRawUnsafe(`RESET app.current_tenant_id`);
      return usersVisibleToA;
    });

    // If RLS is active and context is set, every returned row must belong to tenant A.
    // This is a smoke check; it will fail if the DB policies/context are not effective.
    expect(result.length).toBeGreaterThan(0);
    expect(new Set(result.map((u) => u.tenantId))).toEqual(new Set([tenantA.id]));
  });
});

