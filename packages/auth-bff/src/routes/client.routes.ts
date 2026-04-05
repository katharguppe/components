/**
 * Client Routes
 * Sprint 03 — client CRUD + preferences endpoints
 * Base: /api/v1/clients  (mounted in app.ts)
 *
 * Architecture note:
 *   Client module tables live in per-tenant schemas (tenant_{slug}).
 *   All raw SQL uses fully-qualified table names ("tenant_{slug}".clients)
 *   so no search_path manipulation is needed per request — safe in a
 *   connection pool.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { toSchemaName, enableClientModuleForTenant } from '../db/tenant-provisioner';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { tenantResolver, requireTenant } from '../middleware/tenant.middleware';
import { adminRateLimiter } from '../middleware/ratelimit.middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  createClientSchema,
  updateClientSchema,
  listClientsQuerySchema,
  upsertPreferencesSchema,
} from '../schemas/client.schema';

const router = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClientRow {
  mobile_number: string;
  full_name: string;
  email: string | null;
  date_of_birth: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface PreferencesRow {
  preferences: Record<string, unknown>;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.connection.remoteAddress ||
    'unknown'
  );
}

function getUserAgent(req: Request): string {
  return req.headers['user-agent'] || 'unknown';
}

async function logClientEvent(
  tenantId: string,
  userId: string,
  eventType: string,
  ipAddress: string,
  userAgent: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await prisma.authEvent.create({
    data: {
      id: uuidv4(),
      tenantId,
      userId,
      eventType,
      ipAddress,
      userAgent,
      metadata: metadata ?? null,
    },
  });
}

// ─── Middleware Stack ─────────────────────────────────────────────────────────

// All client routes require tenant + auth + admin/operator role.
router.use(tenantResolver);
router.use(requireTenant);
router.use(authenticate);
router.use(requireRole('admin', 'operator'));
router.use(adminRateLimiter);

// ─── GET /api/v1/clients ──────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const queryParse = listClientsQuerySchema.safeParse(req.query);
    if (!queryParse.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: queryParse.error.errors,
      });
    }

    const { page, limit, status, search } = queryParse.data;
    const offset = (page - 1) * limit;
    const schema = `"${toSchemaName(req.tenant!.slug)}"`;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(
        `(full_name ILIKE $${paramIdx} OR mobile_number ILIKE $${paramIdx} OR email ILIKE $${paramIdx})`
      );
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countParams = [...params];
    const rowsParams = [...params, limit, offset];

    const countResult = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) AS count FROM ${schema}.clients ${where}`,
      ...countParams
    );
    const total = Number(countResult[0].count);

    const clients = await prisma.$queryRawUnsafe<ClientRow[]>(
      `SELECT mobile_number, full_name, email, date_of_birth::text AS date_of_birth,
              status, created_at, updated_at
       FROM ${schema}.clients
       ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...rowsParams
    );

    return res.status(200).json({
      clients,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List clients error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── POST /api/v1/clients ─────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  try {
    const parseResult = createClientSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parseResult.error.errors,
      });
    }

    const { mobile_number, full_name, email, date_of_birth } = parseResult.data;
    const tenant = req.tenant!;
    const actor = req.user!;
    const schema = `"${toSchemaName(tenant.slug)}"`;

    // Check for duplicate mobile_number
    const existing = await prisma.$queryRawUnsafe<ClientRow[]>(
      `SELECT mobile_number FROM ${schema}.clients WHERE mobile_number = $1`,
      mobile_number
    );
    if (existing.length > 0) {
      return res.status(409).json({
        code: 'MOBILE_ALREADY_EXISTS',
        message: 'A client with this mobile number already exists',
      });
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO ${schema}.clients
         (mobile_number, full_name, email, date_of_birth, status)
       VALUES ($1, $2, $3, $4::date, 'active')`,
      mobile_number,
      full_name,
      email ?? null,
      date_of_birth ?? null
    );

    const rows = await prisma.$queryRawUnsafe<ClientRow[]>(
      `SELECT mobile_number, full_name, email, date_of_birth::text AS date_of_birth,
              status, created_at, updated_at
       FROM ${schema}.clients
       WHERE mobile_number = $1`,
      mobile_number
    );

    await logClientEvent(
      tenant.id, actor.sub, 'client_created',
      getClientIp(req), getUserAgent(req),
      { mobile_number }
    );

    return res.status(201).json({
      message: 'Client created successfully',
      client: rows[0],
    });
  } catch (error) {
    console.error('Create client error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── GET /api/v1/clients/:mobile ──────────────────────────────────────────────

router.get('/:mobile', async (req: Request, res: Response) => {
  try {
    const mobile = req.params.mobile;
    const schema = `"${toSchemaName(req.tenant!.slug)}"`;

    const rows = await prisma.$queryRawUnsafe<ClientRow[]>(
      `SELECT mobile_number, full_name, email, date_of_birth::text AS date_of_birth,
              status, created_at, updated_at
       FROM ${schema}.clients
       WHERE mobile_number = $1`,
      mobile
    );

    if (rows.length === 0) {
      return res.status(404).json({
        code: 'CLIENT_NOT_FOUND',
        message: 'Client not found',
      });
    }

    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Get client error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── PATCH /api/v1/clients/:mobile ───────────────────────────────────────────

router.patch('/:mobile', async (req: Request, res: Response) => {
  try {
    const parseResult = updateClientSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parseResult.error.errors,
      });
    }

    const updates = parseResult.data;
    const mobile = req.params.mobile;
    const tenant = req.tenant!;
    const actor = req.user!;
    const schema = `"${toSchemaName(tenant.slug)}"`;

    // Verify client exists
    const existing = await prisma.$queryRawUnsafe<ClientRow[]>(
      `SELECT mobile_number FROM ${schema}.clients WHERE mobile_number = $1`,
      mobile
    );
    if (existing.length === 0) {
      return res.status(404).json({
        code: 'CLIENT_NOT_FOUND',
        message: 'Client not found',
      });
    }

    // Build dynamic SET clause
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (updates.full_name !== undefined) {
      setClauses.push(`full_name = $${paramIdx++}`);
      values.push(updates.full_name);
    }
    if ('email' in updates) {
      setClauses.push(`email = $${paramIdx++}`);
      values.push(updates.email ?? null);
    }
    if ('date_of_birth' in updates) {
      setClauses.push(`date_of_birth = $${paramIdx++}::date`);
      values.push(updates.date_of_birth ?? null);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIdx++}`);
      values.push(updates.status);
    }

    // updated_at handled by DB trigger; no need to set it here

    values.push(mobile); // WHERE param
    await prisma.$executeRawUnsafe(
      `UPDATE ${schema}.clients SET ${setClauses.join(', ')} WHERE mobile_number = $${paramIdx}`,
      ...values
    );

    const rows = await prisma.$queryRawUnsafe<ClientRow[]>(
      `SELECT mobile_number, full_name, email, date_of_birth::text AS date_of_birth,
              status, created_at, updated_at
       FROM ${schema}.clients
       WHERE mobile_number = $1`,
      mobile
    );

    await logClientEvent(
      tenant.id, actor.sub, 'client_updated',
      getClientIp(req), getUserAgent(req),
      { mobile_number: mobile, fields: Object.keys(updates) }
    );

    return res.status(200).json({
      message: 'Client updated successfully',
      client: rows[0],
    });
  } catch (error) {
    console.error('Update client error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── DELETE /api/v1/clients/:mobile ──────────────────────────────────────────

router.delete('/:mobile', async (req: Request, res: Response) => {
  try {
    const mobile = req.params.mobile;
    const tenant = req.tenant!;
    const actor = req.user!;
    const schema = `"${toSchemaName(tenant.slug)}"`;

    const existing = await prisma.$queryRawUnsafe<ClientRow[]>(
      `SELECT mobile_number, status FROM ${schema}.clients WHERE mobile_number = $1`,
      mobile
    );
    if (existing.length === 0) {
      return res.status(404).json({
        code: 'CLIENT_NOT_FOUND',
        message: 'Client not found',
      });
    }

    // Soft delete — set status to inactive
    await prisma.$executeRawUnsafe(
      `UPDATE ${schema}.clients SET status = 'inactive' WHERE mobile_number = $1`,
      mobile
    );

    await logClientEvent(
      tenant.id, actor.sub, 'client_deleted',
      getClientIp(req), getUserAgent(req),
      { mobile_number: mobile }
    );

    return res.status(200).json({
      message: 'Client deactivated successfully',
    });
  } catch (error) {
    console.error('Delete client error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── GET /api/v1/clients/:mobile/preferences ─────────────────────────────────

router.get('/:mobile/preferences', async (req: Request, res: Response) => {
  try {
    const mobile = req.params.mobile;
    const schema = `"${toSchemaName(req.tenant!.slug)}"`;

    // Verify client exists
    const client = await prisma.$queryRawUnsafe<ClientRow[]>(
      `SELECT mobile_number FROM ${schema}.clients WHERE mobile_number = $1`,
      mobile
    );
    if (client.length === 0) {
      return res.status(404).json({
        code: 'CLIENT_NOT_FOUND',
        message: 'Client not found',
      });
    }

    const rows = await prisma.$queryRawUnsafe<PreferencesRow[]>(
      `SELECT preferences FROM ${schema}.client_preferences WHERE mobile_number = $1`,
      mobile
    );

    return res.status(200).json({
      mobile_number: mobile,
      preferences: rows[0]?.preferences ?? {},
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── PUT /api/v1/clients/:mobile/preferences ─────────────────────────────────

router.put('/:mobile/preferences', async (req: Request, res: Response) => {
  try {
    const parseResult = upsertPreferencesSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parseResult.error.errors,
      });
    }

    const { preferences } = parseResult.data;
    const mobile = req.params.mobile;
    const tenant = req.tenant!;
    const actor = req.user!;
    const schema = `"${toSchemaName(tenant.slug)}"`;

    // Verify client exists
    const client = await prisma.$queryRawUnsafe<ClientRow[]>(
      `SELECT mobile_number FROM ${schema}.clients WHERE mobile_number = $1`,
      mobile
    );
    if (client.length === 0) {
      return res.status(404).json({
        code: 'CLIENT_NOT_FOUND',
        message: 'Client not found',
      });
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO ${schema}.client_preferences (mobile_number, preferences)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (mobile_number) DO UPDATE SET
         preferences = $2::jsonb,
         updated_at  = now()`,
      mobile,
      JSON.stringify(preferences)
    );

    const rows = await prisma.$queryRawUnsafe<PreferencesRow[]>(
      `SELECT preferences FROM ${schema}.client_preferences WHERE mobile_number = $1`,
      mobile
    );

    await logClientEvent(
      tenant.id, actor.sub, 'client_preferences_updated',
      getClientIp(req), getUserAgent(req),
      { mobile_number: mobile }
    );

    return res.status(200).json({
      message: 'Preferences updated successfully',
      mobile_number: mobile,
      preferences: rows[0].preferences,
    });
  } catch (error) {
    console.error('Upsert preferences error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── POST /api/v1/clients/_provision (test/ops setup) ────────────────────────
// Creates the per-tenant schema and runs the client module migration.
// Idempotent — safe to call multiple times.
// Protected by the same admin/operator middleware stack as all other routes.

router.post('/_provision', async (req: Request, res: Response) => {
  try {
    const tenantSlug = req.tenant!.slug;
    await enableClientModuleForTenant(tenantSlug);
    await logClientEvent(
      req.tenant!.id, req.user!.sub, 'client_module_provisioned',
      getClientIp(req), getUserAgent(req),
      { schema: toSchemaName(tenantSlug) }
    );
    return res.status(200).json({
      message: `Client module provisioned for tenant "${tenantSlug}"`,
      schema: toSchemaName(tenantSlug),
    });
  } catch (error) {
    console.error('Provision error:', error);
    return res.status(500).json({
      code: 'PROVISION_ERROR',
      message: 'Failed to provision client module',
    });
  }
});

export default router;
