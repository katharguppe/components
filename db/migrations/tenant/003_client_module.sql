-- ============================================================================
-- Migration: 003_client_module.sql
-- Sprint 03 — Client Module (4 tables + RLS)
-- ============================================================================
-- PURPOSE
--   Template SQL executed inside each tenant's dedicated schema by
--   enableClientModuleForTenant() in tenant-provisioner.ts.
--   This file is NOT a Prisma migration. It is raw SQL run via:
--     SET search_path = "tenant_{slug}";
--     <contents of this file>
--
-- SCHEMA CONVENTION
--   Schema name: tenant_{slug_underscored}
--   e.g., tenant "acme-corp" → schema "tenant_acme_corp"
--
-- DESIGN NOTES
--   • No tenant_id column: the schema itself is the tenant boundary.
--   • RLS enabled on all 4 tables as defence-in-depth per CLAUDE.md.
--     Policy: deny access when no tenant context is set in the session.
--   • FKs inside this schema only (no cross-schema FKs).
--   • created_by / added_by are TEXT (user UUID from JWT claim, not FK).
--   • updated_at is maintained by the set_updated_at() trigger.
--   • All timestamps UTC (TIMESTAMPTZ).
-- ============================================================================

-- ─── Guard: require search_path to be set before running ───────────────────
-- (Enforced at the application layer; this comment is a reminder.)
-- DO NOT run this file against the public schema.

-- ─── Trigger Function: auto-update updated_at ──────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLE 1: clients
-- Primary key is the E.164 mobile number (globally unique per tenant).
-- ============================================================================

CREATE TABLE IF NOT EXISTS clients (
  mobile_number  VARCHAR(16)  NOT NULL,
  full_name      TEXT         NOT NULL,
  email          TEXT,
  date_of_birth  DATE,
  status         TEXT         NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT clients_pkey
    PRIMARY KEY (mobile_number),

  -- E.164 format: +<country_code><number>, 8–15 digits total
  CONSTRAINT clients_mobile_e164
    CHECK (mobile_number ~ '^\+[1-9][0-9]{7,14}$'),

  CONSTRAINT clients_status_valid
    CHECK (status IN ('active', 'inactive', 'blocked')),

  -- Email uniqueness within this tenant schema (nullable, so allow NULLs)
  CONSTRAINT clients_email_unique
    UNIQUE (email)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clients_status
  ON clients (status);

CREATE INDEX IF NOT EXISTS idx_clients_email
  ON clients (email)
  WHERE email IS NOT NULL;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS on clients ─────────────────────────────────────────────────────────

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;

-- Allow access only when a tenant context session variable is set.
-- The real isolation is the schema; this policy catches misconfigured callers.
DROP POLICY IF EXISTS client_module_tenant_context ON clients;
CREATE POLICY client_module_tenant_context ON clients
  USING (current_setting('app.current_tenant_id', true) IS NOT NULL
         AND current_setting('app.current_tenant_id', true) <> '');

-- ============================================================================
-- TABLE 2: client_preferences
-- 1:1 with clients. JSONB blob for all preference data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_preferences (
  mobile_number  VARCHAR(16)  NOT NULL,
  preferences    JSONB        NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT client_preferences_pkey
    PRIMARY KEY (mobile_number),

  CONSTRAINT client_preferences_mobile_fk
    FOREIGN KEY (mobile_number)
    REFERENCES clients (mobile_number)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_client_preferences_updated_at ON client_preferences;
CREATE TRIGGER trg_client_preferences_updated_at
  BEFORE UPDATE ON client_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS on client_preferences ──────────────────────────────────────────────

ALTER TABLE client_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_module_tenant_context ON client_preferences;
CREATE POLICY client_module_tenant_context ON client_preferences
  USING (current_setting('app.current_tenant_id', true) IS NOT NULL
         AND current_setting('app.current_tenant_id', true) <> '');

-- ============================================================================
-- TABLE 3: groups
-- Tenant-scoped dynamic groups. group_code is the human-friendly identifier.
-- Format: kebab-slug-from-name + 4-char nanoid suffix.
-- e.g., "VIP Travellers" → "vip-travellers-a7k2"
-- ============================================================================

CREATE TABLE IF NOT EXISTS groups (
  id           UUID         NOT NULL DEFAULT gen_random_uuid(),
  name         TEXT         NOT NULL,
  group_code   TEXT         NOT NULL,
  description  TEXT,
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_by   TEXT         NOT NULL,  -- user UUID from JWT, TEXT (not FK)
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT groups_pkey
    PRIMARY KEY (id),

  CONSTRAINT groups_group_code_unique
    UNIQUE (group_code),

  -- group_code: lowercase alphanumeric + hyphens, ends with -XXXX suffix
  CONSTRAINT groups_group_code_format
    CHECK (group_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_groups_is_active
  ON groups (is_active);

CREATE INDEX IF NOT EXISTS idx_groups_created_by
  ON groups (created_by);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_groups_updated_at ON groups;
CREATE TRIGGER trg_groups_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS on groups ──────────────────────────────────────────────────────────

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_module_tenant_context ON groups;
CREATE POLICY client_module_tenant_context ON groups
  USING (current_setting('app.current_tenant_id', true) IS NOT NULL
         AND current_setting('app.current_tenant_id', true) <> '');

-- ============================================================================
-- TABLE 4: group_members
-- M:M join between clients and groups.
-- Composite PK: (mobile_number, group_id)
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_members (
  mobile_number  VARCHAR(16)  NOT NULL,
  group_id       UUID         NOT NULL,
  added_by       TEXT         NOT NULL,  -- user UUID from JWT
  joined_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT group_members_pkey
    PRIMARY KEY (mobile_number, group_id),

  CONSTRAINT group_members_mobile_fk
    FOREIGN KEY (mobile_number)
    REFERENCES clients (mobile_number)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT group_members_group_fk
    FOREIGN KEY (group_id)
    REFERENCES groups (id)
    ON DELETE CASCADE
);

-- Indexes (support lookups in both directions)
CREATE INDEX IF NOT EXISTS idx_group_members_group_id
  ON group_members (group_id);

CREATE INDEX IF NOT EXISTS idx_group_members_mobile_number
  ON group_members (mobile_number);

-- ─── RLS on group_members ───────────────────────────────────────────────────

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_module_tenant_context ON group_members;
CREATE POLICY client_module_tenant_context ON group_members
  USING (current_setting('app.current_tenant_id', true) IS NOT NULL
         AND current_setting('app.current_tenant_id', true) <> '');

-- ============================================================================
-- GRANT permissions to the application DB user
-- The user name must match POSTGRES_USER in docker-compose.yml ("authuser").
-- ============================================================================

-- NOTE: Schema USAGE grant is executed by tenant-provisioner.ts before
-- running this file, because GRANT USAGE ON SCHEMA requires the schema name
-- as a literal (CURRENT_SCHEMA() is not valid here).
-- GRANT USAGE ON SCHEMA tenant_{slug} TO authuser;  ← done in provisioner

GRANT SELECT, INSERT, UPDATE, DELETE ON clients           TO authuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON client_preferences TO authuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON groups            TO authuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON group_members     TO authuser;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Table             PK                  RLS   trigger
-- ─────────────────────────────────────────────────────────────────────
-- clients           mobile_number       YES   set_updated_at
-- client_preferences mobile_number      YES   set_updated_at
-- groups            id (UUID)           YES   set_updated_at
-- group_members     (mobile, group_id)  YES   none (no updated_at)
-- ============================================================================
