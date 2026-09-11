-- Give every local booking its own ID while preserving the TripJack booking ID.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE tripjack_hotel_bookings
  ADD COLUMN IF NOT EXISTS tripjack_booking_id TEXT;

UPDATE tripjack_hotel_bookings
SET tripjack_booking_id = booking_id::text
WHERE tripjack_booking_id IS NULL OR tripjack_booking_id = '';

ALTER TABLE tripjack_hotel_bookings
  ALTER COLUMN tripjack_booking_id SET NOT NULL;

ALTER TABLE tripjack_hotel_bookings
  DROP CONSTRAINT IF EXISTS tripjack_hotel_bookings_tripjack_id_key;

ALTER TABLE tripjack_hotel_bookings
  ADD CONSTRAINT tripjack_hotel_bookings_tripjack_id_key UNIQUE (tripjack_booking_id);
