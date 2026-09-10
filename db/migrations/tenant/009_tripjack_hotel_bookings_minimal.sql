-- Keep only the booking reference and tenant ownership metadata.
ALTER TABLE tripjack_hotel_bookings
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS option_id,
  DROP COLUMN IF EXISTS review_hash,
  DROP COLUMN IF EXISTS correlation_id,
  DROP COLUMN IF EXISTS nationality,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS check_in,
  DROP COLUMN IF EXISTS check_out,
  DROP COLUMN IF EXISTS rooms,
  DROP COLUMN IF EXISTS traveller_info,
  DROP COLUMN IF EXISTS delivery_info,
  DROP COLUMN IF EXISTS gst_info,
  DROP COLUMN IF EXISTS review_request,
  DROP COLUMN IF EXISTS review_response,
  DROP COLUMN IF EXISTS book_request,
  DROP COLUMN IF EXISTS book_response,
  DROP COLUMN IF EXISTS booking_detail,
  DROP COLUMN IF EXISTS cancel_request,
  DROP COLUMN IF EXISTS cancel_response,
  DROP COLUMN IF EXISTS raw_response;

DROP INDEX IF EXISTS idx_tripjack_hotel_bookings_status;
DROP INDEX IF EXISTS idx_tripjack_hotel_bookings_option_id;
