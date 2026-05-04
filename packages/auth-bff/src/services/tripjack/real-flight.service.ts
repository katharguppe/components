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
  FlightSearchRequest,
  FlightSearchResponse,
  IFlightService,
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
  || process.env['TRIPJACK_BASE_URL']
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
    console.error(`[RealFlight] ${operation} failed:`, {
      status: axiosError.response?.status,
      data: axiosError.response?.data,
      message: axiosError.message,
    });
    return axiosError.response?.data?.message
      || axiosError.response?.data?.errors?.[0]?.description
      || axiosError.message;
  }
  console.error(`[RealFlight] ${operation} failed:`, error);
  return 'Unknown TripJack flight API error';
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
      return {
        searchId: response.data.searchId || response.data.searchResultId || '',
        tripInfos: response.data.tripInfos || {},
        status: { success: true },
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
        bookingId: tripInfos[0]?.id || response.data.bookingId || '',
        tripInfos,
        alerts: response.data.alerts || [],
        status: { success: true },
      };
    } catch (error) {
      return { bookingId: '', tripInfos: [], alerts: [], status: { success: false, message: errorMessage(error, 'review') } };
    }
  }

  async fareRule(req: FareRuleRequest): Promise<FareRuleResponse> {
    try {
      const response = await client.post('/fms/v2/farerule', { priceIds: req.priceIds });
      return { rules: response.data.rules || response.data.fareRuleInfos || [], status: { success: true } };
    } catch (error) {
      return { rules: [], status: { success: false, message: errorMessage(error, 'fareRule') } };
    }
  }

  async seatMap(req: SeatMapRequest): Promise<SeatMapResponse> {
    try {
      const response = await client.post('/fms/v1/seat', { priceIds: req.priceIds });
      return {
        seats: response.data.seats || response.data.ssrSeatInfos || [],
        meals: response.data.meals || response.data.ssrMealInfos || [],
        baggage: response.data.baggage || response.data.ssrBaggageInfos || [],
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
        type: 'CANCELLATION',
        remarks: req.remarks,
        ...(req.trips?.length && { trips: req.trips }),
        ...(req.travellers?.length && { travellers: req.travellers }),
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
        type: 'CANCELLATION',
        remarks: req.remarks,
        ...(req.trips?.length && { trips: req.trips }),
        ...(req.travellers?.length && { travellers: req.travellers }),
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
}
