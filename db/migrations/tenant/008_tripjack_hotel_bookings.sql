-- ============================================================================
-- Migration: 008_tripjack_hotel_bookings.sql
-- TripJack Hotel Bookings Store + Status Tracking
-- ============================================================================
-- Template SQL executed inside each tenant schema.
-- Requires search_path = "tenant_{slug}" before execution.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tripjack_hotel_bookings (
  booking_id        TEXT        NOT NULL,
  tenant_id         UUID        NOT NULL,
  created_by        TEXT        NOT NULL,
  hotel_id          TEXT        NOT NULL,
  hotel_name        TEXT,
  option_id         TEXT,
  review_hash       TEXT,
  status            TEXT        NOT NULL DEFAULT 'PENDING',
  correlation_id    TEXT,
  nationality       TEXT,
  currency          TEXT,
  check_in          DATE,
  check_out         DATE,
  rooms             JSONB,
  traveller_info    JSONB,
  delivery_info     JSONB,
  gst_info          JSONB,
  review_request    JSONB,
  review_response   JSONB,
  book_request      JSONB,
  book_response     JSONB,
  booking_detail    JSONB,
  cancel_request    JSONB,
  cancel_response   JSONB,
  raw_response      JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tripjack_hotel_bookings_pkey
    PRIMARY KEY (booking_id),

  CONSTRAINT tripjack_hotel_bookings_status_valid
    CHECK (status IN (
      'PENDING',
      'IN_PROGRESS',
      'PAYMENT_SUCCESS',
      'PAYMENT_PENDING',
      'SUCCESS',
      'ON_HOLD',
      'ABORTED',
      'FAILED',
      'CANCELLATION_PENDING',
      'CANCELLED'
    ))
);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_bookings_tenant_id
  ON tripjack_hotel_bookings (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_bookings_created_by
  ON tripjack_hotel_bookings (created_by);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_bookings_status
  ON tripjack_hotel_bookings (status);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_bookings_hotel_id
  ON tripjack_hotel_bookings (hotel_id);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_bookings_option_id
  ON tripjack_hotel_bookings (option_id);

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
