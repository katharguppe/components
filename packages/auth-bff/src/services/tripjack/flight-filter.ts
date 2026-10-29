/**
 * Flight search result filters for UI filter sidebar.
 */

import {
  FlightCard,
  FlightPriceOption,
  FlightSearchFilters,
  FlightSearchResponse,
  FlightSort,
  FlightSegment,
  TimeRange,
} from './flight.interface';

function normalize(value: string | undefined): string {
  return (value || '').trim().toUpperCase();
}

function normalizeTerminal(value: string | undefined): string {
  return normalize(value).replace(/^TERMINAL\s+/, '');
}

function normalizeFlightNumber(value: string | undefined): string {
  return normalize(value).replace(/[^A-Z0-9]/g, '');
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

function totalDuration(segments: FlightSegment[]): number {
  return segments.reduce((sum, segment) => sum + (segment.durationMinutes || 0), 0);
}

function layoverDurations(segments: FlightSegment[]): number[] {
  const durations: number[] = [];
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    const duration = minutesBetween(current?.arrivalTime, next?.departureTime);
    if (duration !== null) durations.push(duration);
  }
  return durations;
}

function layoverAirportCodes(segments: FlightSegment[]): string[] {
  const codes: string[] = [];
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    if (current?.to) codes.push(current.to);
    if (next?.from && next.from !== current?.to) codes.push(next.from);
  }
  return codes.map(normalize);
}

function matchesAny(values: string[], selected: Set<string>): boolean {
  if (selected.size === 0) return true;
  return values.map(normalize).some((value) => selected.has(value));
}

function matchesTerminal(values: string[], selected: Set<string>): boolean {
  if (selected.size === 0) return true;
  return values.some((value) => selected.has(normalizeTerminal(value)));
}

function segmentFlightNumber(segment: FlightSegment): string {
  return normalizeFlightNumber(`${segment.airlineCode || ''}${segment.flightNumber || ''}`);
}

function priceOptionMatches(option: FlightPriceOption, filters: FlightSearchFilters): boolean {
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

  const fareIdentifierFilters = normalizedSet(filters.fareIdentifiers);
  if (fareIdentifierFilters.size > 0 && !fareIdentifierFilters.has(normalize(option.fareIdentifier))) {
    return false;
  }

  return true;
}

function cardMatches(card: FlightCard, filters: FlightSearchFilters): boolean {
  const firstSegment = card.segments[0];
  const lastSegment = card.segments[card.segments.length - 1];
  if (!firstSegment || !lastSegment) return false;

  if (!matchesTimeRange(hourFromDateTime(lastSegment.arrivalTime), filters.arrivalTimeRanges)) {
    return false;
  }

  if (!matchesTimeRange(hourFromDateTime(firstSegment.departureTime), filters.departureTimeRanges)) {
    return false;
  }

  if (filters.stops?.length) {
    const stopType = card.segments.length === 1 ? 'DIRECT' : 'CONNECTING';
    if (!filters.stops.includes(stopType)) return false;
  }

  const airlineFilters = normalizedSet(filters.airlines);
  if (!matchesAny(
    card.segments.flatMap((segment) => [segment.airlineCode, segment.airlineName]),
    airlineFilters
  )) {
    return false;
  }

  const flightNumberFilters = new Set(
    (filters.flightNumbers || []).map(normalizeFlightNumber).filter(Boolean),
  );
  const flightNumberValues = card.segments.flatMap((segment) => [
    normalizeFlightNumber(segment.flightNumber),
    segmentFlightNumber(segment),
  ]);
  if (flightNumberFilters.size > 0 && !flightNumberValues.some((value) =>
    flightNumberFilters.has(value),
  )) {
    return false;
  }

  if (!matchesTerminal(card.segments.map((segment) => segment.departureTerminal || ''), new Set((filters.departureTerminals || []).map(normalizeTerminal)))) {
    return false;
  }

  if (!matchesTerminal(card.segments.map((segment) => segment.arrivalTerminal || ''), new Set((filters.arrivalTerminals || []).map(normalizeTerminal)))) {
    return false;
  }

  if (!matchesAny(
    card.segments.flatMap((segment) => [segment.from, segment.fromAirportName || '']),
    normalizedSet(filters.departureAirports)
  )) {
    return false;
  }

  if (!matchesAny(
    card.segments.flatMap((segment) => [segment.to, segment.toAirportName || '']),
    normalizedSet(filters.arrivalAirports)
  )) {
    return false;
  }

  if (hasAnyFilter(filters.layoverAirports) && !matchesAny(layoverAirportCodes(card.segments), normalizedSet(filters.layoverAirports))) {
    return false;
  }

  const duration = totalDuration(card.segments);
  if (filters.minDurationMinutes !== undefined && duration < filters.minDurationMinutes) {
    return false;
  }
  if (filters.maxDurationMinutes !== undefined && duration > filters.maxDurationMinutes) {
    return false;
  }

  const layovers = layoverDurations(card.segments);
  if (filters.minLayoverMinutes !== undefined && (layovers.length === 0 || !layovers.some((item) => item >= filters.minLayoverMinutes!))) {
    return false;
  }
  if (filters.maxLayoverMinutes !== undefined && (layovers.length === 0 || !layovers.every((item) => item <= filters.maxLayoverMinutes!))) {
    return false;
  }

  return true;
}

function cardPrice(card: FlightCard): number {
  return card.priceOptions.reduce(
    (lowest, option) => Math.min(lowest, option.totalFare),
    Number.POSITIVE_INFINITY,
  );
}

function compareCards(left: FlightCard, right: FlightCard, sort: FlightSort): number {
  const leftFirst = left.segments[0];
  const rightFirst = right.segments[0];
  const leftLast = left.segments[left.segments.length - 1];
  const rightLast = right.segments[right.segments.length - 1];
  let comparison = 0;

  if (sort.by === 'price') {
    comparison = cardPrice(left) - cardPrice(right);
  } else if (sort.by === 'duration') {
    comparison = totalDuration(left.segments) - totalDuration(right.segments);
  } else if (sort.by === 'departure') {
    comparison = new Date(leftFirst?.departureTime || 0).getTime() - new Date(rightFirst?.departureTime || 0).getTime();
  } else {
    comparison = new Date(leftLast?.arrivalTime || 0).getTime() - new Date(rightLast?.arrivalTime || 0).getTime();
  }

  if (comparison === 0) comparison = cardPrice(left) - cardPrice(right);
  return sort.direction === 'asc' ? comparison : -comparison;
}

export function applyFlightSearchFilters(
  response: FlightSearchResponse,
  filters: FlightSearchFilters | undefined,
  sort: FlightSort | undefined,
): FlightSearchResponse {
  const tripInfos = Object.entries(response.tripInfos).reduce<Record<string, FlightCard[]>>((mapped, [journeyType, cards]) => {
    const filteredCards = filters
      ? cards
        .map((card) => ({
          ...card,
          priceOptions: card.priceOptions.filter((option) => priceOptionMatches(option, filters)),
        }))
        .filter((card) => card.priceOptions.length > 0 && cardMatches(card, filters))
      : cards;
    mapped[journeyType] = sort
      ? [...filteredCards].sort((left, right) => compareCards(left, right, sort))
      : filteredCards;
    return mapped;
  }, {});

  return {
    ...response,
    tripInfos,
  };
}
