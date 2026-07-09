/**
 * Real Hotel Service (v3.0)
 * Implements IHotelService using axios HTTP calls to TripJack API v3.0
 * Endpoint: https://api.tripjack.com
 * Authentication: apikey header
 */

import axios, { AxiosError } from 'axios';
import {
  IHotelService,
  SearchRequest,
  SearchResponse,
  PricingRequest,
  PricingResponse,
  ReviewRequest,
  ReviewResponse,
  BookRequest,
  BookResponse,
  BookingDetailRequest,
  BookingDetailResponse,
  CancelRequest,
  CancelResponse,
  StaticDetailRequest,
  StaticDetailResponse,
  CitiesRequest,
  CitiesResponse,
  CityRegionResponse,
  NationalitiesResponse,
  BalanceResponse,
  HotelCountriesResponse,
  HotelContentRequest,
  HotelContentResponse,
  HotelMappingRequest,
  HotelMappingResponse,
} from './hotel.interface';

// ─── Configuration ──────────────────────────────────────────────────────────

const TRIPJACK_HOTEL_BASE_URL = process.env['TRIPJACK_HOTEL_BASE_URL']
  || 'https://api.tripjack.com';
const TRIPJACK_API_KEY = process.env['TRIPJACK_API_KEY'] || '';

// Create axios instance with default headers
const tripjackClient = axios.create({
  baseURL: TRIPJACK_HOTEL_BASE_URL.replace(/\/+$/, ''),
  headers: {
    'Content-Type': 'application/json',
    apikey: TRIPJACK_API_KEY,
  },
  timeout: 30000,
});

// ─── Error Handler ──────────────────────────────────────────────────────────

function handleError(error: unknown, operation: string): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<any>;
    console.error(`[RealHotel] ${operation} failed:`, {
      status: axiosError.response?.status,
      message: axiosError.response?.data?.message || axiosError.message,
    });
    return axiosError.response?.data?.message || axiosError.message || 'API error';
  }
  console.error(`[RealHotel] ${operation} error:`, error);
  return 'Unknown error';
}

// ─── Service Implementation ──────────────────────────────────────────────────

export class RealHotelService implements IHotelService {
  /**
   * Search hotels by hids + dates
   * POST /hms/v3/hotel/listing
   */
  async search(req: SearchRequest): Promise<SearchResponse> {
    try {
      const payload = {
        checkIn: req.checkIn,
        checkOut: req.checkOut,
        hids: req.hids,
        rooms: req.rooms,
        currency: req.currency,
        nationality: req.nationality || '106', // Default to India
        correlationId: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      };

      console.log('[RealHotel] search request', {
        baseURL: TRIPJACK_HOTEL_BASE_URL,
        hidCount: payload.hids.length,
        hids: payload.hids,
        checkIn: payload.checkIn,
        checkOut: payload.checkOut,
        rooms: payload.rooms,
        currency: payload.currency,
        nationality: payload.nationality,
        correlationId: payload.correlationId,
      });

      const response = await tripjackClient.post('/hms/v3/hotel/listing', payload);

      console.log('[RealHotel] search response', {
        status: response.status,
        hasData: Boolean(response.data),
        searchId: response.data?.searchId,
        hotelCount: Array.isArray(response.data?.hotels) ? response.data.hotels.length : 0,
        keys: response.data ? Object.keys(response.data) : [],
      });

      return {
        searchId: response.data.searchId,
        hotels: response.data.hotels || [],
        status: response.data.status || { success: true },
      };
    } catch (error) {
      const message = handleError(error, 'search');
      return {
        searchId: '',
        hotels: [],
        status: { success: false, message },
      };
    }
  }

  /**
   * Get pricing options for a hotel
   * POST /hms/v3/hotel/pricing
   */
  async pricing(req: PricingRequest): Promise<PricingResponse> {
    try {
      const payload = {
        searchId: req.searchId,
        hid: req.tjHotelId,
        checkIn: req.checkIn,
        checkOut: req.checkOut,
        rooms: req.rooms,
        currency: req.currency,
      };

      const response = await tripjackClient.post('/hms/v3/hotel/pricing', payload);

      return {
        options: response.data.options || [],
        status: response.data.status || { success: true },
      };
    } catch (error) {
      const message = handleError(error, 'pricing');
      return {
        options: [],
        status: { success: false, message },
      };
    }
  }

  /**
   * Review (re-validate) a pricing option
   * POST /hms/v3/hotel/review
   */
  async review(req: ReviewRequest): Promise<ReviewResponse> {
    try {
      const payload = {
        searchId: req.searchId,
        optionId: req.optionId,
      };

      const response = await tripjackClient.post('/hms/v3/hotel/review', payload);

      return {
        reviewId: response.data.reviewId,
        priceChanged: response.data.priceChanged || false,
        status: response.data.status || { success: true },
      };
    } catch (error) {
      const message = handleError(error, 'review');
      return {
        reviewId: '',
        priceChanged: false,
        status: { success: false, message },
      };
    }
  }

  /**
   * Book a hotel
   * POST /hms/v3/hotel/book
   * Note: bookingId is passed in but TripJack may generate its own
   */
  async book(req: BookRequest, bookingId: string): Promise<BookResponse> {
    try {
      const payload = {
        reviewId: req.reviewId,
        travellerInfo: req.travellerInfo,
        contactInfo: req.contactInfo,
        paymentInfo: req.paymentInfo,
      };

      const response = await tripjackClient.post('/hms/v3/hotel/book', payload);

      // Use TripJack's bookingId if provided, otherwise use passed-in bookingId
      const finalBookingId = response.data.bookingId || bookingId;

      return {
        bookingId: finalBookingId,
        pnr: response.data.pnr || '',
        bookingRef: response.data.bookingRef,
        status: response.data.status || 'CONFIRMED',
      };
    } catch (error) {
      const message = handleError(error, 'book');
      return {
        bookingId: '',
        pnr: '',
        status: 'FAILED',
        statusObj: { success: false, message },
      };
    }
  }

  /**
   * Get booking details
   * POST /oms/v3/hotel/booking-details
   */
  async bookingDetail(req: BookingDetailRequest): Promise<BookingDetailResponse> {
    try {
      const payload = {
        bookingId: req.bookingId,
      };

      const response = await tripjackClient.post('/oms/v3/hotel/booking-details', payload);

      return {
        booking: response.data.booking || {
          status: 'NOT_FOUND',
          travellers: [],
          itinerary: { hotelName: '' },
        },
        status: response.data.status || { success: true },
      };
    } catch (error) {
      const message = handleError(error, 'bookingDetail');
      return {
        booking: {
          status: 'ERROR',
          travellers: [],
          itinerary: { hotelName: '' },
        },
        status: { success: false, message },
      };
    }
  }

  /**
   * Cancel a booking
   * POST /oms/v3/hotel/cancel-booking
   */
  async cancel(req: CancelRequest): Promise<CancelResponse> {
    try {
      const payload = {
        bookingId: req.bookingId,
        remark: req.remark,
      };

      const response = await tripjackClient.post('/oms/v3/hotel/cancel-booking', payload);

      return {
        cancellationId: response.data.cancellationId || '',
        refundAmount: response.data.refundAmount || 0,
        status: response.data.status || 'CANCELLED',
      };
    } catch (error) {
      const message = handleError(error, 'cancel');
      return {
        cancellationId: '',
        refundAmount: 0,
        status: 'FAILED',
        statusObj: { success: false, message },
      };
    }
  }

  /**
   * Get static hotel detail
   * GET /hms/v3/hotel/static-detail?hid={hid}
   */
  async staticDetail(req: StaticDetailRequest): Promise<StaticDetailResponse> {
    try {
      const response = await tripjackClient.get('/hms/v3/hotel/static-detail', {
        params: { hid: req.hid },
      });

      return {
        hotelDetail: response.data.hotelDetail || {
          name: '',
          address: '',
          amenities: [],
          images: [],
        },
        status: response.data.status || { success: true },
      };
    } catch (error) {
      const message = handleError(error, 'staticDetail');
      return {
        hotelDetail: {
          name: '',
          address: '',
          amenities: [],
          images: [],
        },
        status: { success: false, message },
      };
    }
  }

  /**
   * Search cities
   * POST /hms/v3/hotel/static-cities
   */
  async cities(req: CitiesRequest): Promise<CitiesResponse> {
    try {
      const payload = {
        cityName: req.cityName,
      };

      const response = await tripjackClient.post('/hms/v3/hotel/static-cities', payload);

      return {
        cities: response.data.cities || [],
        status: response.data.status || { success: true },
      };
    } catch (error) {
      const message = handleError(error, 'cities');
      return {
        cities: [],
        status: { success: false, message },
      };
    }
  }

  /**
   * Get nationalities
   * GET /hms/v3/hotel/nationalities
   */
  async nationalities(): Promise<NationalitiesResponse> {
    try {
      const response = await tripjackClient.get('/hms/v3/hotel/nationalities');

      return {
        nationalities: response.data.nationalities || [],
        status: response.data.status || { success: true },
      };
    } catch (error) {
      const message = handleError(error, 'nationalities');
      return {
        nationalities: [],
        status: { success: false, message },
      };
    }
  }

  /**
   * Get account balance
   * GET /hms/v3/account/balance
   */
  async accountBalance(): Promise<BalanceResponse> {
    try {
      const response = await tripjackClient.get('/hms/v3/account/balance');

      return {
        balance: response.data.balance || 0,
        creditLimit: response.data.creditLimit || 0,
        currency: response.data.currency || 'INR',
        status: response.data.status || { success: true },
      };
    } catch (error) {
      const message = handleError(error, 'accountBalance');
      return {
        balance: 0,
        creditLimit: 0,
        currency: 'INR',
        status: { success: false, message },
      };
    }
  }

  /**
   * Fetch paginated city region IDs
   * GET /hms/v3/content/fetch-city-regionIds
   */
  async cityRegionIds(limit: number, cursor?: string): Promise<CityRegionResponse> {
    try {
      const response = await tripjackClient.get('/hms/v3/content/fetch-city-regionIds', {
        params: {
          limit,
          ...(cursor ? { cursor } : {}),
        },
      });

      return {
        hotelCityRegionIds: response.data.hotelCityRegionIds || [],
        nextCursor: response.data.nextCursor,
        status: response.data.status || { success: true },
      };
    } catch (error) {
      const message = handleError(error, 'cityRegionIds');
      return {
        hotelCityRegionIds: [],
        status: { success: false, message },
      };
    }
  }

  /**
   * Fetch available hotel countries
   * GET /hms/v3/content/fetch-countries
   */
  async hotelCountries(): Promise<HotelCountriesResponse> {
    try {
      const response = await tripjackClient.get('/hms/v3/content/fetch-countries');

      return {
        hotelCountries: response.data.hotelCountries || [],
        status: response.data.status || { success: true },
      };
    } catch (error) {
      const message = handleError(error, 'hotelCountries');
      return {
        hotelCountries: [],
        status: { success: false, message },
      };
    }
  }

  /**
   * Fetch hotel mapping by country or region
   * POST /hms/v3/content/fetch-hotel-mapping
   */
  async hotelMapping(req: HotelMappingRequest): Promise<HotelMappingResponse> {
    try {
      const payload = {
        ...(req.countryName ? { countryName: req.countryName } : {}),
        ...(req.regionIds?.length ? { regionIds: req.regionIds } : {}),
        page: req.page,
        size: Math.min(req.size, 2000),
      };

      const response = await tripjackClient.post('/hms/v3/content/fetch-hotel-mapping', payload);

      return {
        hotels: response.data.hotels || [],
        pageable: response.data.pageable || {
          pageNumber: req.page,
          pageSize: payload.size,
          offset: req.page * payload.size,
          totalElements: response.data.hotels?.length || 0,
          totalPages: 1,
          size: payload.size,
        },
        status: response.data.status || { success: true },
      };
    } catch (error) {
      const message = handleError(error, 'hotelMapping');
      return {
        hotels: [],
        pageable: {
          pageNumber: req.page,
          pageSize: Math.min(req.size, 2000),
          offset: req.page * Math.min(req.size, 2000),
          totalElements: 0,
          totalPages: 0,
          size: Math.min(req.size, 2000),
        },
        status: { success: false, message },
      };
    }
  }

  /**
   * Fetch static hotel content for a list of hotel IDs
   * POST /hms/v3/content/fetch-hotel-content
   */
  async hotelContent(req: HotelContentRequest): Promise<HotelContentResponse> {
    try {
      const response = await tripjackClient.post('/hms/v3/content/fetch-hotel-content', {
        hotelIds: req.hotelIds.slice(0, 100),
      });

      return {
        hotels: response.data.hotels || [],
        status: response.data.status || { success: true },
      };
    } catch (error) {
      const message = handleError(error, 'hotelContent');
      return {
        hotels: [],
        status: { success: false, message },
      };
    }
  }
}

export default new RealHotelService();
