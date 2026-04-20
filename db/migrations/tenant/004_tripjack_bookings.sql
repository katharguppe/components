-- ============================================================================
-- Migration: 004_tripjack_bookings.sql
-- Sprint 04 — TripJack Hotel Integration (1 table + RLS)
-- ============================================================================
-- PURPOSE
--   Template SQL executed inside each tenant's dedicated schema by
--   enableTripJackBookingsForTenant() in tenant-provisioner.ts.
--   This file is NOT a Prisma migration. It is raw SQL run via:
--     SET search_path = "tenant_{slug}";
--     <contents of this file>
--
-- SCHEMA CONVENTION
--   Schema name: tenant_{slug_underscored}
--   e.g., tenant "acme-corp" → schema "tenant_acme_corp"
--
-- DESIGN NOTES
--   • tripjack_bookings stores hotel booking records per tenant.
--   • RLS enabled: isolation via schema + tenant context session variable.
--   • created_by is VARCHAR(15) mobile_number (FK to clients).
--   • booking_id: TJS + 12 random digits, generated server-side in route layer.
--   • tj_hotel_id: v3.0 field name (not old API 'id').
--   • contact_info: v3.0 field (replaces old API 'delivery_info').
--   • updated_at is maintained by the set_updated_at() trigger (defined in 003).
--   • All timestamps UTC (TIMESTAMPTZ).
-- ============================================================================

-- ─── Guard: require search_path to be set before running ───────────────────
-- (Enforced at the application layer; this comment is a reminder.)
-- DO NOT run this file against the public schema.

-- ============================================================================
-- TABLE: tripjack_bookings
-- Stores hotel booking records from TripJack v3.0 API.
-- PK: booking_id (TJS + 12 digits, e.g., TJS209400037089)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tripjack_bookings (
  booking_id       VARCHAR(30)  NOT NULL,
  search_id        VARCHAR(50),
  tj_hotel_id      VARCHAR(50),
  option_id        VARCHAR(50),
  review_id        VARCHAR(50),
  pnr              VARCHAR(20),
  tenant_id        UUID         NOT NULL,
  created_by       VARCHAR(15)  NOT NULL,
  status           VARCHAR(30)  NOT NULL DEFAULT 'CONFIRMED',
  checkin_date     DATE         NOT NULL,
  checkout_date    DATE         NOT NULL,
  total_amount     NUMERIC(12,2),
  currency         VARCHAR(3)   NOT NULL DEFAULT 'INR',
  traveller_info   JSONB,
  contact_info     JSONB,
  raw_response     JSONB,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT tripjack_bookings_pkey
    PRIMARY KEY (booking_id),

  CONSTRAINT tripjack_bookings_created_by_fk
    FOREIGN KEY (created_by)
    REFERENCES clients (mobile_number)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT tripjack_bookings_status_valid
    CHECK (status IN ('CONFIRMED', 'CANCELLED'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tripjack_bookings_tenant_id
  ON tripjack_bookings (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tripjack_bookings_created_by
  ON tripjack_bookings (created_by);

CREATE INDEX IF NOT EXISTS idx_tripjack_bookings_search_id
  ON tripjack_bookings (search_id);

CREATE INDEX IF NOT EXISTS idx_tripjack_bookings_status
  ON tripjack_bookings (status);

CREATE INDEX IF NOT EXISTS idx_tripjack_bookings_traveller_info_gin
  ON tripjack_bookings USING GIN (traveller_info);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_tripjack_bookings_updated_at ON tripjack_bookings;
CREATE TRIGGER trg_tripjack_bookings_updated_at
  BEFORE UPDATE ON tripjack_bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS on tripjack_bookings ───────────────────────────────────────────────

ALTER TABLE tripjack_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tripjack_bookings FORCE ROW LEVEL SECURITY;

-- Allow access only when a tenant context session variable is set.
-- The real isolation is the schema; this policy catches misconfigured callers.
DROP POLICY IF EXISTS tripjack_bookings_tenant_context ON tripjack_bookings;
CREATE POLICY tripjack_bookings_tenant_context ON tripjack_bookings
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

GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_bookings TO authuser;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Table             PK                  RLS   trigger
-- ─────────────────────────────────────────────────────────────────────
-- tripjack_bookings booking_id (TJS+12) YES   set_updated_at
-- ============================================================================
