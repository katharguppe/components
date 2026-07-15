/**
 * Tenant Provisioner
 * Creates and manages per-tenant schemas for the client module.
 *
 * Sprint 03 Architecture:
 *   - Client module tables (clients, client_preferences, groups, group_members)
 *     live in a dedicated per-tenant schema: tenant_{slug_underscored}
 *   - The public schema (managed by Prisma) is NOT modified here.
 *   - Call enableClientModuleForTenant() once per tenant before using
 *     any client module routes.
 *   - Call setClientModuleContext() at the start of each request handler
 *     that queries client module tables, then resetClientModuleContext() after.
 */

import fs from 'fs';
import path from 'path';
import { prisma } from './prisma';

// Path to the migration template SQL (relative to compiled or source output)
// src/db/  →  ../../../../db/migrations/tenant/  =  saas-auth/db/migrations/tenant/
const CLIENT_MODULE_SQL = path.resolve(
  __dirname,
  '../../../../db/migrations/tenant/003_client_module.sql'
);

const TRIPJACK_FLIGHT_SQL = path.resolve(
  __dirname,
  '../../../../db/migrations/tenant/005_tripjack_flight_bookings.sql'
);

const MARKUP_RULES_SQL = path.resolve(
  __dirname,
  '../../../../db/migrations/tenant/006_markup_rules.sql'
);

const TRIPJACK_HOTEL_STATIC_SQL = path.resolve(
  __dirname,
  '../../../../db/migrations/tenant/007_tripjack_hotel_static_content.sql'
);

// ─── Schema Naming ──────────────────────────────────────────────────────────

/**
 * Convert a tenant slug to a PostgreSQL schema name.
 * e.g., "acme-corp" → "tenant_acme_corp"
 *
 * Throws if the slug contains characters outside [a-z0-9-] — defence-in-depth
 * against SQL identifier injection via the schema name interpolation used in
 * all route files (e.g., `"${toSchemaName(slug)}".clients`).
 * Tenant slugs are already constrained by operator.routes.ts on creation, but
 * we enforce it here too.
 */
export function toSchemaName(tenantSlug: string): string {
  if (!/^[a-z0-9-]+$/.test(tenantSlug)) {
    throw new Error(`Invalid tenant slug format: "${tenantSlug}"`);
  }
  return `tenant_${tenantSlug.replace(/-/g, '_')}`;
}

// ─── SQL Splitter ────────────────────────────────────────────────────────────

/**
 * Split a SQL file into individual statements.
 * Correctly handles PL/pgSQL blocks delimited by $$ dollar-quoting,
 * so semicolons inside function bodies are not treated as statement ends.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';
  let i = 0;

  while (i < sql.length) {
    // Skip single-line comments (-- ... newline) outside dollar-quoted blocks.
    // This prevents semicolons inside comments from being treated as statement
    // terminators, which would corrupt the statement extraction.
    if (!inDollarQuote && sql[i] === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Detect start of a dollar-quoted block (e.g., $$ or $TAG$)
    if (!inDollarQuote && sql[i] === '$') {
      const tagEnd = sql.indexOf('$', i + 1);
      if (tagEnd !== -1) {
        const tag = sql.substring(i, tagEnd + 1);
        if (/^\$[A-Za-z_]*\$$/.test(tag)) {
          inDollarQuote = true;
          dollarTag = tag;
          current += tag;
          i = tagEnd + 1;
          continue;
        }
      }
    }

    // Detect end of a dollar-quoted block
    if (inDollarQuote && sql.startsWith(dollarTag, i)) {
      current += dollarTag;
      i += dollarTag.length;
      inDollarQuote = false;
      dollarTag = '';
      continue;
    }

    // Statement terminator (only outside dollar-quoted blocks)
    if (!inDollarQuote && sql[i] === ';') {
      const stmt = current.trim();
      if (stmt) {
        statements.push(stmt);
      }
      current = '';
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  // Capture any trailing content after the last semicolon
  const remaining = current.trim();
  if (remaining && !remaining.startsWith('--')) {
    statements.push(remaining);
  }

  return statements;
}

// ─── Provisioning ────────────────────────────────────────────────────────────

/**
 * Check whether the client module has already been provisioned for a tenant.
 * Looks for the 'clients' table in the tenant's schema.
 */
export async function clientModuleExists(tenantSlug: string): Promise<boolean> {
  const schemaName = toSchemaName(tenantSlug);

  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM   information_schema.tables
      WHERE  table_schema = ${schemaName}
        AND  table_name   = 'clients'
    ) AS exists
  `;

  return result[0]?.exists ?? false;
}

/**
 * Check whether the markup rules table has already been provisioned for a tenant.
 */
export async function markupRulesExist(tenantSlug: string): Promise<boolean> {
  const schemaName = toSchemaName(tenantSlug);

  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM   information_schema.tables
      WHERE  table_schema = ${schemaName}
        AND  table_name   = 'markup_rules'
    ) AS exists
  `;

  return result[0]?.exists ?? false;
}

/**
 * Check whether TripJack hotel static content tables have been provisioned.
 */
export async function tripjackHotelStaticContentExist(tenantSlug: string): Promise<boolean> {
  const schemaName = toSchemaName(tenantSlug);

  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM   information_schema.tables
      WHERE  table_schema = ${schemaName}
        AND  table_name   = 'tripjack_hotel_static_content'
    ) AS exists
  `;

  return result[0]?.exists ?? false;
}

/**
 * Create the per-tenant schema and run the client module migration.
 *
 * Idempotent — safe to call multiple times. Existing tables and indexes
 * are not recreated (migration uses IF NOT EXISTS / CREATE OR REPLACE).
 *
 * @param tenantSlug  The tenant's URL-safe slug, e.g. "acme-corp".
 * @throws            If the migration SQL file cannot be read or any
 *                    statement fails.
 */
export async function enableClientModuleForTenant(tenantSlug: string): Promise<void> {
  const schemaName = toSchemaName(tenantSlug);

  if (!fs.existsSync(CLIENT_MODULE_SQL)) {
    throw new Error(
      `Client module migration file not found: ${CLIENT_MODULE_SQL}`
    );
  }

  const migrationSql = fs.readFileSync(CLIENT_MODULE_SQL, 'utf8');
  const statements = splitStatements(migrationSql);

  if (statements.length === 0) {
    throw new Error('Client module migration file is empty or contains no statements');
  }

  // PostgreSQL GRANT and CREATE SCHEMA are not rolled back on transaction
  // abort (they are "non-transactional DDL" in PG). Run them outside the
  // transaction first so the schema always exists before the DDL block runs.
  // If the DDL transaction below fails, the empty schema remains; a subsequent
  // call will re-enter the transaction and complete the tables (idempotent).
  await prisma.$executeRawUnsafe(
    `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`
  );
  await prisma.$executeRawUnsafe(
    `GRANT USAGE ON SCHEMA "${schemaName}" TO authuser`
  );

  // Run table DDL inside a transaction for atomicity.
  // SET LOCAL scopes search_path to this transaction only — safe in a
  // connection pool because the session default is restored on COMMIT/ROLLBACK.
  await prisma.$transaction(async (tx) => {
    // Scope search_path to this tenant schema for the duration of the transaction.
    // IMPORTANT: PostgreSQL resolves function OIDs at trigger-creation time using
    // the current search_path. Because SET LOCAL is in effect here, all
    // "EXECUTE FUNCTION set_updated_at()" clauses in the migration resolve to
    // tenant_{slug}.set_updated_at — not public.set_updated_at — and that OID
    // is stored permanently in the trigger. Runtime search_path does not matter.
    await tx.$executeRawUnsafe(
      `SET LOCAL search_path = "${schemaName}"`
    );

    // Execute each migration statement in order
    for (const stmt of statements) {
      await tx.$executeRawUnsafe(stmt);
    }
  });

  console.log(
    `[tenant-provisioner] Client module enabled for tenant "${tenantSlug}" → schema "${schemaName}"`
  );
}

/**
 * Create the tenant schema if needed, ensure the client module exists, and run
 * the TripJack flight booking migration inside the tenant schema.
 */
export async function enableTripJackFlightBookingsForTenant(tenantSlug: string): Promise<void> {
  const schemaName = toSchemaName(tenantSlug);

  await enableClientModuleForTenant(tenantSlug);

  if (!fs.existsSync(TRIPJACK_FLIGHT_SQL)) {
    throw new Error(`TripJack flight migration file not found: ${TRIPJACK_FLIGHT_SQL}`);
  }

  const migrationSql = fs.readFileSync(TRIPJACK_FLIGHT_SQL, 'utf8');
  const statements = splitStatements(migrationSql);

  if (statements.length === 0) {
    throw new Error('TripJack flight migration file is empty or contains no statements');
  }

  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA "${schemaName}" TO authuser`);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path = "${schemaName}"`);
    for (const stmt of statements) {
      await tx.$executeRawUnsafe(stmt);
    }
  });

  console.log(
    `[tenant-provisioner] TripJack flight bookings enabled for tenant "${tenantSlug}" → schema "${schemaName}"`
  );
}

/**
 * Create the tenant schema if needed, ensure common tenant helpers exist, and
 * run the markup rules migration inside the tenant schema.
 */
export async function enableMarkupRulesForTenant(tenantSlug: string): Promise<void> {
  const schemaName = toSchemaName(tenantSlug);

  if (await markupRulesExist(tenantSlug)) {
    return;
  }

  await enableClientModuleForTenant(tenantSlug);

  if (!fs.existsSync(MARKUP_RULES_SQL)) {
    throw new Error(`Markup rules migration file not found: ${MARKUP_RULES_SQL}`);
  }

  const migrationSql = fs.readFileSync(MARKUP_RULES_SQL, 'utf8');
  const statements = splitStatements(migrationSql);

  if (statements.length === 0) {
    throw new Error('Markup rules migration file is empty or contains no statements');
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      `markup_rules:${schemaName}`
    );

    const existing = await tx.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM   information_schema.tables
        WHERE  table_schema = ${schemaName}
          AND  table_name   = 'markup_rules'
      ) AS exists
    `;

    if (existing[0]?.exists) {
      return;
    }

    await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA "${schemaName}" TO authuser`);
    await tx.$executeRawUnsafe(`SET LOCAL search_path = "${schemaName}"`);
    for (const stmt of statements) {
      await tx.$executeRawUnsafe(stmt);
    }
  });

  console.log(
    `[tenant-provisioner] Markup rules enabled for tenant "${tenantSlug}" → schema "${schemaName}"`
  );
}

/**
 * Create TripJack hotel static content tables for a tenant schema.
 */
export async function enableTripJackHotelStaticContentForTenant(tenantSlug: string): Promise<void> {
  const schemaName = toSchemaName(tenantSlug);

  if (await tripjackHotelStaticContentExist(tenantSlug)) {
    return;
  }

  if (!fs.existsSync(TRIPJACK_HOTEL_STATIC_SQL)) {
    throw new Error(`TripJack hotel static migration file not found: ${TRIPJACK_HOTEL_STATIC_SQL}`);
  }

  const migrationSql = fs.readFileSync(TRIPJACK_HOTEL_STATIC_SQL, 'utf8');
  const statements = splitStatements(migrationSql);

  if (statements.length === 0) {
    throw new Error('TripJack hotel static migration file is empty or contains no statements');
  }

  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA "${schemaName}" TO authuser`);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path = "${schemaName}"`);
    for (const stmt of statements) {
      await tx.$executeRawUnsafe(stmt);
    }
  });

  console.log(
    `[tenant-provisioner] TripJack hotel static content enabled for tenant "${tenantSlug}" → schema "${schemaName}"`
  );
}

// ─── Per-Request Context Helpers ────────────────────────────────────────────

/**
 * Set the Postgres search_path to the tenant's client module schema.
 *
 * Call this at the start of every request handler that queries client
 * module tables using raw SQL. Pair with resetClientModuleContext().
 *
 * WARNING: This is a session-scoped SET — it persists on the connection
 * after the request. Always call resetClientModuleContext() when done.
 * For request-scoped isolation, wrap queries in a transaction and use
 * SET LOCAL instead.
 *
 * @param tenantSlug  The tenant's URL-safe slug, e.g. "acme-corp".
 */
export async function setClientModuleContext(tenantSlug: string): Promise<void> {
  const schemaName = toSchemaName(tenantSlug);
  await prisma.$executeRawUnsafe(`SET search_path = "${schemaName}"`);
}

/**
 * Reset the Postgres search_path to the default (public schema).
 * Call after finishing client module queries to prevent schema bleed
 * to subsequent requests on the same connection.
 */
export async function resetClientModuleContext(): Promise<void> {
  await prisma.$executeRawUnsafe(`RESET search_path`);
}
