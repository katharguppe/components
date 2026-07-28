-- ============================================================================
-- Migration: 007_tripjack_hotel_static_content.sql
-- TripJack Hotel Static Content + Sync State (GLOBAL)
-- ============================================================================
-- Shared public-schema tables for hotel static data.
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS tripjack_hotel_countries (
  country_name  TEXT        NOT NULL,
  source        TEXT        NOT NULL DEFAULT 'fetch-countries',
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tripjack_hotel_countries_pkey
    PRIMARY KEY (country_name)
);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_countries_source
  ON tripjack_hotel_countries (source);

CREATE TABLE IF NOT EXISTS tripjack_city_region_ids (
  city_region_id    BIGINT      NOT NULL,
  city_name         TEXT,
  region_name       TEXT,
  country_name      TEXT,
  region_type       TEXT,
  full_region_name  TEXT,
  source            TEXT        NOT NULL DEFAULT 'fetch-city-regionIds',
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tripjack_city_region_ids_pkey
    PRIMARY KEY (city_region_id)
);

CREATE INDEX IF NOT EXISTS idx_tripjack_city_region_ids_country_name
  ON tripjack_city_region_ids (country_name);

CREATE INDEX IF NOT EXISTS idx_tripjack_city_region_ids_region_name
  ON tripjack_city_region_ids (region_name);

CREATE TABLE IF NOT EXISTS tripjack_hotel_mappings (
  tj_hotel_id   TEXT        NOT NULL,
  unica_id      TEXT,
  country_name  TEXT,
  region_id     BIGINT,
  source        TEXT        NOT NULL DEFAULT 'fetch-hotel-mapping',
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tripjack_hotel_mappings_pkey
    PRIMARY KEY (tj_hotel_id)
);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_mappings_country_name
  ON tripjack_hotel_mappings (country_name);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_mappings_region_id
  ON tripjack_hotel_mappings (region_id);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_mappings_unica_id
  ON tripjack_hotel_mappings (unica_id);

CREATE TABLE IF NOT EXISTS tripjack_hotel_static_content (
  tj_hotel_id   TEXT        NOT NULL,
  unica_id      TEXT,
  name          TEXT,
  is_active     BOOLEAN,
  star_rating   TEXT,
  property_type JSONB,
  locale        JSONB,
  policies      JSONB,
  amenities     JSONB,
  images        JSONB,
  descriptions  JSONB,
  raw_response  JSONB,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tripjack_hotel_static_content_pkey
    PRIMARY KEY (tj_hotel_id)
);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_static_content_unica_id
  ON tripjack_hotel_static_content (unica_id);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_static_content_name
  ON tripjack_hotel_static_content (name);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_static_content_raw_response_gin
  ON tripjack_hotel_static_content USING GIN (raw_response);

CREATE TABLE IF NOT EXISTS tripjack_hotel_sync_state (
  sync_key      TEXT        NOT NULL,
  last_sync_at  TIMESTAMPTZ,
  last_cursor   TEXT,
  last_page     INTEGER,
  last_mode     TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tripjack_hotel_sync_state_pkey
    PRIMARY KEY (sync_key)
);

DROP TRIGGER IF EXISTS trg_tripjack_hotel_sync_state_updated_at ON tripjack_hotel_sync_state;
CREATE TRIGGER trg_tripjack_hotel_sync_state_updated_at
  BEFORE UPDATE ON tripjack_hotel_sync_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_hotel_countries TO authuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_city_region_ids TO authuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_hotel_mappings TO authuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_hotel_static_content TO authuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_hotel_sync_state TO authuser;
