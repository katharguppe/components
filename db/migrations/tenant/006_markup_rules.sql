-- ============================================================================
-- Migration: 006_markup_rules.sql
-- Tenant-scoped markup configuration table + RLS
-- ============================================================================
-- Template SQL executed inside each tenant schema.
-- Requires search_path = "tenant_{slug}" before execution.
-- ============================================================================

CREATE TABLE IF NOT EXISTS markup_rules (
  id              UUID         NOT NULL,
  tenant_id       UUID         NOT NULL,
  product_type    VARCHAR(20)  NOT NULL,
  markup_type     VARCHAR(20)  NOT NULL,
  amount_type     VARCHAR(20)  NOT NULL,
  amount_value    NUMERIC(12,2),
  airlines        JSONB        NOT NULL DEFAULT '[]'::jsonb,
  pax_types       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_by      TEXT         NOT NULL,
  updated_by      TEXT,
  raw_request     JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT markup_rules_pkey
    PRIMARY KEY (id),

  CONSTRAINT markup_rules_product_type_valid
    CHECK (product_type IN ('AIR', 'HOTEL', 'CAB', 'ALL')),

  CONSTRAINT markup_rules_markup_type_valid
    CHECK (markup_type IN ('DOMESTIC', 'INTERNATIONAL', 'ALL')),

  CONSTRAINT markup_rules_amount_type_valid
    CHECK (amount_type IN ('FIXED', 'PERCENTAGE', 'ALL')),

  CONSTRAINT markup_rules_amount_value_valid
    CHECK (amount_value IS NULL OR amount_value >= 0)
);

CREATE INDEX IF NOT EXISTS idx_markup_rules_tenant_id
  ON markup_rules (tenant_id);

CREATE INDEX IF NOT EXISTS idx_markup_rules_product_type
  ON markup_rules (product_type);

CREATE INDEX IF NOT EXISTS idx_markup_rules_markup_type
  ON markup_rules (markup_type);

CREATE INDEX IF NOT EXISTS idx_markup_rules_amount_type
  ON markup_rules (amount_type);

CREATE INDEX IF NOT EXISTS idx_markup_rules_is_active
  ON markup_rules (is_active);

CREATE INDEX IF NOT EXISTS idx_markup_rules_airlines_gin
  ON markup_rules USING GIN (airlines);

CREATE INDEX IF NOT EXISTS idx_markup_rules_pax_types_gin
  ON markup_rules USING GIN (pax_types);

CREATE UNIQUE INDEX IF NOT EXISTS uq_markup_rules_identity
  ON markup_rules (tenant_id, product_type, markup_type, amount_type, airlines, pax_types);

DROP TRIGGER IF EXISTS trg_markup_rules_updated_at ON markup_rules;
CREATE TRIGGER trg_markup_rules_updated_at
  BEFORE UPDATE ON markup_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE markup_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE markup_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS markup_rules_tenant_context ON markup_rules;
CREATE POLICY markup_rules_tenant_context ON markup_rules
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  )
  WITH CHECK (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND current_setting('app.current_tenant_id', true) <> ''
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON markup_rules TO authuser;
