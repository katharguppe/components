/**
 * Stub Flight Service
 * Stateful in-memory TripJack flight flow for local development and tests.
 */

import {
  AmendmentChargesRequest,
  AmendmentChargesResponse,
  AmendmentDetailsRequest,
  AmendmentDetailsResponse,
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
  FlightOption,
  FlightSearchRequest,
  FlightSearchResponse,
  FlightSegment,
  IFlightService,
  ReviewRequest,
  ReviewResponse,
  ReviewTripInfo,
  SeatMapRequest,
  SeatMapResponse,
  SubmitAmendmentRequest,
  SubmitAmendmentResponse,
  TravellerInfo,
  UnholdRequest,
  UnholdResponse,
  UserBalanceResponse,
} from './flight.interface';

interface SearchEntry {
  request: FlightSearchRequest;
  tripInfos: Record<string, FlightOption[]>;
  createdAt: Date;
}

interface ReviewEntry {
  bookingId: string;
  priceIds: string[];
  tripInfos: ReviewTripInfo[];
  amount: number;
  createdAt: Date;
}

interface BookingEntry {
  bookingId: string;
  status: 'SUCCESS' | 'ON_HOLD' | 'PENDING' | 'CANCELLED' | 'FAILED' | 'ABORTED' | 'UNCONFIRMED';
  pnr?: string | undefined;
  ticketNumbers?: string[] | undefined;
  travellerInfo: TravellerInfo[];
  tripInfos: ReviewTripInfo[];
  amount: number;
  createdAt: Date;
}

interface AmendmentEntry {
  amendmentId: string;
  bookingId: string;
  status: 'REQUESTED' | 'REJECTED' | 'SUCCESS' | 'PENDING';
  refundAmount: number;
  createdAt: Date;
}

const searchStore = new Map<string, SearchEntry>();
const reviewStore = new Map<string, ReviewEntry>();
const bookingStore = new Map<string, BookingEntry>();
const amendmentStore = new Map<string, AmendmentEntry>();

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

function makeSegment(route: FlightSearchRequest['routeInfos'][number], index: number): FlightSegment {
  return {
    id: `SEG-${index + 1}`,
    from: route.fromCityOrAirport,
    to: route.toCityOrAirport,
    departureTime: `${route.travelDate}T08:30:00+05:30`,
    arrivalTime: `${route.travelDate}T10:45:00+05:30`,
    airlineCode: '6E',
    airlineName: 'IndiGo',
    flightNumber: `6E-${1200 + index}`,
    durationMinutes: 135,
    ssrInfo: {
      baggage: [{ key: `SEG-${index + 1}`, code: 'XB15', amount: 1500, desc: '15kg extra baggage' }],
      meals: [{ key: `SEG-${index + 1}`, code: 'VGML', amount: 350, desc: 'Vegetarian meal' }],
      seats: [{ key: `SEG-${index + 1}`, code: '12A', amount: 450, desc: 'Window seat' }],
    },
  };
}

function makeOption(route: FlightSearchRequest['routeInfos'][number], index: number): FlightOption {
  const baseFare = 4800 + index * 850;
  return {
    priceId: `PRI-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
    totalFare: baseFare,
    currency: 'INR',
    refundable: index % 2 === 0,
    segments: [makeSegment(route, index)],
  };
}

function findOptions(priceIds: string[]): FlightOption[] {
  const allOptions = Array.from(searchStore.values()).flatMap((entry) => Object.values(entry.tripInfos).flat());
  return priceIds
    .map((priceId) => allOptions.find((option) => option.priceId === priceId))
    .filter((option): option is FlightOption => Boolean(option));
}

export class StubFlightService implements IFlightService {
  async search(req: FlightSearchRequest): Promise<FlightSearchResponse> {
    const searchId = randomId('FSR');
    const tripInfos: Record<string, FlightOption[]> = {};

    if (req.routeInfos.length === 1) {
      const route = req.routeInfos[0]!;
      tripInfos['ONWARD'] = [makeOption(route, 0), makeOption(route, 1)];
    } else if (req.routeInfos.length === 2) {
      const onward = req.routeInfos[0]!;
      const ret = req.routeInfos[1]!;
      tripInfos['ONWARD'] = [makeOption(onward, 0), makeOption(onward, 1)];
      tripInfos['RETURN'] = [makeOption(ret, 2), makeOption(ret, 3)];
    } else {
      tripInfos['COMBO'] = req.routeInfos.map((route, index) => makeOption(route, index));
    }

    searchStore.set(searchId, { request: req, tripInfos, createdAt: new Date() });
    return { searchId, tripInfos, status: { success: true } };
  }

  async review(req: ReviewRequest): Promise<ReviewResponse> {
    const options = findOptions(req.priceIds);
    if (options.length !== req.priceIds.length) {
      return {
        bookingId: '',
        tripInfos: [],
        alerts: [],
        status: { success: false, message: 'One or more priceIds were not found' },
      };
    }

    const bookingId = randomId('TJFL');
    const tripInfos = options.map<ReviewTripInfo>((option) => ({
      id: bookingId,
      priceId: option.priceId,
      conditions: {
        st: 900,
        isBA: true,
        isa: true,
        iecr: false,
        igm: false,
        dobe: false,
      },
      totalPriceInfo: {
        fd: {
          fC: {
            TF: option.totalFare,
          },
        },
      },
      segments: option.segments,
    }));
    const amount = options.reduce((sum, option) => sum + option.totalFare, 0);

    reviewStore.set(bookingId, {
      bookingId,
      priceIds: req.priceIds,
      tripInfos,
      amount,
      createdAt: new Date(),
    });

    return { bookingId, tripInfos, alerts: [], status: { success: true } };
  }

  async fareRule(req: FareRuleRequest): Promise<FareRuleResponse> {
    const options = findOptions(req.priceIds);
    if (options.length === 0) {
      return { rules: [], status: { success: false, message: 'No fare rules found' } };
    }

    return {
      rules: options.map((option) => ({
        priceId: option.priceId,
        cancellation: option.refundable ? 'Refundable with airline penalties' : 'Non-refundable',
        dateChange: 'Date change permitted with fare difference and airline fee',
      })),
      status: { success: true },
    };
  }

  async seatMap(req: SeatMapRequest): Promise<SeatMapResponse> {
    const options = findOptions(req.priceIds);
    const ssr = options.flatMap((option) => option.segments.flatMap((segment) => segment.ssrInfo ? [segment.ssrInfo] : []));

    return {
      seats: ssr.flatMap((item) => item.seats || []),
      meals: ssr.flatMap((item) => item.meals || []),
      baggage: ssr.flatMap((item) => item.baggage || []),
      status: options.length > 0 ? { success: true } : { success: false, message: 'Seat map not found' },
    };
  }

  async fareValidateBook(req: FareValidateRequest): Promise<FareValidateResponse> {
    const review = reviewStore.get(req.bookingId);
    if (!review) {
      return { bookingId: req.bookingId, amount: 0, status: { success: false, message: 'Booking not reviewed' } };
    }
    return { bookingId: req.bookingId, amount: review.amount, status: { success: true } };
  }

  async book(req: BookRequest): Promise<BookResponse> {
    const review = reviewStore.get(req.bookingId);
    if (!review) {
      return { bookingId: '', status: 'FAILED', statusObj: { success: false, message: 'Booking not reviewed' } };
    }

    const status = req.hold ? 'ON_HOLD' : 'SUCCESS';
    const ticketNumbers = req.hold ? undefined : req.travellerInfo.map((_, index) => `TKT${Date.now()}${index}`);
    const pnr = `PNR${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const bookingEntry: BookingEntry = {
      bookingId: req.bookingId,
      status,
      pnr,
      travellerInfo: req.travellerInfo,
      tripInfos: review.tripInfos,
      amount: req.amount || review.amount,
      createdAt: new Date(),
    };
    if (ticketNumbers) {
      bookingEntry.ticketNumbers = ticketNumbers;
    }
    bookingStore.set(req.bookingId, bookingEntry);

    return ticketNumbers ? { bookingId: req.bookingId, status, pnr, ticketNumbers } : { bookingId: req.bookingId, status, pnr };
  }

  async fareValidate(req: FareValidateRequest): Promise<FareValidateResponse> {
    const booking = bookingStore.get(req.bookingId);
    if (!booking || booking.status !== 'ON_HOLD') {
      return { bookingId: req.bookingId, amount: 0, status: { success: false, message: 'Held booking not found' } };
    }
    return { bookingId: req.bookingId, amount: booking.amount, status: { success: true } };
  }

  async confirmBook(req: ConfirmBookRequest): Promise<ConfirmBookResponse> {
    const booking = bookingStore.get(req.bookingId);
    if (!booking || booking.status !== 'ON_HOLD') {
      return { bookingId: req.bookingId, status: 'FAILED', statusObj: { success: false, message: 'Held booking not found' } };
    }

    booking.status = 'SUCCESS';
    booking.ticketNumbers = booking.travellerInfo.map((_, index) => `TKT${Date.now()}${index}`);
    return { bookingId: req.bookingId, status: 'SUCCESS' };
  }

  async bookingDetails(req: BookingDetailsRequest): Promise<BookingDetailsResponse> {
    const booking = bookingStore.get(req.bookingId);
    if (!booking) {
      return {
        booking: { bookingId: req.bookingId, status: 'FAILED', travellerInfo: [], tripInfos: [] },
        status: { success: false, message: 'Booking not found' },
      };
    }

    const responseBooking: BookingDetailsResponse['booking'] = {
      bookingId: booking.bookingId,
      status: booking.status,
      travellerInfo: booking.travellerInfo,
      tripInfos: booking.tripInfos,
    };
    if (booking.pnr) {
      responseBooking.pnr = booking.pnr;
    }
    if (booking.ticketNumbers) {
      responseBooking.ticketNumbers = booking.ticketNumbers;
    }

    return {
      booking: responseBooking,
      status: { success: true },
    };
  }

  async unhold(req: UnholdRequest): Promise<UnholdResponse> {
    const booking = bookingStore.get(req.bookingId);
    if (!booking || booking.status !== 'ON_HOLD') {
      return { bookingId: req.bookingId, status: 'FAILED', statusObj: { success: false, message: 'Held booking not found' } };
    }

    booking.status = 'UNCONFIRMED';
    return { bookingId: req.bookingId, status: 'UNCONFIRMED' };
  }

  async amendmentCharges(req: AmendmentChargesRequest): Promise<AmendmentChargesResponse> {
    const booking = bookingStore.get(req.bookingId);
    if (!booking) {
      return {
        bookingId: req.bookingId,
        refundAmount: 0,
        penaltyAmount: 0,
        status: { success: false, message: 'Booking not found' },
      };
    }

    const penaltyAmount = Math.round(booking.amount * 0.2);
    return {
      bookingId: req.bookingId,
      refundAmount: booking.amount - penaltyAmount,
      penaltyAmount,
      status: { success: true },
    };
  }

  async submitAmendment(req: SubmitAmendmentRequest): Promise<SubmitAmendmentResponse> {
    const booking = bookingStore.get(req.bookingId);
    if (!booking) {
      return { amendmentId: '', status: { success: false, message: 'Booking not found' } };
    }

    booking.status = 'CANCELLED';
    const amendmentId = randomId('AMD');
    amendmentStore.set(amendmentId, {
      amendmentId,
      bookingId: req.bookingId,
      status: 'SUCCESS',
      refundAmount: Math.round(booking.amount * 0.8),
      createdAt: new Date(),
    });

    return { amendmentId, status: { success: true } };
  }

  async amendmentDetails(req: AmendmentDetailsRequest): Promise<AmendmentDetailsResponse> {
    const amendment = amendmentStore.get(req.amendmentId);
    if (!amendment) {
      return {
        amendmentId: req.amendmentId,
        amendmentStatus: 'REJECTED',
        status: { success: false, message: 'Amendment not found' },
      };
    }

    return {
      amendmentId: amendment.amendmentId,
      amendmentStatus: amendment.status,
      refundAmount: amendment.refundAmount,
      status: { success: true },
    };
  }

  async userBalance(): Promise<UserBalanceResponse> {
    return {
      balance: 100000,
      creditLimit: 25000,
      currency: 'INR',
      status: { success: true },
    };
  }
}
