/**
 * Flight search result filters for UI filter sidebar.
 */

import {
  FlightOption,
  FlightSearchFilters,
  FlightSearchResponse,
  FlightSegment,
  TimeRange,
} from './flight.interface';

function normalize(value: string | undefined): string {
  return (value || '').trim().toUpperCase();
}

function hasAnyFilter(values: string[] | undefined): boolean {
  return Array.isArray(values) && values.length > 0;
}

function normalizedSet(values: string[] | undefined): Set<string> {
  return new Set((values || []).map(normalize).filter(Boolean));
}

function hourFromDateTime(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/T(\d{2}):/);
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isFinite(hour) ? hour : null;
}

function matchesTimeRange(hour: number | null, ranges: TimeRange[] | undefined): boolean {
  if (!ranges?.length) return true;
  if (hour === null) return false;

  return ranges.some((range) => {
    const [start = 0, end = 24] = range.split('-').map(Number);
    return hour >= start && hour < end;
  });
}

function minutesBetween(start: string | undefined, end: string | undefined): number | null {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = endDate.getTime() - startDate.getTime();
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff / 60000)) : null;
}

function totalDuration(option: FlightOption): number {
  return option.segments.reduce((sum, segment) => sum + (segment.durationMinutes || 0), 0);
}

function layoverDurations(option: FlightOption): number[] {
  const durations: number[] = [];
  for (let index = 0; index < option.segments.length - 1; index += 1) {
    const current = option.segments[index];
    const next = option.segments[index + 1];
    const duration = minutesBetween(current?.arrivalTime, next?.departureTime);
    if (duration !== null) durations.push(duration);
  }
  return durations;
}

function layoverAirportCodes(option: FlightOption): string[] {
  const codes: string[] = [];
  for (let index = 0; index < option.segments.length - 1; index += 1) {
    const current = option.segments[index];
    const next = option.segments[index + 1];
    if (current?.to) codes.push(current.to);
    if (next?.from && next.from !== current?.to) codes.push(next.from);
  }
  return codes.map(normalize);
}

function matchesAny(values: string[], selected: Set<string>): boolean {
  if (selected.size === 0) return true;
  return values.map(normalize).some((value) => selected.has(value));
}

function segmentFlightNumber(segment: FlightSegment): string {
  const airlineCode = normalize(segment.airlineCode);
  const flightNumber = normalize(segment.flightNumber);
  return `${airlineCode}-${flightNumber}`.replace(/-+$/, '');
}

function optionMatches(option: FlightOption, filters: FlightSearchFilters): boolean {
  const firstSegment = option.segments[0];
  const lastSegment = option.segments[option.segments.length - 1];
  if (!firstSegment || !lastSegment) return false;

  if (!matchesTimeRange(hourFromDateTime(lastSegment.arrivalTime), filters.arrivalTimeRanges)) {
    return false;
  }

  if (!matchesTimeRange(hourFromDateTime(firstSegment.departureTime), filters.departureTimeRanges)) {
    return false;
  }

  if (filters.showCheckInBaggage && option.checkInBaggage !== true) {
    return false;
  }

  if (filters.handBaggageOnly && option.handBaggageOnly !== true) {
    return false;
  }

  if (filters.refundable !== undefined && option.refundable !== filters.refundable) {
    return false;
  }

  if (filters.minPrice !== undefined && option.totalFare < filters.minPrice) {
    return false;
  }

  if (filters.maxPrice !== undefined && option.totalFare > filters.maxPrice) {
    return false;
  }

  if (filters.fareTypes?.length) {
    const fareType = option.refundable ? 'REFUNDABLE' : 'NON_REFUNDABLE';
    if (!filters.fareTypes.includes(fareType)) return false;
  }

  if (filters.stops?.length) {
    const stopType = option.segments.length === 1 ? 'DIRECT' : 'CONNECTING';
    if (!filters.stops.includes(stopType)) return false;
  }

  const airlineFilters = normalizedSet(filters.airlines);
  if (!matchesAny(
    option.segments.flatMap((segment) => [segment.airlineCode, segment.airlineName]),
    airlineFilters
  )) {
    return false;
  }

  const flightNumberFilters = normalizedSet(filters.flightNumbers);
  if (!matchesAny(
    option.segments.flatMap((segment) => [segment.flightNumber, segmentFlightNumber(segment)]),
    flightNumberFilters
  )) {
    return false;
  }

  const fareIdentifierFilters = normalizedSet(filters.fareIdentifiers);
  if (fareIdentifierFilters.size > 0 && !fareIdentifierFilters.has(normalize(option.fareIdentifier))) {
    return false;
  }

  if (!matchesAny(option.segments.map((segment) => segment.departureTerminal || ''), normalizedSet(filters.departureTerminals))) {
    return false;
  }

  if (!matchesAny(option.segments.map((segment) => segment.arrivalTerminal || ''), normalizedSet(filters.arrivalTerminals))) {
    return false;
  }

  if (!matchesAny(
    option.segments.flatMap((segment) => [segment.from, segment.fromAirportName || '']),
    normalizedSet(filters.departureAirports)
  )) {
    return false;
  }

  if (!matchesAny(
    option.segments.flatMap((segment) => [segment.to, segment.toAirportName || '']),
    normalizedSet(filters.arrivalAirports)
  )) {
    return false;
  }

  if (hasAnyFilter(filters.layoverAirports) && !matchesAny(layoverAirportCodes(option), normalizedSet(filters.layoverAirports))) {
    return false;
  }

  const duration = totalDuration(option);
  if (filters.minDurationMinutes !== undefined && duration < filters.minDurationMinutes) {
    return false;
  }
  if (filters.maxDurationMinutes !== undefined && duration > filters.maxDurationMinutes) {
    return false;
  }

  const layovers = layoverDurations(option);
  if (filters.minLayoverMinutes !== undefined && (layovers.length === 0 || !layovers.some((item) => item >= filters.minLayoverMinutes!))) {
    return false;
  }
  if (filters.maxLayoverMinutes !== undefined && (layovers.length === 0 || !layovers.every((item) => item <= filters.maxLayoverMinutes!))) {
    return false;
  }

  return true;
}

export function applyFlightSearchFilters(
  response: FlightSearchResponse,
  filters: FlightSearchFilters | undefined
): FlightSearchResponse {
  if (!filters) return response;

  const tripInfos = Object.entries(response.tripInfos).reduce<Record<string, FlightOption[]>>((mapped, [journeyType, options]) => {
    mapped[journeyType] = options.filter((option) => optionMatches(option, filters));
    return mapped;
  }, {});

  return {
    ...response,
    tripInfos,
  };
}
