/**
 * Flight Service Factory
 * Reads TRIPJACK_FLIGHT_MODE once at startup.
 */

import { IFlightService } from './flight.interface';
import { RealFlightService } from './real-flight.service';
import { StubFlightService } from './stub-flight.service';

let flightService: IFlightService | null = null;

export function createFlightService(): IFlightService {
  if (flightService) {
    return flightService;
  }

  const mode = process.env['TRIPJACK_FLIGHT_MODE'] || process.env['TRIPJACK_MODE'] || 'stub';
  if (mode === 'production') {
    console.log('[FlightServiceFactory] Using RealFlightService');
    flightService = new RealFlightService();
  } else {
    console.log('[FlightServiceFactory] Using StubFlightService');
    flightService = new StubFlightService();
  }

  return flightService;
}

export function resetFlightService(): void {
  flightService = null;
}
