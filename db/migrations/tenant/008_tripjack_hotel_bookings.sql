-- ============================================================================
-- Migration: 008_tripjack_hotel_bookings.sql
-- TripJack Hotel Bookings Store
-- ============================================================================
-- Template SQL executed inside each tenant schema.
-- Requires search_path = "tenant_{slug}" before execution.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tripjack_hotel_bookings (
  booking_id        UUID        NOT NULL DEFAULT gen_random_uuid(),
  tripjack_booking_id TEXT       NOT NULL,
  tenant_id         UUID        NOT NULL,
  created_by        TEXT        NOT NULL,
  hotel_id          TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tripjack_hotel_bookings_pkey PRIMARY KEY (booking_id),
  CONSTRAINT tripjack_hotel_bookings_tripjack_id_key UNIQUE (tripjack_booking_id)
);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_bookings_tenant_id
  ON tripjack_hotel_bookings (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_bookings_created_by
  ON tripjack_hotel_bookings (created_by);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_bookings_hotel_id
  ON tripjack_hotel_bookings (hotel_id);

DROP TRIGGER IF EXISTS trg_tripjack_hotel_bookings_updated_at ON tripjack_hotel_bookings;
CREATE TRIGGER trg_tripjack_hotel_bookings_updated_at
  BEFORE UPDATE ON tripjack_hotel_bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tripjack_hotel_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tripjack_hotel_bookings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tripjack_hotel_bookings_tenant_context ON tripjack_hotel_bookings;
CREATE POLICY tripjack_hotel_bookings_tenant_context ON tripjack_hotel_bookings
  USING (current_setting('app.current_tenant_id', true) IS NOT NULL
         AND current_setting('app.current_tenant_id', true) <> '');

GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_hotel_bookings TO authuser;
