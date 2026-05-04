-- ============================================================================
-- Migration: 005_tripjack_flight_bookings.sql
-- Sprint 05 — TripJack Flight Integration (1 table + RLS)
-- ============================================================================
-- Template SQL executed inside each tenant schema after 003_client_module.sql.
-- Requires search_path = "tenant_{slug}" before execution.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tripjack_flight_bookings (
  booking_id       VARCHAR(60)  NOT NULL,
  tenant_id        UUID         NOT NULL,
  created_by       TEXT         NOT NULL,
  status           VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
  pnr              VARCHAR(30),
  ticket_numbers   JSONB,
  amount           NUMERIC(12,2),
  currency         VARCHAR(3)   NOT NULL DEFAULT 'INR',
  price_ids        JSONB,
  route_infos      JSONB,
  traveller_info   JSONB,
  delivery_info    JSONB,
  raw_response     JSONB,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT tripjack_flight_bookings_pkey
    PRIMARY KEY (booking_id),

  CONSTRAINT tripjack_flight_bookings_status_valid
    CHECK (status IN ('SUCCESS', 'ON_HOLD', 'PENDING', 'CANCELLED', 'FAILED', 'ABORTED', 'UNCONFIRMED'))
);

CREATE INDEX IF NOT EXISTS idx_tripjack_flight_bookings_tenant_id
  ON tripjack_flight_bookings (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tripjack_flight_bookings_created_by
  ON tripjack_flight_bookings (created_by);

CREATE INDEX IF NOT EXISTS idx_tripjack_flight_bookings_status
  ON tripjack_flight_bookings (status);

CREATE INDEX IF NOT EXISTS idx_tripjack_flight_bookings_price_ids_gin
  ON tripjack_flight_bookings USING GIN (price_ids);

CREATE INDEX IF NOT EXISTS idx_tripjack_flight_bookings_traveller_info_gin
  ON tripjack_flight_bookings USING GIN (traveller_info);

DROP TRIGGER IF EXISTS trg_tripjack_flight_bookings_updated_at ON tripjack_flight_bookings;
CREATE TRIGGER trg_tripjack_flight_bookings_updated_at
  BEFORE UPDATE ON tripjack_flight_bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tripjack_flight_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tripjack_flight_bookings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tripjack_flight_bookings_tenant_context ON tripjack_flight_bookings;
CREATE POLICY tripjack_flight_bookings_tenant_context ON tripjack_flight_bookings
  USING (current_setting('app.current_tenant_id', true) IS NOT NULL
         AND current_setting('app.current_tenant_id', true) <> '');

GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_flight_bookings TO authuser;
