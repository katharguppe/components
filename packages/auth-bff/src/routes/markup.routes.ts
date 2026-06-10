/**
 * Tenant Markup Routes
 * BFF prefix: /api/v1/markups
 */

import { randomUUID } from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { enableMarkupRulesForTenant, toSchemaName } from '../db/tenant-provisioner';
import { authenticate, requireRole, requireSameTenant } from '../middleware/auth.middleware';
import { tenantResolver, requireTenant } from '../middleware/tenant.middleware';
import {
  createMarkupRuleSchema,
  markupRuleIdSchema,
  markupRuleListQuerySchema,
  MarkupRuleListQuery,
} from '../schemas/markup.schema';

const router = Router();

router.use(tenantResolver);
router.use(requireTenant);
router.use(authenticate);
router.use(requireSameTenant);
router.use(requireRole('admin', 'operator'));

function validationError(res: Response, errors: unknown): Response {
  return res.status(400).json({
    success: false,
    message: 'Validation error',
    errors,
  });
}

function tenantSchema(req: Request): string {
  return toSchemaName(req.tenant!.slug);
}

function mapMarkupRule(row: any): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenantId,
    productType: row.productType,
    markupType: row.markupType,
    amountType: row.amountType,
    value: row.value === null ? null : Number(row.value),
    airlines: row.airlines || [],
    paxTypes: row.paxTypes || [],
    isActive: row.isActive,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function listWhereClause(query: MarkupRuleListQuery): { sql: string; params: unknown[] } {
  const clauses = ['tenant_id = $1::uuid'];
  const params: unknown[] = [];

  if (query.productType) {
    params.push(query.productType);
    clauses.push(`product_type = $${params.length + 1}`);
  }

  if (query.markupType) {
    params.push(query.markupType);
    clauses.push(`markup_type = $${params.length + 1}`);
  }

  if (query.amountType) {
    params.push(query.amountType);
    clauses.push(`amount_type = $${params.length + 1}`);
  }

  if (query.isActive !== undefined) {
    params.push(query.isActive === 'true');
    clauses.push(`is_active = $${params.length + 1}`);
  }

  return { sql: clauses.join(' AND '), params };
}

async function ensureMarkupTable(req: Request): Promise<void> {
  await enableMarkupRulesForTenant(req.tenant!.slug);
}

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = createMarkupRuleSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    await ensureMarkupTable(req);

    const schemaName = tenantSchema(req);
    const id = randomUUID();
    const payload = validation.data;

    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        req.tenant!.id
      );

      return tx.$queryRawUnsafe<any[]>(
        `
          INSERT INTO "${schemaName}".markup_rules (
            id, tenant_id, product_type, markup_type, amount_type, amount_value,
            airlines, pax_types, is_active, created_by, raw_request, created_at, updated_at
          ) VALUES (
            $1::uuid, $2::uuid, $3, $4, $5, $6,
            CAST($7 AS JSONB), CAST($8 AS JSONB), $9, $10, CAST($11 AS JSONB), NOW(), NOW()
          )
          RETURNING
            id,
            tenant_id AS "tenantId",
            product_type AS "productType",
            markup_type AS "markupType",
            amount_type AS "amountType",
            amount_value AS "value",
            airlines,
            pax_types AS "paxTypes",
            is_active AS "isActive",
            created_by AS "createdBy",
            updated_by AS "updatedBy",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        id,
        req.tenant!.id,
        payload.productType,
        payload.markupType,
        payload.amountType,
        payload.value ?? null,
        JSON.stringify(payload.airlines),
        JSON.stringify(payload.paxTypes),
        payload.isActive,
        req.user!.sub,
        JSON.stringify(payload)
      );
    });

    return res.status(201).json({ success: true, data: mapMarkupRule(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = markupRuleListQuerySchema.safeParse(req.query);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    await ensureMarkupTable(req);

    const schemaName = tenantSchema(req);
    const where = listWhereClause(validation.data);

    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        req.tenant!.id
      );

      return tx.$queryRawUnsafe<any[]>(
        `
          SELECT
            id,
            tenant_id AS "tenantId",
            product_type AS "productType",
            markup_type AS "markupType",
            amount_type AS "amountType",
            amount_value AS "value",
            airlines,
            pax_types AS "paxTypes",
            is_active AS "isActive",
            created_by AS "createdBy",
            updated_by AS "updatedBy",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM "${schemaName}".markup_rules
          WHERE ${where.sql}
          ORDER BY created_at DESC
        `,
        req.tenant!.id,
        ...where.params
      );
    });

    return res.status(200).json({ success: true, data: rows.map(mapMarkupRule) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = markupRuleIdSchema.safeParse(req.params);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    await ensureMarkupTable(req);

    const schemaName = tenantSchema(req);
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        req.tenant!.id
      );

      return tx.$queryRawUnsafe<any[]>(
        `
          SELECT
            id,
            tenant_id AS "tenantId",
            product_type AS "productType",
            markup_type AS "markupType",
            amount_type AS "amountType",
            amount_value AS "value",
            airlines,
            pax_types AS "paxTypes",
            is_active AS "isActive",
            created_by AS "createdBy",
            updated_by AS "updatedBy",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM "${schemaName}".markup_rules
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          LIMIT 1
        `,
        req.tenant!.id,
        validation.data.id
      );
    });

    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Markup rule not found' });
    }

    return res.status(200).json({ success: true, data: mapMarkupRule(rows[0]) });
  } catch (error) {
    next(error);
  }
});

export default router;
