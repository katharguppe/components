/**
 * Stub Hotel Service (v3.0)
 * Implements IHotelService using:
 *   - Gemini 2.0 Flash for hotel search (call #1)
 *   - Gemini 2.0 Flash for booking confirmation (call #2)
 *   - In-memory Maps for state: searchStore, pricingStore, reviewStore, bookingStore
 *   - Hardcoded fixtures for static endpoints (cities, nationalities, balance, detail)
 *
 * Error handling: log warning, return fixture, never crash booking flow
 */

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
  NationalitiesResponse,
  BalanceResponse,
  HotelOption,
  PricingOption,
} from './hotel.interface';
import { generateSearchHotels, generateBookingConfirmation } from '../gemini.client';

// ─── In-Memory Stores (process lifetime) ────────────────────────────────────

interface SearchStoreEntry {
  hotels: HotelOption[];
  query: SearchRequest;
  createdAt: Date;
}

interface PricingStoreEntry {
  options: PricingOption[];
  createdAt: Date;
}

interface ReviewStoreEntry {
  reviewId: string;
  searchId: string;
  priceChanged: boolean;
  createdAt: Date;
}

interface BookingStoreEntry {
  status: string;
  pnr: string;
  travellers: any[];
  createdAt: Date;
}

const searchStore = new Map<string, SearchStoreEntry>();
const pricingStore = new Map<string, PricingStoreEntry>();
const reviewStore = new Map<string, ReviewStoreEntry>();
const bookingStore = new Map<string, BookingStoreEntry>();

// ─── Hardcoded Fixtures ─────────────────────────────────────────────────────

interface City {
  cityCode: string;
  cityName: string;
  country: string;
}

const FIXTURE_CITIES: City[] = [
  { cityCode: '1001', cityName: 'Mumbai', country: 'India' },
  { cityCode: '1002', cityName: 'Delhi', country: 'India' },
  { cityCode: '1003', cityName: 'Bangalore', country: 'India' },
  { cityCode: '1004', cityName: 'Goa', country: 'India' },
  { cityCode: '1005', cityName: 'Jaipur', country: 'India' },
];

const FIXTURE_NATIONALITIES = [
  { countryId: '106', name: 'Indian' },
  { countryId: '232', name: 'United States' },
  { countryId: '826', name: 'United Kingdom' },
  { countryId: '36', name: 'Australia' },
  { countryId: '124', name: 'Canada' },
];

const FIXTURE_BALANCE = {
  balance: 50000.0,
  creditLimit: 10000.0,
  currency: 'INR',
};

// ─── Service Implementation ──────────────────────────────────────────────────

export class StubHotelService implements IHotelService {
  /**
   * Search hotels by hids + dates
   * Calls Gemini to generate 5 realistic hotels, caches in searchStore
   */
  async search(req: SearchRequest): Promise<SearchResponse> {
    try {
      // Generate unique searchId
      const searchId = `SID-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Call Gemini to generate hotels
      const hotels = await generateSearchHotels(req);

      // Cache in searchStore
      searchStore.set(searchId, {
        hotels,
        query: req,
        createdAt: new Date(),
      });

      return {
        searchId,
        hotels,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] search() error:', error);
      // Return error response (don't crash)
      return {
        searchId: '',
        hotels: [],
        status: { success: false, message: 'Search failed' },
      };
    }
  }

  /**
   * Get pricing options for a hotel
   * Derives from searchStore; generates 3 random pricing options
   */
  async pricing(req: PricingRequest): Promise<PricingResponse> {
    try {
      // Lookup searchStore
      const searchEntry = searchStore.get(req.searchId);
      if (!searchEntry) {
        return {
          options: [],
          status: { success: false, message: 'Search not found' },
        };
      }

      // Check if hotel exists in search results
      const hotel = searchEntry.hotels.find((h) => h.tjHotelId === req.tjHotelId);
      if (!hotel) {
        return {
          options: [],
          status: { success: false, message: 'Hotel not found in search' },
        };
      }

      // Generate 3 pricing options for this hotel
      const options: PricingOption[] = [
        {
          optionId: `OPT-${hotel.tjHotelId}-01`,
          rooms: [{ name: 'Deluxe Room', count: 1 }],
          mealPlan: 'Room Only',
          pricing: {
            totalPrice: hotel.option.price.totalPrice,
            taxes: Math.round(hotel.option.price.totalPrice * 0.12),
          },
          cancellation: {
            isRefundable: true,
            penalties: [{ from: new Date().toISOString(), amount: 0 }],
          },
        },
        {
          optionId: `OPT-${hotel.tjHotelId}-02`,
          rooms: [{ name: 'Suite', count: 1 }],
          mealPlan: 'Breakfast Included',
          pricing: {
            totalPrice: Math.round(hotel.option.price.totalPrice * 1.2),
            taxes: Math.round(hotel.option.price.totalPrice * 1.2 * 0.12),
          },
          cancellation: {
            isRefundable: true,
            penalties: [{ from: new Date().toISOString(), amount: Math.round(hotel.option.price.totalPrice * 0.1) }],
          },
        },
        {
          optionId: `OPT-${hotel.tjHotelId}-03`,
          rooms: [{ name: 'Premium Suite', count: 1 }],
          mealPlan: 'All-Inclusive',
          pricing: {
            totalPrice: Math.round(hotel.option.price.totalPrice * 1.5),
            taxes: Math.round(hotel.option.price.totalPrice * 1.5 * 0.12),
          },
          cancellation: {
            isRefundable: false,
            penalties: [
              { from: new Date().toISOString(), amount: Math.round(hotel.option.price.totalPrice * 0.25) },
            ],
          },
        },
      ];

      // Cache in pricingStore
      const pricingKey = `${req.searchId}:${req.tjHotelId}`;
      pricingStore.set(pricingKey, {
        options,
        createdAt: new Date(),
      });

      return {
        options,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] pricing() error:', error);
      return {
        options: [],
        status: { success: false, message: 'Pricing failed' },
      };
    }
  }

  /**
   * Review (re-validate) a pricing option
   * Derives from pricingStore; generates reviewId
   */
  async review(req: ReviewRequest): Promise<ReviewResponse> {
    try {
      // Find the pricing entry containing this optionId
      let pricingEntry: PricingStoreEntry | null = null;
      let pricingKey: string | null = null;

      for (const [key, entry] of pricingStore.entries()) {
        if (entry.options.some((opt) => opt.optionId === req.optionId)) {
          pricingEntry = entry;
          pricingKey = key;
          break;
        }
      }

      if (!pricingEntry || !pricingKey) {
        return {
          reviewId: '',
          priceChanged: false,
          status: { success: false, message: 'Option not found' },
        };
      }

      // Generate reviewId
      const reviewId = `REV-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Cache in reviewStore
      reviewStore.set(req.optionId, {
        reviewId,
        searchId: req.searchId,
        priceChanged: false, // stub: price never changes
        createdAt: new Date(),
      });

      return {
        reviewId,
        priceChanged: false,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] review() error:', error);
      return {
        reviewId: '',
        priceChanged: false,
        status: { success: false, message: 'Review failed' },
      };
    }
  }

  /**
   * Book a hotel
   * Calls Gemini to generate booking confirmation, caches in bookingStore
   * Note: bookingId is passed in (generated by route layer)
   * Also inserts into DB via audit event or separate DB call
   */
  async book(req: BookRequest, bookingId: string): Promise<BookResponse> {
    try {
      // Verify review exists
      const reviewEntry = reviewStore.get(req.reviewId);
      if (!reviewEntry) {
        return {
          bookingId: '',
          pnr: '',
          status: 'FAILED',
          statusObj: { success: false, message: 'Review not found' },
        };
      }

      // Call Gemini to generate confirmation
      const bookCheckIn = new Date().toISOString().split('T')[0] || '2024-01-01';
      const bookCheckOut = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] || '2024-01-03';
      const confirmation = await generateBookingConfirmation(
        {
          hotelName: 'Premium Hotel India', // Would come from pricing lookup in real flow
          checkInDate: bookCheckIn,
          checkOutDate: bookCheckOut,
          travellers: req.travellerInfo,
        },
        bookingId
      );

      // Cache in bookingStore
      bookingStore.set(bookingId, {
        status: 'CONFIRMED',
        pnr: confirmation.pnr,
        travellers: req.travellerInfo,
        createdAt: new Date(),
      });

      return {
        bookingId: confirmation.bookingId,
        pnr: confirmation.pnr,
        bookingRef: `HTL-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        status: 'CONFIRMED',
      };
    } catch (error) {
      console.error('[StubHotel] book() error:', error);
      return {
        bookingId: '',
        pnr: '',
        status: 'FAILED',
        statusObj: { success: false, message: 'Booking failed' },
      };
    }
  }

  /**
   * Get booking details
   * Derives from bookingStore
   */
  async bookingDetail(req: BookingDetailRequest): Promise<BookingDetailResponse> {
    try {
      const booking = bookingStore.get(req.bookingId);
      if (!booking) {
        return {
          booking: {
            status: 'NOT_FOUND',
            travellers: [],
            itinerary: { hotelName: '' },
          },
          status: { success: false, message: 'Booking not found' },
        };
      }

      const checkInDate = new Date().toISOString().split('T')[0];
      const checkOutDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      return {
        booking: {
          status: booking.status,
          voucherUrl: `https://tj.com/v/${req.bookingId}`,
          travellers: booking.travellers,
          itinerary: {
            hotelName: 'Premium Hotel India',
            checkInDate,
            checkOutDate,
          },
        },
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] bookingDetail() error:', error);
      return {
        booking: {
          status: 'ERROR',
          travellers: [],
          itinerary: { hotelName: '' },
        },
        status: { success: false, message: 'Booking detail failed' },
      };
    }
  }

  /**
   * Cancel a booking
   * Updates bookingStore status to CANCELLED
   */
  async cancel(req: CancelRequest): Promise<CancelResponse> {
    try {
      const booking = bookingStore.get(req.bookingId);
      if (!booking) {
        return {
          cancellationId: '',
          refundAmount: 0,
          status: 'FAILED',
          statusObj: { success: false, message: 'Booking not found' },
        };
      }

      if (booking.status === 'CANCELLED') {
        return {
          cancellationId: '',
          refundAmount: 0,
          status: 'FAILED',
          statusObj: { success: false, message: 'Booking already cancelled' },
        };
      }

      // Update status
      booking.status = 'CANCELLED';

      return {
        cancellationId: `CAN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        refundAmount: 8000.0,
        status: 'CANCELLED',
      };
    } catch (error) {
      console.error('[StubHotel] cancel() error:', error);
      return {
        cancellationId: '',
        refundAmount: 0,
        status: 'FAILED',
        statusObj: { success: false, message: 'Cancel failed' },
      };
    }
  }

  /**
   * Get static hotel detail
   * Returns hardcoded fixture for any hid
   */
  async staticDetail(req: StaticDetailRequest): Promise<StaticDetailResponse> {
    try {
      return {
        hotelDetail: {
          name: 'Premium Hotel India',
          address: '123 Main Street, Mumbai, India',
          amenities: ['WiFi', 'Pool', 'Gym', 'Spa', 'Restaurant', 'Bar'],
          images: [
            'https://cdn.tripjack.com/hotel-1.jpg',
            'https://cdn.tripjack.com/hotel-2.jpg',
            'https://cdn.tripjack.com/hotel-3.jpg',
          ],
        },
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] staticDetail() error:', error);
      return {
        hotelDetail: {
          name: '',
          address: '',
          amenities: [],
          images: [],
        },
        status: { success: false, message: 'Static detail failed' },
      };
    }
  }

  /**
   * Search cities
   * Returns hardcoded fixture
   */
  async cities(req: CitiesRequest): Promise<CitiesResponse> {
    try {
      // Filter fixture by city name (simple substring match)
      const filtered = FIXTURE_CITIES.filter((c) => c.cityName.toLowerCase().includes(req.cityName.toLowerCase()));

      return {
        cities: filtered.length > 0 ? filtered : FIXTURE_CITIES,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] cities() error:', error);
      return {
        cities: [],
        status: { success: false, message: 'Cities search failed' },
      };
    }
  }

  /**
   * Get nationalities
   * Returns hardcoded fixture
   */
  async nationalities(): Promise<NationalitiesResponse> {
    try {
      return {
        nationalities: FIXTURE_NATIONALITIES,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] nationalities() error:', error);
      return {
        nationalities: [],
        status: { success: false, message: 'Nationalities failed' },
      };
    }
  }

  /**
   * Get account balance
   * Returns hardcoded fixture
   */
  async accountBalance(): Promise<BalanceResponse> {
    try {
      return {
        balance: FIXTURE_BALANCE.balance,
        creditLimit: FIXTURE_BALANCE.creditLimit,
        currency: FIXTURE_BALANCE.currency,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] accountBalance() error:', error);
      return {
        balance: 0,
        creditLimit: 0,
        currency: 'INR',
        status: { success: false, message: 'Balance failed' },
      };
    }
  }
}

export default new StubHotelService();
