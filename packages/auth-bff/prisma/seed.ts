/**
 * Prisma Seed Script for Local Development
 * Creates test tenants, users, and operator account
 * 
 * Run with: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Password policy compliant test passwords
const PASSWORDS = {
  operator: 'Operator@Secure123!',
  adminAcme: 'Admin@Acme123!',
  userAcme: 'User@Acme123!',
  adminBeta: 'Admin@Beta123!',
  userBeta: 'User@Beta123!',
};

/**
 * Hash password using Argon2id
 */
async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,    // 64 MiB
    timeCost: 3,          // iterations
    parallelism: 4,       // threads
    hashLength: 32,       // bytes
    saltLength: 16,       // bytes
  });
}

/**
 * Create a tenant with users
 */
async function createTenant(
  name: string,
  slug: string,
  maxUsers: number,
  adminEmail: string,
  adminPassword: string,
  users: Array<{ email: string; password: string; status?: string }>
) {
  console.log(`Creating tenant: ${name} (${slug})`);

  // Create tenant
  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      status: 'active',
      maxUsers,
    },
  });

  // Create admin user
  const adminPasswordHash = await hashPassword(adminPassword);
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: 'admin',
      status: 'active',
    },
  });
  console.log(`  ✓ Created admin: ${adminEmail}`);

  // Create regular users
  for (const userData of users) {
    const passwordHash = await hashPassword(userData.password);
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: userData.email,
        passwordHash,
        role: 'user',
        status: userData.status || 'active',
      },
    });
    console.log(`  ✓ Created user: ${userData.email}`);
  }

  return tenant;
}

/**
 * Main seed function
 */
async function main() {
  console.log('🌱 Starting database seed...\n');

  // Clean existing data (in correct order due to foreign keys)
  console.log('Cleaning existing data...');
  await prisma.authEvent.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.passwordHistory.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  console.log('  ✓ Data cleaned\n');

  // ─── Create System Tenant for Platform Operator ───────────────────────────
  console.log('Creating system tenant for platform operator...');
  const systemTenant = await prisma.tenant.create({
    data: {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'System',
      slug: 'system',
      status: 'active',
      maxUsers: 1,
    },
  });
  console.log('  ✓ Created system tenant\n');

  // ─── Create Platform Operator ────────────────────────────────────────────
  console.log('Creating platform operator...');
  const operatorPasswordHash = await hashPassword(PASSWORDS.operator);
  await prisma.user.create({
    data: {
      tenantId: systemTenant.id,
      email: 'operator@yoursaas.com',
      passwordHash: operatorPasswordHash,
      role: 'operator',
      status: 'active',
    },
  });
  console.log('  ✓ Created operator: operator@yoursaas.com\n');

  // ─── Create Acme Corp Tenant ─────────────────────────────────────────────
  await createTenant(
    'Acme Corporation',
    'acme-corp',
    5,
    'admin@acme.com',
    PASSWORDS.adminAcme,
    [
      { email: 'alice@acme.com', password: PASSWORDS.userAcme },
      { email: 'bob@acme.com', password: PASSWORDS.userAcme },
      { email: 'disabled@acme.com', password: PASSWORDS.userAcme, status: 'disabled' },
    ]
  );
  console.log('');

  // ─── Create Beta Org Tenant ──────────────────────────────────────────────
  await createTenant(
    'Beta Organization',
    'beta-org',
    3,
    'admin@betaorg.com',
    PASSWORDS.adminBeta,
    [
      { email: 'carol@betaorg.com', password: PASSWORDS.userBeta },
    ]
  );
  console.log('');

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('✅ Seed completed successfully!\n');
  console.log('📋 Test Accounts Summary:');
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│ Account Type       │ Email                  │ Password          │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log('│ Platform Operator  │ operator@yoursaas.com  │ Operator@Secure123! │');
  console.log('│ Tenant Admin (Acme)│ admin@acme.com         │ Admin@Acme123!    │');
  console.log('│ Tenant User (Acme) │ alice@acme.com         │ User@Acme123!     │');
  console.log('│ Tenant User (Acme) │ bob@acme.com           │ User@Acme123!     │');
  console.log('│ Disabled User      │ disabled@acme.com      │ User@Acme123!     │');
  console.log('│ Tenant Admin (Beta)│ admin@betaorg.com      │ Admin@Beta123!    │');
  console.log('│ Tenant User (Beta) │ carol@betaorg.com      │ User@Beta123!     │');
  console.log('└─────────────────────────────────────────────────────────────────┘');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
