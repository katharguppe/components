import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/prisma';
import { canConnectToDb, ensureTestTenantAndUser } from '../helpers/db';
import { startTestServer } from '../helpers/server';

function cookieValueFromSetCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const [cookiePair] = setCookie.split(';');
  return cookiePair ?? null;
}

const hasDb = await canConnectToDb();

describe.skipIf(!hasDb)('auth flows (integration smoke)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('health endpoint returns 200 when DB is reachable', async () => {
    const app = createApp();
    const server = await startTestServer(app);
    try {
      const res = await fetch(`${server.baseUrl}/health`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty('status');
      expect(json).toHaveProperty('db');
      expect(json).toHaveProperty('version');
    } finally {
      await server.close();
    }
  });

  it('login -> me -> refresh -> logout (happy path)', async () => {
    const tenantSlug = 'vitest-tenant';
    const email = 'vitest-admin@tenant.local';
    const password = 'Admin@Acme123!';

    await ensureTestTenantAndUser({
      tenantSlug,
      tenantName: 'Vitest Tenant',
      userEmail: email,
      userPassword: password,
      userRole: 'admin',
      userStatus: 'active',
    });

    const app = createApp();
    const server = await startTestServer(app);

    try {
      // Login
      const loginRes = await fetch(`${server.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenant_slug: tenantSlug }),
      });
      expect(loginRes.status).toBe(200);
      const loginJson = await loginRes.json();
      expect(loginJson).toHaveProperty('access_token');
      expect(loginJson).toHaveProperty('expires_in');
      expect(loginJson).toHaveProperty('user');
      expect(loginJson.user.email).toBe(email.toLowerCase());

      const accessToken = loginJson.access_token as string;
      const setCookie = loginRes.headers.get('set-cookie');
      const refreshCookie = cookieValueFromSetCookie(setCookie);
      expect(refreshCookie).toMatch(/^refresh_token=/);
      expect(setCookie ?? '').toContain('HttpOnly');
      expect(setCookie ?? '').toContain('SameSite=Strict');
      expect(setCookie ?? '').toContain('Path=/auth');

      // Me
      const meRes = await fetch(`${server.baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(meRes.status).toBe(200);
      const meJson = await meRes.json();
      expect(meJson.email).toBe(email.toLowerCase());
      expect(meJson.tenant.slug).toBe(tenantSlug);

      // Refresh (cookie-based)
      const refreshRes = await fetch(`${server.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: refreshCookie ?? '',
        },
        body: JSON.stringify({}),
      });
      expect(refreshRes.status).toBe(200);
      const refreshJson = await refreshRes.json();
      expect(refreshJson).toHaveProperty('access_token');
      expect(typeof refreshJson.access_token).toBe('string');

      const refreshSetCookie = refreshRes.headers.get('set-cookie');
      const rotatedRefreshCookie = cookieValueFromSetCookie(refreshSetCookie);
      expect(rotatedRefreshCookie).toMatch(/^refresh_token=/);
      expect(rotatedRefreshCookie).not.toBe(refreshCookie);

      // Logout (revokes token + clears cookie)
      const logoutRes = await fetch(`${server.baseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${refreshJson.access_token}`,
          Cookie: rotatedRefreshCookie ?? '',
        },
      });
      expect(logoutRes.status).toBe(200);

      const logoutSetCookie = logoutRes.headers.get('set-cookie') ?? '';
      expect(logoutSetCookie).toContain('refresh_token=');
      expect(logoutSetCookie).toContain('Path=/auth');
    } finally {
      await server.close();
    }
  });

  it('login with invalid credentials returns 401 INVALID_CREDENTIALS', async () => {
    const tenantSlug = 'vitest-tenant';
    const email = 'vitest-admin@tenant.local';

    const app = createApp();
    const server = await startTestServer(app);
    try {
      const res = await fetch(`${server.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'wrong-password',
          tenant_slug: tenantSlug,
        }),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe('INVALID_CREDENTIALS');
    } finally {
      await server.close();
    }
  });

  it('unknown tenant returns 404 TENANT_NOT_FOUND', async () => {
    const app = createApp();
    const server = await startTestServer(app);
    try {
      const res = await fetch(`${server.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'someone@example.com',
          password: 'DoesNotMatter123!',
          tenant_slug: 'no-such-tenant',
        }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.code).toBe('TENANT_NOT_FOUND');
    } finally {
      await server.close();
    }
  });

  it('disabled user returns 403 ACCOUNT_DISABLED', async () => {
    const tenantSlug = 'vitest-tenant';
    const email = 'vitest-disabled@tenant.local';
    const password = 'User@Acme123!';

    await ensureTestTenantAndUser({
      tenantSlug,
      tenantName: 'Vitest Tenant',
      userEmail: email,
      userPassword: password,
      userRole: 'user',
      userStatus: 'disabled',
    });

    const app = createApp();
    const server = await startTestServer(app);
    try {
      const res = await fetch(`${server.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenant_slug: tenantSlug }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('ACCOUNT_DISABLED');
    } finally {
      await server.close();
    }
  });

  it.skip('forgot-password returns 200 (smoke) [pending implementation]', async () => {
    const tenantSlug = 'vitest-tenant';
    const email = 'vitest-admin@tenant.local';

    const app = createApp();
    const server = await startTestServer(app);
    try {
      const res = await fetch(`${server.baseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tenant_slug: tenantSlug }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty('message');
    } finally {
      await server.close();
    }
  });
});

