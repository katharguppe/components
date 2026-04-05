/**
 * Group Routes
 * Sprint 03 — group CRUD + group membership endpoints
 *
 * Mount point: /api/v1/clients/groups  (NOT /api/v1/clients)
 * IMPORTANT: in app.ts, register this router BEFORE client.routes.ts:
 *   app.use('/api/v1/clients/groups', groupRoutes);
 *   app.use('/api/v1/clients',        clientRoutes);
 * This ensures the static segment "groups" is matched before /:mobile.
 *
 * Architecture note:
 *   All SQL uses fully-qualified "tenant_{slug}".tablename — no search_path
 *   manipulation needed, safe in a connection pool.
 */

import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { prisma } from '../db/prisma';
import { toSchemaName } from '../db/tenant-provisioner';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { tenantResolver, requireTenant } from '../middleware/tenant.middleware';
import { adminRateLimiter } from '../middleware/ratelimit.middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  createGroupSchema,
  updateGroupSchema,
  addGroupMemberSchema,
} from '../schemas/client.schema';

const router = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

interface GroupRow {
  id: string;
  name: string;
  group_code: string;
  description: string | null;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface MemberRow {
  mobile_number: string;
  full_name: string;
  email: string | null;
  status: string;
  added_by: string;
  joined_at: Date;
}

// ─── group_code Helpers ───────────────────────────────────────────────────────

/**
 * Convert a group name to a kebab-slug component.
 * "VIP Travellers!" → "vip-travellers"
 */
function toKebabSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 48); // leave room for "-XXXX" suffix
}

/**
 * Generate a 4-character lowercase alphanumeric suffix using crypto.randomBytes.
 * Character set: a-z + 0-9 (36 chars). Uniform distribution via modulo 36.
 */
function generateSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(randomBytes(4))
    .map((b) => chars[b % 36])
    .join('');
}

/** Compose full group_code: kebab-slug-XXXX  e.g., "vip-travellers-a7k2" */
function generateGroupCode(name: string): string {
  return `${toKebabSlug(name)}-${generateSuffix()}`;
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

async function logGroupEvent(
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

router.use(tenantResolver);
router.use(requireTenant);
router.use(authenticate);
router.use(requireRole('admin', 'operator'));
router.use(adminRateLimiter);

// ─── GET /  (→ GET /api/v1/clients/groups) ───────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const schema = `"${toSchemaName(req.tenant!.slug)}"`;

    const includeInactive = req.query.include_inactive === 'true';
    const where = includeInactive ? '' : 'WHERE is_active = true';

    const groups = await prisma.$queryRawUnsafe<GroupRow[]>(
      `SELECT id::text AS id, name, group_code, description, is_active, created_by,
              created_at, updated_at
       FROM ${schema}.groups
       ${where}
       ORDER BY created_at DESC`
    );

    return res.status(200).json({ groups, total: groups.length });
  } catch (error) {
    console.error('List groups error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── POST /  (→ POST /api/v1/clients/groups) ─────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  try {
    const parseResult = createGroupSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parseResult.error.errors,
      });
    }

    const { name, description } = parseResult.data;
    const tenant = req.tenant!;
    const actor = req.user!;
    const schema = `"${toSchemaName(tenant.slug)}"`;

    // Generate a unique group_code (retry once on collision — extremely rare)
    let groupCode = generateGroupCode(name);
    const collision = await prisma.$queryRawUnsafe<GroupRow[]>(
      `SELECT group_code FROM ${schema}.groups WHERE group_code = $1`,
      groupCode
    );
    if (collision.length > 0) {
      groupCode = generateGroupCode(name);
    }

    const groupId = uuidv4();
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${schema}.groups
         (id, name, group_code, description, is_active, created_by)
       VALUES ($1::uuid, $2, $3, $4, true, $5)`,
      groupId,
      name,
      groupCode,
      description ?? null,
      actor.sub
    );

    const rows = await prisma.$queryRawUnsafe<GroupRow[]>(
      `SELECT id::text AS id, name, group_code, description, is_active, created_by,
              created_at, updated_at
       FROM ${schema}.groups
       WHERE id = $1::uuid`,
      groupId
    );

    await logGroupEvent(
      tenant.id, actor.sub, 'group_created',
      getClientIp(req), getUserAgent(req),
      { group_code: groupCode, name }
    );

    return res.status(201).json({
      message: 'Group created successfully',
      group: rows[0],
    });
  } catch (error) {
    console.error('Create group error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── GET /:code  (→ GET /api/v1/clients/groups/:code) ────────────────────────

router.get('/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const schema = `"${toSchemaName(req.tenant!.slug)}"`;

    const rows = await prisma.$queryRawUnsafe<GroupRow[]>(
      `SELECT id::text AS id, name, group_code, description, is_active, created_by,
              created_at, updated_at
       FROM ${schema}.groups
       WHERE group_code = $1`,
      code
    );

    if (rows.length === 0) {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found',
      });
    }

    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Get group error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── PATCH /:code  (→ PATCH /api/v1/clients/groups/:code) ────────────────────

router.patch('/:code', async (req: Request, res: Response) => {
  try {
    const parseResult = updateGroupSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parseResult.error.errors,
      });
    }

    const updates = parseResult.data;
    const code = req.params.code;
    const tenant = req.tenant!;
    const actor = req.user!;
    const schema = `"${toSchemaName(tenant.slug)}"`;

    // Verify group exists
    const existing = await prisma.$queryRawUnsafe<GroupRow[]>(
      `SELECT id::text AS id FROM ${schema}.groups WHERE group_code = $1`,
      code
    );
    if (existing.length === 0) {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found',
      });
    }

    // Build dynamic SET clause
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIdx++}`);
      values.push(updates.name);
    }
    if ('description' in updates) {
      setClauses.push(`description = $${paramIdx++}`);
      values.push(updates.description ?? null);
    }
    if (updates.is_active !== undefined) {
      setClauses.push(`is_active = $${paramIdx++}`);
      values.push(updates.is_active);
    }

    values.push(code); // WHERE param
    await prisma.$executeRawUnsafe(
      `UPDATE ${schema}.groups SET ${setClauses.join(', ')} WHERE group_code = $${paramIdx}`,
      ...values
    );

    const rows = await prisma.$queryRawUnsafe<GroupRow[]>(
      `SELECT id::text AS id, name, group_code, description, is_active, created_by,
              created_at, updated_at
       FROM ${schema}.groups
       WHERE group_code = $1`,
      code
    );

    await logGroupEvent(
      tenant.id, actor.sub, 'group_updated',
      getClientIp(req), getUserAgent(req),
      { group_code: code, fields: Object.keys(updates) }
    );

    return res.status(200).json({
      message: 'Group updated successfully',
      group: rows[0],
    });
  } catch (error) {
    console.error('Update group error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── DELETE /:code  (→ DELETE /api/v1/clients/groups/:code) ──────────────────

router.delete('/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const tenant = req.tenant!;
    const actor = req.user!;
    const schema = `"${toSchemaName(tenant.slug)}"`;

    const existing = await prisma.$queryRawUnsafe<GroupRow[]>(
      `SELECT id::text AS id FROM ${schema}.groups WHERE group_code = $1`,
      code
    );
    if (existing.length === 0) {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found',
      });
    }

    // Soft delete — set is_active = false
    await prisma.$executeRawUnsafe(
      `UPDATE ${schema}.groups SET is_active = false WHERE group_code = $1`,
      code
    );

    await logGroupEvent(
      tenant.id, actor.sub, 'group_deleted',
      getClientIp(req), getUserAgent(req),
      { group_code: code }
    );

    return res.status(200).json({
      message: 'Group deactivated successfully',
    });
  } catch (error) {
    console.error('Delete group error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── GET /:code/members ───────────────────────────────────────────────────────

router.get('/:code/members', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const schema = `"${toSchemaName(req.tenant!.slug)}"`;

    // Verify group exists
    const group = await prisma.$queryRawUnsafe<GroupRow[]>(
      `SELECT id::text AS id FROM ${schema}.groups WHERE group_code = $1`,
      code
    );
    if (group.length === 0) {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found',
      });
    }

    const members = await prisma.$queryRawUnsafe<MemberRow[]>(
      `SELECT gm.mobile_number, c.full_name, c.email, c.status,
              gm.added_by, gm.joined_at
       FROM ${schema}.group_members gm
       JOIN ${schema}.clients c ON c.mobile_number = gm.mobile_number
       WHERE gm.group_id = $1::uuid
       ORDER BY gm.joined_at DESC`,
      group[0].id
    );

    return res.status(200).json({
      group_code: code,
      members,
      total: members.length,
    });
  } catch (error) {
    console.error('List members error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── POST /:code/members ──────────────────────────────────────────────────────

router.post('/:code/members', async (req: Request, res: Response) => {
  try {
    const parseResult = addGroupMemberSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parseResult.error.errors,
      });
    }

    const { mobile_number } = parseResult.data;
    const code = req.params.code;
    const tenant = req.tenant!;
    const actor = req.user!;
    const schema = `"${toSchemaName(tenant.slug)}"`;

    // Verify group exists
    const group = await prisma.$queryRawUnsafe<GroupRow[]>(
      `SELECT id::text AS id FROM ${schema}.groups WHERE group_code = $1 AND is_active = true`,
      code
    );
    if (group.length === 0) {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found or inactive',
      });
    }

    // Verify client exists and is active
    const client = await prisma.$queryRawUnsafe<{ mobile_number: string }[]>(
      `SELECT mobile_number FROM ${schema}.clients
       WHERE mobile_number = $1 AND status = 'active'`,
      mobile_number
    );
    if (client.length === 0) {
      return res.status(404).json({
        code: 'CLIENT_NOT_FOUND',
        message: 'Client not found or not active',
      });
    }

    // Check for existing membership
    const existing = await prisma.$queryRawUnsafe<{ mobile_number: string }[]>(
      `SELECT mobile_number FROM ${schema}.group_members
       WHERE mobile_number = $1 AND group_id = $2::uuid`,
      mobile_number,
      group[0].id
    );
    if (existing.length > 0) {
      return res.status(409).json({
        code: 'ALREADY_A_MEMBER',
        message: 'Client is already a member of this group',
      });
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO ${schema}.group_members (mobile_number, group_id, added_by)
       VALUES ($1, $2::uuid, $3)`,
      mobile_number,
      group[0].id,
      actor.sub
    );

    await logGroupEvent(
      tenant.id, actor.sub, 'group_member_added',
      getClientIp(req), getUserAgent(req),
      { group_code: code, mobile_number }
    );

    return res.status(201).json({
      message: 'Member added successfully',
      group_code: code,
      mobile_number,
    });
  } catch (error) {
    console.error('Add member error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── DELETE /:code/members/:mobile ────────────────────────────────────────────

router.delete('/:code/members/:mobile', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const mobile = req.params.mobile;
    const tenant = req.tenant!;
    const actor = req.user!;
    const schema = `"${toSchemaName(tenant.slug)}"`;

    // Verify group exists
    const group = await prisma.$queryRawUnsafe<GroupRow[]>(
      `SELECT id::text AS id FROM ${schema}.groups WHERE group_code = $1`,
      code
    );
    if (group.length === 0) {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found',
      });
    }

    // Verify membership exists
    const membership = await prisma.$queryRawUnsafe<{ mobile_number: string }[]>(
      `SELECT mobile_number FROM ${schema}.group_members
       WHERE mobile_number = $1 AND group_id = $2::uuid`,
      mobile,
      group[0].id
    );
    if (membership.length === 0) {
      return res.status(404).json({
        code: 'MEMBER_NOT_FOUND',
        message: 'Client is not a member of this group',
      });
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM ${schema}.group_members
       WHERE mobile_number = $1 AND group_id = $2::uuid`,
      mobile,
      group[0].id
    );

    await logGroupEvent(
      tenant.id, actor.sub, 'group_member_removed',
      getClientIp(req), getUserAgent(req),
      { group_code: code, mobile_number: mobile }
    );

    return res.status(200).json({
      message: 'Member removed successfully',
    });
  } catch (error) {
    console.error('Remove member error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

export default router;
