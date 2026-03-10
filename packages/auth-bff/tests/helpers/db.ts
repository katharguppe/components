import { prisma } from '../../src/db/prisma';
import { hashPassword } from '../../src/services/password.service';

export async function canConnectToDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function ensureTestTenantAndUser(params: {
  tenantSlug: string;
  tenantName: string;
  userEmail: string;
  userPassword: string;
  userRole?: 'user' | 'admin' | 'operator';
  userStatus?: 'active' | 'disabled' | 'pending';
}): Promise<{ tenantId: string; userId: string }> {
  const role = params.userRole ?? 'admin';
  const status = params.userStatus ?? 'active';

  const tenant = await prisma.tenant.upsert({
    where: { slug: params.tenantSlug },
    update: { name: params.tenantName, status: 'active' },
    create: { slug: params.tenantSlug, name: params.tenantName, status: 'active' },
  });

  const emailLower = params.userEmail.toLowerCase();
  const passwordHash = await hashPassword(params.userPassword);

  const existing = await prisma.user.findFirst({
    where: { email: emailLower, tenantId: tenant.id },
  });

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role,
        status,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    return { tenantId: tenant.id, userId: updated.id };
  }

  const created = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: emailLower,
      passwordHash,
      role,
      status,
    },
  });

  return { tenantId: tenant.id, userId: created.id };
}

