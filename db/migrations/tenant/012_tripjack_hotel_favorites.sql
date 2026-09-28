-- Tenant-scoped hotel favorites for the hotel list/grid heart action.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tripjack_hotel_favorites (
  favorite_id       UUID        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL,
  created_by        TEXT        NOT NULL,
  hotel_id          TEXT        NOT NULL,
  hotel_name        TEXT        NOT NULL DEFAULT '',
  hotel_address     TEXT        NOT NULL DEFAULT '',
  preview_image_url TEXT        NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tripjack_hotel_favorites_pkey PRIMARY KEY (favorite_id),
  CONSTRAINT tripjack_hotel_favorites_user_hotel_key UNIQUE (tenant_id, created_by, hotel_id)
);

CREATE INDEX IF NOT EXISTS idx_tripjack_hotel_favorites_tenant_user
  ON tripjack_hotel_favorites (tenant_id, created_by);

DROP TRIGGER IF EXISTS trg_tripjack_hotel_favorites_updated_at ON tripjack_hotel_favorites;
CREATE TRIGGER trg_tripjack_hotel_favorites_updated_at
  BEFORE UPDATE ON tripjack_hotel_favorites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tripjack_hotel_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE tripjack_hotel_favorites FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tripjack_hotel_favorites_tenant_context ON tripjack_hotel_favorites;
CREATE POLICY tripjack_hotel_favorites_tenant_context ON tripjack_hotel_favorites
  USING (current_setting('app.current_tenant_id', true) IS NOT NULL
         AND current_setting('app.current_tenant_id', true) <> '');

GRANT SELECT, INSERT, UPDATE, DELETE ON tripjack_hotel_favorites TO authuser;
