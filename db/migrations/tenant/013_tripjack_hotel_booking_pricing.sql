ALTER TABLE tripjack_hotel_bookings
  ADD COLUMN IF NOT EXISTS supplier_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS markup_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS customer_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS pricing_currency TEXT,
  ADD COLUMN IF NOT EXISTS earning_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS supplier_wallet_debited_at TIMESTAMPTZ;
