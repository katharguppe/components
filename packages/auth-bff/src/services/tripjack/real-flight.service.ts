/**
 * Real Flight Service
 * Thin axios adapter for TripJack Air API endpoints.
 */

import axios, { AxiosError } from 'axios';
import {
  AmendmentChargesRequest,
  AmendmentChargesResponse,
  AmendmentDetailsRequest,
  AmendmentDetailsResponse,
  AncillaryFetchRequest,
  AddSsrRequest,
  BookRequest,
  BookResponse,
  BookingDetailsRequest,
  BookingDetailsResponse,
  ConfirmBookRequest,
  ConfirmBookResponse,
  FareRuleRequest,
  FareRuleResponse,
  FareValidateRequest,
  FareValidateResponse,
  FlightCard,
  FlightDetailsRequest,
  FlightDetailsResponse,
  FlightSearchRequest,
  FlightSearchResponse,
  FlightPriceOption,
  GenericFlightResponse,
  IFlightService,
  ReissueBookRequest,
  ReissuePollRequest,
  ReissueReviewRequest,
  ReissueSearchQueryRequest,
  ReviewRequest,
  ReviewResponse,
  SeatMapRequest,
  SeatMapResponse,
  SubmitAmendmentRequest,
  SubmitAmendmentResponse,
  UnholdRequest,
  UnholdResponse,
  UserBalanceResponse,
} from './flight.interface';

const TRIPJACK_FLIGHT_BASE_URL = process.env['TRIPJACK_FLIGHT_BASE_URL']
  || (process.env['NODE_ENV'] === 'production' ? 'https://tripjack.com' : 'https://apitest.tripjack.com');
const TRIPJACK_API_KEY = process.env['TRIPJACK_API_KEY'] || '';

const client = axios.create({
  baseURL: TRIPJACK_FLIGHT_BASE_URL.replace(/\/+$/, ''),
  headers: {
    'Content-Type': 'application/json',
    apikey: TRIPJACK_API_KEY,
  },
  timeout: 30000,
});

function errorMessage(error: unknown, operation: string): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<any>;
    const responseData = axiosError.response?.data;
    return responseData?.message
      || responseData?.status?.message
      || responseData?.error?.message
      || axiosError.response?.data?.errors?.[0]?.description
      || (typeof responseData === 'string' ? responseData : undefined)
      || axiosError.message;
  }
  return 'Unknown TripJack flight API error';
}

function baggageAllowance(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return `${value} KG`;
  return undefined;
}

function seatsLeftFrom(...values: unknown[]): number | undefined {
  const keys = new Set([
    'seatsleft',
    'seatleft',
    'seatsavailable',
    'availableseats',
    'seatcount',
    'seatavailability',
    'remainingseats',
    'seatsremaining',
    'sr',
    'availability',
    'available',
    'avl',
  ]);
  const visit = (value: unknown): number | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (keys.has(normalizedKey)) {
        const numericValue =
          typeof entry === 'number'
            ? entry
            : typeof entry === 'string' && entry.trim() !== ''
              ? Number(entry)
              : Number.NaN;
        if (Number.isFinite(numericValue)) {
          return Math.max(0, Math.trunc(numericValue));
        }
      }
      const nested = visit(entry);
      if (nested !== undefined) return nested;
    }
    return undefined;
  };
  return values.map(visit).find((value): value is number => value !== undefined);
}

function flattenFareRuleTree(data: any, priceId?: string): any[] {
  const rules: any[] = [];
  const categories = [
    { match: 'cancellation', field: 'cancellation' },
    { match: 'datechange', field: 'dateChange' },
    { match: 'noshow', field: 'noShow' },
    { match: 'seatchargeable', field: 'seatChargeable' },
  ];

  const visit = (value: any, path: string[]) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, path));
      return;
    }

    for (const [key, entry] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      const category = categories.find((item) => normalizedKey.includes(item.match));
      if (category && entry && typeof entry === 'object') {
        const entries = Array.isArray(entry) ? entry : [entry];
        entries.forEach((rule, index) => {
          rules.push({
            priceId: priceId || (rule as any)?.priceId || '',
            ruleType: key,
            route: path.join(' / '),
            ...(typeof rule === 'object' ? rule : {}),
            [category.field]: rule,
            ruleIndex: index + 1,
          });
        });
      }
      visit(entry, [...path, key]);
    }
  };

  visit(data, []);
  return rules;
}

function extractFareRules(data: any, priceId?: string): any[] {
  if (Array.isArray(data)) return data;
  const candidates = [
    data?.rules,
    data?.fareRuleInfos,
    data?.fareRules,
    data?.fareRule,
    data?.fareRuleInfo,
    data?.data?.rules,
    data?.data?.fareRuleInfos,
    data?.data?.fareRules,
    data?.data?.fareRule,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const flattened = flattenFareRuleTree(candidate, priceId);
      if (flattened.length) {
        const categoryFields = ['cancellation', 'dateChange', 'noShow', 'seatChargeable'];
        const merged = flattened.reduce<Record<string, any>>((result, rule) => {
          for (const [key, value] of Object.entries(rule)) {
            if (!categoryFields.includes(key)) {
              if (result[key] === undefined) result[key] = value;
              continue;
            }
            const current = result[key];
            result[key] = current === undefined
              ? [value]
              : [...(Array.isArray(current) ? current : [current]), value];
          }
          return result;
        }, {});
        return [merged];
      }
      return [candidate];
    }
  }

  return [];
}

function extractSsrOptions(data: any, names: string[]): any[] {
  const normalizedNames = names.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const visit = (value: any): any[] | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    for (const [key, entry] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedNames.some((name) => normalizedKey.includes(name))) {
        if (Array.isArray(entry)) return entry;
        if (entry && typeof entry === 'object') {
          const nested = visit(entry);
          if (nested) return nested;
        }
      }
      const nested = visit(entry);
      if (nested) return nested;
    }
    return undefined;
  };
  return visit(data) || [];
}

function mapTripJackSegment(segment: any) {
  return {
    id: segment.id || `${segment.da?.code || ''}-${segment.aa?.code || ''}-${segment.fD?.fN || ''}`,
    from: segment.da?.code || '',
    to: segment.aa?.code || '',
    fromAirportName: segment.da?.name || segment.da?.city || undefined,
    toAirportName: segment.aa?.name || segment.aa?.city || undefined,
    departureTerminal: segment.da?.terminal || segment.da?.terminalName || undefined,
    arrivalTerminal: segment.aa?.terminal || segment.aa?.terminalName || undefined,
    departureTime: segment.dt || '',
    arrivalTime: segment.at || '',
    airlineCode: segment.fD?.aI?.code || '',
    airlineName: segment.fD?.aI?.name || '',
    flightNumber: segment.fD?.fN || '',
    durationMinutes: segment.duration || 0,
  };
}

function mapTripJackOption(trip: any, price: any): FlightPriceOption {
  const adultFare = price.fd?.ADULT;
  const fareComponents = adultFare?.fC || {};
  const baggageInfo = adultFare?.bI || adultFare?.baggageInfo || price.baggageInfo;

  return {
    priceId: price.id || '',
    totalFare: fareComponents.TF || price.totalFareDetail?.fC?.TF || 0,
    currency: price.currency || 'INR',
    refundable: adultFare?.rT !== 0,
    fareIdentifier: price.fareIdentifier || price.fareType || undefined,
    cabinClass: price.cabinClass || adultFare?.cabinClass || trip.cabinClass || 'Economy',
    checkInBaggage: baggageInfo ? true : undefined,
    handBaggageOnly: baggageInfo === false || baggageInfo?.iB === false || undefined,
    checkInBaggageAllowance: baggageAllowance(baggageInfo?.iB),
    cabinBaggageAllowance: baggageAllowance(baggageInfo?.cB),
    seatsLeft: seatsLeftFrom(adultFare?.sR, price, adultFare, trip, trip.sI),
    segments: Array.isArray(trip.sI) ? trip.sI.map(mapTripJackSegment) : [],
  };
}

function mapTripJackTripInfos(data: any): Record<string, FlightCard[]> {
  const tripInfos = data.searchResult?.tripInfos || data.tripInfos || {};

  return Object.entries(tripInfos).reduce<Record<string, FlightCard[]>>((mapped, [journeyType, trips]) => {
    mapped[journeyType] = Array.isArray(trips)
      ? trips.map((trip: any) => {
        const prices = Array.isArray(trip.totalPriceList) ? trip.totalPriceList : [];
        return {
          segments: Array.isArray(trip.sI) ? trip.sI.map(mapTripJackSegment) : [],
          priceOptions: prices.map((price: any) => mapTripJackOption(trip, price)),
        };
      })
      : [];
    return mapped;
  }, {});
}

function firstPriceId(tripInfos: Record<string, FlightCard[]>): string {
  for (const options of Object.values(tripInfos)) {
    const priceId = options[0]?.priceOptions?.[0]?.priceId;
    if (priceId) return priceId;
  }
  return '';
}

function successData(data: unknown): GenericFlightResponse {
  return { data, status: { success: true } };
}

function failureData(error: unknown, operation: string): GenericFlightResponse {
  return { data: null, status: { success: false, message: errorMessage(error, operation) } };
}

function extractFareDetails(tripInfos: any[]): unknown[] {
  return tripInfos.flatMap((trip) => {
    if (Array.isArray(trip.totalPriceList)) return trip.totalPriceList;
    if (trip.totalPriceInfo) return [trip.totalPriceInfo];
    return [];
  });
}

function extractBaggageInformation(tripInfos: any[]): unknown[] {
  const baggageFromSegments = tripInfos.flatMap((trip) =>
    Array.isArray(trip.sI)
      ? trip.sI.flatMap((segment: any) => segment.ssrInfo?.BAGGAGE || segment.ssrInfo?.baggage || [])
      : []
  );

  const baggageFromPrices = tripInfos.flatMap((trip) =>
    Array.isArray(trip.totalPriceList)
      ? trip.totalPriceList.flatMap((price: any) =>
        Object.values(price.fd || {}).map((fare: any) => fare.bI).filter(Boolean)
      )
      : []
  );

  return [...baggageFromSegments, ...baggageFromPrices];
}

function mapSearchPayload(req: FlightSearchRequest): Record<string, unknown> {
  return {
    searchQuery: {
      cabinClass: req.cabinClass,
      paxInfo: {
        ADULT: String(req.paxInfo.ADULT),
        ...(req.paxInfo.CHILD !== undefined && { CHILD: String(req.paxInfo.CHILD) }),
        ...(req.paxInfo.INFANT !== undefined && { INFANT: String(req.paxInfo.INFANT) }),
      },
      routeInfos: req.routeInfos.map((route) => ({
        fromCityOrAirport: { code: route.fromCityOrAirport },
        toCityOrAirport: { code: route.toCityOrAirport },
        travelDate: route.travelDate,
      })),
      ...(req.preferredAirlines?.length && {
        preferredAirline: req.preferredAirlines.map((code) => ({ code })),
      }),
      searchModifiers: req.searchModifiers || {},
    },
  };
}

export class RealFlightService implements IFlightService {
  async search(req: FlightSearchRequest): Promise<FlightSearchResponse> {
    try {
      const response = await client.post('/fms/v1/air-search-all', mapSearchPayload(req));
      const tripInfos = mapTripJackTripInfos(response.data);
      return {
        searchId: response.data.searchId || response.data.searchResult?.searchId || firstPriceId(tripInfos),
        tripInfos,
        status: response.data.status || { success: true },
      };
    } catch (error) {
      return { searchId: '', tripInfos: {}, status: { success: false, message: errorMessage(error, 'search') } };
    }
  }

  async review(req: ReviewRequest): Promise<ReviewResponse> {
    try {
      const response = await client.post('/fms/v1/review', { priceIds: req.priceIds });
      const tripInfos = response.data.tripInfos || [];
      return {
        bookingId: response.data.bookingId || tripInfos[0]?.id || '',
        tripInfos,
        alerts: response.data.alerts || [],
        status: { success: true },
      };
    } catch (error) {
      return { bookingId: '', tripInfos: [], alerts: [], status: { success: false, message: errorMessage(error, 'review') } };
    }
  }

  async flightDetails(req: FlightDetailsRequest): Promise<FlightDetailsResponse> {
    const review = await this.review({ priceIds: req.priceIds });
    if (!review.status.success) {
      return {
        bookingId: review.bookingId,
        flightDetails: [],
        fareDetails: [],
        fareRules: { rules: [], status: review.status },
        baggageInformation: [],
        review,
        status: review.status,
      };
    }

    const fareRules = await this.fareRule({
      id: review.bookingId || req.priceIds[0],
      flowType: review.bookingId ? 'REVIEW' : 'SEARCH',
      version: 'v2',
    });
    const seatMap = review.bookingId ? await this.seatMap({ bookingId: review.bookingId }) : undefined;
    const tripInfos = review.tripInfos as any[];

    return {
      bookingId: review.bookingId,
      flightDetails: tripInfos.flatMap((trip) => trip.sI || trip.segments || []),
      fareDetails: extractFareDetails(tripInfos),
      fareRules,
      baggageInformation: extractBaggageInformation(tripInfos),
      ...(seatMap?.status.success && { seatMap }),
      review,
      status: { success: true },
    };
  }

  async fareRule(req: FareRuleRequest): Promise<FareRuleResponse> {
    try {
      const payloads = req.id
        ? [
          { id: req.id, flowType: req.flowType || 'SEARCH' },
          { id: req.id },
          { priceIds: [req.id] },
        ]
        : [{ priceIds: req.priceIds }];
      const versions = req.version === 'v1' ? ['v1'] : ['v2', 'v1'];
      let lastResponse: any = null;
      let lastError: unknown = null;

      for (const version of versions) {
        for (const payload of payloads) {
          try {
            const response = await client.post(`/fms/${version}/farerule`, payload);
            lastResponse = response.data;
            const rules = extractFareRules(response.data, req.id || req.priceIds?.[0]);
            if (rules.length) {
              return { rules, status: { success: true } };
            }
          } catch (error) {
            lastError = error;
          }
        }
      }

      return {
        rules: [],
        status: {
          success: false,
          message: lastResponse?.message || (lastError ? errorMessage(lastError, 'fareRule') : 'TripJack returned no fare rules'),
        },
      };
    } catch (error) {
      return { rules: [], status: { success: false, message: errorMessage(error, 'fareRule') } };
    }
  }

  async seatMap(req: SeatMapRequest): Promise<SeatMapResponse> {
    try {
      const payload = req.bookingId
        ? { bookingId: req.bookingId, ...(req.oldBookingId && { oldBookingId: req.oldBookingId }) }
        : { priceIds: req.priceIds };
      const response = await client.post('/fms/v1/seat', payload);
      return {
        seats: extractSsrOptions(response.data, ['seats', 'seat', 'ssrSeatInfos', 'seatInfo']),
        meals: extractSsrOptions(response.data, ['meals', 'meal', 'ssrMealInfos', 'mealInfo']),
        baggage: extractSsrOptions(response.data, ['baggage', 'baggages', 'ssrBaggageInfos', 'baggageInfo']),
        status: { success: true },
      };
    } catch (error) {
      return { seats: [], meals: [], baggage: [], status: { success: false, message: errorMessage(error, 'seatMap') } };
    }
  }

  async fareValidateBook(req: FareValidateRequest): Promise<FareValidateResponse> {
    try {
      const response = await client.post('/oms/v1/air/book/fare-validate', { bookingId: req.bookingId });
      return { bookingId: req.bookingId, amount: response.data.amount || response.data.totalFare || 0, status: { success: true } };
    } catch (error) {
      return { bookingId: req.bookingId, amount: 0, status: { success: false, message: errorMessage(error, 'fareValidateBook') } };
    }
  }

  async book(req: BookRequest): Promise<BookResponse> {
    try {
      const payload = {
        bookingId: req.bookingId,
        ...(!req.hold && { paymentInfos: [{ amount: req.amount }] }),
        deliveryInfo: req.deliveryInfo,
        ...(req.contactInfo && { contactInfo: req.contactInfo }),
        travellerInfo: req.travellerInfo,
        ...(req.gstInfo && { gstInfo: req.gstInfo }),
      };
      const response = await client.post('/oms/v1/air/book', payload);
      return {
        bookingId: response.data.bookingId || req.bookingId,
        status: response.data.status || (req.hold ? 'ON_HOLD' : 'PENDING'),
        pnr: response.data.pnr,
        ticketNumbers: response.data.ticketNumbers,
      };
    } catch (error) {
      return { bookingId: '', status: 'FAILED', statusObj: { success: false, message: errorMessage(error, 'book') } };
    }
  }

  async fareValidate(req: FareValidateRequest): Promise<FareValidateResponse> {
    try {
      const response = await client.post('/oms/v1/air/fare-validate', { bookingId: req.bookingId });
      return { bookingId: req.bookingId, amount: response.data.amount || response.data.totalFare || 0, status: { success: true } };
    } catch (error) {
      return { bookingId: req.bookingId, amount: 0, status: { success: false, message: errorMessage(error, 'fareValidate') } };
    }
  }

  async confirmBook(req: ConfirmBookRequest): Promise<ConfirmBookResponse> {
    try {
      const response = await client.post('/oms/v1/air/confirm-book', {
        bookingId: req.bookingId,
        paymentInfos: [{ amount: req.amount }],
      });
      return { bookingId: response.data.bookingId || req.bookingId, status: response.data.status || 'PENDING' };
    } catch (error) {
      return { bookingId: req.bookingId, status: 'FAILED', statusObj: { success: false, message: errorMessage(error, 'confirmBook') } };
    }
  }

  async bookingDetails(req: BookingDetailsRequest): Promise<BookingDetailsResponse> {
    try {
      const response = await client.post('/oms/v1/booking-details', {
        bookingId: req.bookingId,
        ...(req.requirePaxPricing && { requirePaxPricing: true }),
      });
      return {
        booking: response.data.booking || response.data,
        status: { success: true },
      };
    } catch (error) {
      return {
        booking: { bookingId: req.bookingId, status: 'FAILED', travellerInfo: [], tripInfos: [] },
        status: { success: false, message: errorMessage(error, 'bookingDetails') },
      };
    }
  }

  async unhold(req: UnholdRequest): Promise<UnholdResponse> {
    try {
      const response = await client.post('/oms/v1/air/unhold', { bookingId: req.bookingId });
      return { bookingId: response.data.bookingId || req.bookingId, status: response.data.status || 'UNCONFIRMED' };
    } catch (error) {
      return { bookingId: req.bookingId, status: 'FAILED', statusObj: { success: false, message: errorMessage(error, 'unhold') } };
    }
  }

  async amendmentCharges(req: AmendmentChargesRequest): Promise<AmendmentChargesResponse> {
    try {
      const response = await client.post('/oms/v1/air/amendment/amendment-charges', {
        bookingId: req.bookingId,
        type: req.type || 'CANCELLATION',
        remarks: req.remarks,
        ...(req.trips?.length && { trips: req.trips }),
        ...(req.travellers?.length && { travellers: req.travellers }),
        ...(req.label && { label: req.label }),
      });
      return {
        bookingId: req.bookingId,
        refundAmount: response.data.refundAmount || 0,
        penaltyAmount: response.data.penaltyAmount || 0,
        status: { success: true },
      };
    } catch (error) {
      return { bookingId: req.bookingId, refundAmount: 0, penaltyAmount: 0, status: { success: false, message: errorMessage(error, 'amendmentCharges') } };
    }
  }

  async submitAmendment(req: SubmitAmendmentRequest): Promise<SubmitAmendmentResponse> {
    try {
      const response = await client.post('/oms/v1/air/amendment/submit-amendment', {
        bookingId: req.bookingId,
        type: req.type || 'CANCELLATION',
        remarks: req.remarks,
        ...(req.trips?.length && { trips: req.trips }),
        ...(req.travellers?.length && { travellers: req.travellers }),
        ...(req.label && { label: req.label }),
      });
      return { amendmentId: response.data.amendmentId || '', status: { success: true } };
    } catch (error) {
      return { amendmentId: '', status: { success: false, message: errorMessage(error, 'submitAmendment') } };
    }
  }

  async amendmentDetails(req: AmendmentDetailsRequest): Promise<AmendmentDetailsResponse> {
    try {
      const response = await client.post('/oms/v1/air/amendment/amendment-details', { amendmentId: req.amendmentId });
      return {
        amendmentId: response.data.amendmentId || req.amendmentId,
        amendmentStatus: response.data.status || response.data.amendmentStatus || 'PENDING',
        refundAmount: response.data.refundAmount,
        status: { success: true },
      };
    } catch (error) {
      return {
        amendmentId: req.amendmentId,
        amendmentStatus: 'REJECTED',
        status: { success: false, message: errorMessage(error, 'amendmentDetails') },
      };
    }
  }

  async userBalance(): Promise<UserBalanceResponse> {
    try {
      const response = await client.get('/ums/v1/user-detail');
      return {
        balance: response.data.balance || response.data.walletBalance || 0,
        creditLimit: response.data.creditLimit || 0,
        currency: response.data.currency || 'INR',
        status: { success: true },
      };
    } catch (error) {
      return { balance: 0, creditLimit: 0, currency: 'INR', status: { success: false, message: errorMessage(error, 'userBalance') } };
    }
  }

  async reissueSearchQueryList(req: ReissueSearchQueryRequest): Promise<GenericFlightResponse> {
    try {
      const response = await client.post('/fms/v1/reissue/poll/searchquery-list', {
        paxInfo: {
          ADULT: req.paxInfo.ADULT,
          ...(req.paxInfo.CHILD !== undefined && { CHILD: req.paxInfo.CHILD }),
          ...(req.paxInfo.INFANT !== undefined && { INFANT: req.paxInfo.INFANT }),
        },
        routeInfos: req.routeInfos.map((route) => ({
          fromCityOrAirport: { code: route.fromCityOrAirport },
          toCityOrAirport: { code: route.toCityOrAirport },
          travelDate: route.travelDate,
        })),
        oldBookingId: req.oldBookingId,
        pnr: req.pnr,
        paxIds: req.paxIds,
      });
      return successData(response.data);
    } catch (error) {
      return failureData(error, 'reissueSearchQueryList');
    }
  }

  async reissueSearch(req: ReissuePollRequest): Promise<GenericFlightResponse> {
    try {
      const response = await client.post('/fms/v1/reissue/poll/search/', { requestId: req.requestId });
      return successData(response.data);
    } catch (error) {
      return failureData(error, 'reissueSearch');
    }
  }

  async reissueReview(req: ReissueReviewRequest): Promise<GenericFlightResponse> {
    try {
      const response = await client.post('/fms/v1/reissue/review', {
        priceIds: req.priceIds,
        oldBookingId: req.oldBookingId,
        priceValidation: req.priceValidation ?? true,
      });
      return successData(response.data);
    } catch (error) {
      return failureData(error, 'reissueReview');
    }
  }

  async reissueBook(req: ReissueBookRequest): Promise<GenericFlightResponse> {
    try {
      const response = await client.post('/oms/v1/air/amendment/auto-reissue', req);
      return successData(response.data);
    } catch (error) {
      return failureData(error, 'reissueBook');
    }
  }

  async fetchAncillarySeat(req: AncillaryFetchRequest): Promise<GenericFlightResponse> {
    try {
      const response = await client.post('/fms/v1/ancillaries/fetch/seat', req);
      return successData(response.data);
    } catch (error) {
      return failureData(error, 'fetchAncillarySeat');
    }
  }

  async fetchAncillarySsr(req: AncillaryFetchRequest): Promise<GenericFlightResponse> {
    try {
      const response = await client.post('/fms/v1/ancillaries/fetch/ssr', req);
      return successData(response.data);
    } catch (error) {
      return failureData(error, 'fetchAncillarySsr');
    }
  }

  async addAncillarySsr(req: AddSsrRequest): Promise<GenericFlightResponse> {
    try {
      const response = await client.post('/oms/v1/air/amendment/add/ssr', req);
      return successData(response.data);
    } catch (error) {
      return failureData(error, 'addAncillarySsr');
    }
  }
}
