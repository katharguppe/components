-- ============================================================================
-- Cleanup Migration: drop old public TripJack hotel static tables
-- ============================================================================

DROP TABLE IF EXISTS public.tripjack_hotel_sync_state CASCADE;
DROP TABLE IF EXISTS public.tripjack_hotel_static_content CASCADE;
DROP TABLE IF EXISTS public.tripjack_hotel_mappings CASCADE;
DROP TABLE IF EXISTS public.tripjack_city_region_ids CASCADE;
DROP TABLE IF EXISTS public.tripjack_hotel_countries CASCADE;
