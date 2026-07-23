-- ============================================================================
-- Migration: 007_tripjack_hotel_static_content.sql
-- Sprint 04A - TripJack Hotel Static Content Storage
-- ============================================================================
-- PURPOSE
--   Creates per-tenant tables for TripJack hotel static data so the app can
--   download the V3 static content APIs once and store the results locally.
--   This file is executed inside each tenant schema by the tenant provisioner.
--
-- TABLES
--   tripjack_hotel_countries
--   tripjack_city_region_ids
--   tripjack_hotel_mappings
--   tripjack_hotel_static_content
--   tripjack_hotel_sync_state
-- ============================================================================

CREATE TABLE IF NOT EXISTS tripjack_hotel_countries (
  country_name   TEXT PRIMARY KEY,
  source         TEXT NOT NULL DEFAULT 'fetch-countries',
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tripjack_city_region_ids (
  city_region_id   BIGINT PRIMARY KEY,
  city_name        TEXT NOT NULL,
  region_name      TEXT NOT NULL,
  country_name     TEXT NOT NULL,
  region_type      TEXT NOT NULL,
  full_region_name TEXT NOT NULL,
  source           TEXT NOT NULL DEFAULT 'fetch-city-regionIds',
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tripjack_city_region_country
  ON tripjack_city_region_ids (country_name);

CREATE INDEX IF NOT EXISTS idx_tripjack_city_region_city
  ON tripjack_city_region_ids (city_name);

CREATE TABLE IF NOT EXISTS tripjack_hotel_mappings (
  tj_hotel_id   VARCHAR(50) PRIMARY KEY,
  unica_id      VARCHAR(50) NOT NULL,
  country_name  TEXT,
  region_id     BIGINT,
  source        TEXT NOT NULL DEFAULT 'fetch-hotel-mapping',
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_mappings_unica
  ON tripjack_hotel_mappings (unica_id);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_mappings_country
  ON tripjack_hotel_mappings (country_name);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_mappings_region
  ON tripjack_hotel_mappings (region_id);

CREATE TABLE IF NOT EXISTS tripjack_hotel_static_content (
  tj_hotel_id     VARCHAR(50) PRIMARY KEY,
  unica_id        VARCHAR(50),
  name            TEXT NOT NULL,
  is_active       BOOLEAN,
  star_rating     TEXT,
  property_type   JSONB,
  locale          JSONB,
  policies        JSONB,
  amenities       JSONB,
  images          JSONB,
  descriptions    JSONB,
  raw_response    JSONB,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_static_active
  ON tripjack_hotel_static_content (is_active);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_static_name
  ON tripjack_hotel_static_content USING GIN (to_tsvector('simple', name));

CREATE TABLE IF NOT EXISTS tripjack_hotel_sync_state (
  sync_key       TEXT PRIMARY KEY,
  last_sync_at   TIMESTAMPTZ,
  last_cursor    TEXT,
  last_page      INTEGER NOT NULL DEFAULT 0,
  last_mode      TEXT NOT NULL DEFAULT 'FULL',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_tripjack_hotel_sync_state_updated_at ON tripjack_hotel_sync_state;
CREATE TRIGGER trg_tripjack_hotel_sync_state_updated_at
  BEFORE UPDATE ON tripjack_hotel_sync_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tripjack_hotel_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tripjack_city_region_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE tripjack_hotel_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tripjack_hotel_static_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE tripjack_hotel_sync_state ENABLE ROW LEVEL SECURITY;

ALTER TABLE tripjack_hotel_countries FORCE ROW LEVEL SECURITY;
ALTER TABLE tripjack_city_region_ids FORCE ROW LEVEL SECURITY;
ALTER TABLE tripjack_hotel_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE tripjack_hotel_static_content FORCE ROW LEVEL SECURITY;
ALTER TABLE tripjack_hotel_sync_state FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tripjack_hotel_countries_tenant_context ON tripjack_hotel_countries;
CREATE POLICY tripjack_hotel_countries_tenant_context ON tripjack_hotel_countries
  USING (current_setting('app.current_tenant_id', true) IS NOT NULL
         AND current_setting('app.current_tenant_id', true) <> '');

DROP POLICY IF EXISTS tripjack_city_region_ids_tenant_context ON tripjack_city_region_ids;
CREATE POLICY tripjack_city_region_ids_tenant_context ON tripjack_city_region_ids
  USING (current_setting('app.current_tenant_id', true) IS NOT NULL
         AND current_setting('app.current_tenant_id', true) <> '');

DROP POLICY IF EXISTS tripjack_hotel_mappings_tenant_context ON tripjack_hotel_mappings;
CREATE POLICY tripjack_hotel_mappings_tenant_context ON tripjack_hotel_mappings
  USING (current_setting('app.current_tenant_id', true) IS NOT NULL
         AND current_setting('app.current_tenant_id', true) <> '');

DROP POLICY IF EXISTS tripjack_hotel_static_content_tenant_context ON tripjack_hotel_static_content;
CREATE POLICY tripjack_hotel_static_content_tenant_context ON tripjack_hotel_static_content
  USING (current_setting('app.current_tenant_id', true) IS NOT NULL
         AND current_setting('app.current_tenant_id', true) <> '');

DROP POLICY IF EXISTS tripjack_hotel_sync_state_tenant_context ON tripjack_hotel_sync_state;
CREATE POLICY tripjack_hotel_sync_state_tenant_context ON tripjack_hotel_sync_state
  USING (current_setting('app.current_tenant_id', true) IS NOT NULL
         AND current_setting('app.current_tenant_id', true) <> '');

GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_hotel_countries TO authuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_city_region_ids TO authuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_hotel_mappings TO authuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_hotel_static_content TO authuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_hotel_sync_state TO authuser;
