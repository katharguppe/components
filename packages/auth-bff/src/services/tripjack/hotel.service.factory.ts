/**
 * Hotel Service Factory
 * Creates and returns the appropriate hotel service implementation based on TRIPJACK_MODE
 * Reads TRIPJACK_MODE once at startup — server restart required to switch implementations
 */

import { IHotelService } from './hotel.interface';
import { StubHotelService } from './stub-hotel.service';
import { RealHotelService } from './real-hotel.service';

// ─── Module-level singleton ─────────────────────────────────────────────────

let hotelService: IHotelService | null = null;

/**
 * Get or create the hotel service based on TRIPJACK_MODE
 * Reads environment variable once at first call
 * @returns IHotelService implementation (stub or real)
 */
export function createHotelService(): IHotelService {
  if (hotelService) {
    return hotelService;
  }

  const mode = process.env['TRIPJACK_MODE'] || 'stub';

  if (mode === 'production') {
    console.log('[HotelServiceFactory] Using RealHotelService (production mode)');
    hotelService = new RealHotelService();
  } else {
    console.log('[HotelServiceFactory] Using StubHotelService (stub mode with Gemini)');
    hotelService = new StubHotelService();
  }

  return hotelService;
}

/**
 * Get the currently active hotel service
 * Returns null if not yet initialized
 */
export function getHotelService(): IHotelService | null {
  return hotelService;
}

/**
 * Reset the service (for testing)
 * This is NOT recommended in production
 */
export function resetHotelService(): void {
  hotelService = null;
}

// Export the factory function as default
export default createHotelService;
