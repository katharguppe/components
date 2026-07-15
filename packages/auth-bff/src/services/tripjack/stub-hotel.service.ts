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
  CityRegionResponse,
  NationalitiesResponse,
  BalanceResponse,
  HotelCountriesResponse,
  HotelContentRequest,
  HotelContentResponse,
  HotelListingItem,
  HotelMappingRequest,
  HotelMappingResponse,
  HotelMappingSyncRequest,
  DeletedHotelMappingSyncRequest,
  HotelMappingSyncResponse,
  PricingOption,
} from './hotel.interface';
import { generateSearchHotels, generateBookingConfirmation } from '../gemini.client';

// ─── In-Memory Stores (process lifetime) ────────────────────────────────────

interface SearchStoreEntry {
  hotels: HotelListingItem[];
  query: SearchRequest;
  createdAt: Date;
}

interface PricingStoreEntry {
  options: PricingOption[];
  reviewHash: string;
  createdAt: Date;
}

interface ReviewStoreEntry {
  reviewId: string;
  searchId: string;
  reviewHash: string;
  hid: string;
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

const FIXTURE_CITY_REGION_IDS = [
  {
    cityName: 'MUMBAI',
    cityRegionId: 1001,
    regionName: 'MUMBAI',
    countryName: 'INDIA',
    regionType: 'CITY',
    fullRegionName: 'MUMBAI, MAHARASHTRA, INDIA',
  },
  {
    cityName: 'DELHI',
    cityRegionId: 1002,
    regionName: 'DELHI',
    countryName: 'INDIA',
    regionType: 'CITY',
    fullRegionName: 'DELHI, DELHI, INDIA',
  },
  {
    cityName: 'DUBAI',
    cityRegionId: 2001,
    regionName: 'DUBAI',
    countryName: 'UNITED ARAB EMIRATES',
    regionType: 'CITY',
    fullRegionName: 'DUBAI, UNITED ARAB EMIRATES',
  },
  {
    cityName: 'ABU DHABI',
    cityRegionId: 2002,
    regionName: 'ABU DHABI',
    countryName: 'UNITED ARAB EMIRATES',
    regionType: 'CITY',
    fullRegionName: 'ABU DHABI, UNITED ARAB EMIRATES',
  },
];

const FIXTURE_NATIONALITIES = [
  { countryId: '106', name: 'Indian' },
  { countryId: '232', name: 'United States' },
  { countryId: '826', name: 'United Kingdom' },
  { countryId: '36', name: 'Australia' },
  { countryId: '124', name: 'Canada' },
];

const FIXTURE_COUNTRIES = [
  'INDIA',
  'UNITED STATES',
  'UNITED KINGDOM',
  'UNITED ARAB EMIRATES',
  'SINGAPORE',
];

const FIXTURE_BALANCE = {
  balance: 50000.0,
  creditLimit: 10000.0,
  currency: 'INR',
};

function hashString(value: string): number {
  return value.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function buildHotelMapping(seed: string, count: number): Array<{ tjHotelId: string; unicaId: string }> {
  const base = Math.abs(hashString(seed)) * 1000;
  const hotelSeed = 100000000000 + (base % 90000000000);

  return Array.from({ length: count }, (_, index) => ({
    tjHotelId: String(hotelSeed + index),
    unicaId: String(70000000 + base + index + 1),
  }));
}

function buildSyncRows(seed: string, count: number): Array<{ tjHotelId: string }> {
  return buildHotelMapping(seed, count).map(({ tjHotelId }) => ({ tjHotelId }));
}

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
      const hotels = await generateSearchHotels({
        checkIn: req.checkIn,
        checkOut: req.checkOut,
        hids: req.hids,
        rooms: req.rooms.map((room) => ({
          adults: room.adults,
          ...(typeof room.children === 'number' ? { children: room.children } : {}),
        })),
        currency: req.currency,
        nationality: req.nationality,
      });

      // Cache in searchStore
      searchStore.set(searchId, {
        hotels,
        query: req,
        createdAt: new Date(),
      });

      return {
        searchId,
        hotels,
        correlationId: req.correlationId,
        nationality: req.nationality,
        currency: req.currency,
        totalResults: hotels.length,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] search() error:', error);
      // Return error response (don't crash)
      return {
        searchId: '',
        hotels: [],
        correlationId: req.correlationId,
        nationality: req.nationality,
        currency: req.currency,
        totalResults: 0,
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
      const correlationId = req.correlationId || req.hid;
      // Lookup searchStore
      const searchEntry = searchStore.get(correlationId);
      if (!searchEntry) {
        return {
          tjHotelId: req.hid,
          hotelName: '',
          nationality: req.nationality,
          options: [],
          reviewHash: '',
          correlationId,
          status: { success: false, message: 'Search not found' },
        };
      }

      // Check if hotel exists in search results
      const hotel = searchEntry.hotels.find((h) => h.tjHotelId === req.hid);
      if (!hotel) {
        return {
          tjHotelId: req.hid,
          hotelName: '',
          nationality: req.nationality,
          options: [],
          reviewHash: '',
          correlationId,
          status: { success: false, message: 'Hotel not found in search' },
        };
      }

      const cheapestOption = hotel.options[0];
      if (!cheapestOption) {
        return {
          tjHotelId: hotel.tjHotelId,
          hotelName: hotel.name,
          nationality: req.nationality,
          options: [],
          reviewHash: '',
          correlationId: req.correlationId,
          status: { success: false, message: 'No pricing options available' },
        };
      }

      // Generate 3 pricing options for this hotel
      const options: PricingOption[] = [
        {
          optionId: `OPT-${hotel.tjHotelId}-01`,
          optionType: 'SRSM',
          roomInfo: [{ id: hotel.tjHotelId, name: 'Deluxe, 2 Twin' }],
          rooms: [{ name: 'Deluxe Room', count: 1 }],
          inclusions: ['String1', 'String2'],
          mealPlan: 'Room Only',
          mealBasis: 'Room Only',
          bookingNotes: 'Must print on screen.\nThese are rules to be displayed in rateplan details',
          pricing: {
            totalPrice: cheapestOption.pricing.totalPrice,
            basePrice: cheapestOption.pricing.totalPrice,
            discount: 0,
            taxes: Math.round(cheapestOption.pricing.totalPrice * 0.12),
            mf: 0,
            mft: 0,
            currency: req.currency,
          },
          commercial: { type: 'NET', commission: 0 },
          compliance: {
            gstType: 'NA',
            panRequired: false,
            passportRequired: false,
          },
          cancellation: {
            isRefundable: true,
            penalties: [
              { from: new Date().toISOString(), to: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), amount: 0 },
              { from: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), amount: Math.round(cheapestOption.pricing.totalPrice) },
            ],
          },
        },
        {
          optionId: `OPT-${hotel.tjHotelId}-02`,
          optionType: 'SRCM',
          roomInfo: [{ id: hotel.tjHotelId, name: 'Suite, 1 King' }],
          rooms: [{ name: 'Suite', count: 1 }],
          inclusions: ['Breakfast', 'WiFi'],
          mealPlan: 'Breakfast Included',
          mealBasis: 'Breakfast',
          bookingNotes: 'Breakfast included rate.',
          pricing: {
            totalPrice: Math.round(cheapestOption.pricing.totalPrice * 1.2),
            basePrice: Math.round(cheapestOption.pricing.totalPrice * 1.2),
            discount: 0,
            taxes: Math.round(cheapestOption.pricing.totalPrice * 1.2 * 0.12),
            mf: 0,
            mft: 0,
            currency: req.currency,
          },
          commercial: { type: 'COMMISSIONABLE', commission: 5 },
          compliance: {
            gstType: 'NA',
            panRequired: false,
            passportRequired: false,
          },
          cancellation: {
            isRefundable: true,
            penalties: [{ from: new Date().toISOString(), amount: Math.round(cheapestOption.pricing.totalPrice * 0.1) }],
          },
        },
        {
          optionId: `OPT-${hotel.tjHotelId}-03`,
          optionType: 'CRSM',
          roomInfo: [{ id: hotel.tjHotelId, name: 'Premium Suite' }],
          rooms: [{ name: 'Premium Suite', count: 1 }],
          inclusions: ['Breakfast', 'Airport transfer', 'Late checkout'],
          mealPlan: 'All-Inclusive',
          mealBasis: 'All Inclusive',
          bookingNotes: 'Premium option with extra inclusions.',
          pricing: {
            totalPrice: Math.round(cheapestOption.pricing.totalPrice * 1.5),
            basePrice: Math.round(cheapestOption.pricing.totalPrice * 1.5),
            discount: 0,
            taxes: Math.round(cheapestOption.pricing.totalPrice * 1.5 * 0.12),
            mf: 0,
            mft: 0,
            currency: req.currency,
          },
          commercial: { type: 'EXTRANET', commission: 0 },
          compliance: {
            gstType: 'NA',
            panRequired: true,
            passportRequired: true,
          },
          cancellation: {
            isRefundable: false,
            penalties: [
              { from: new Date().toISOString(), amount: Math.round(cheapestOption.pricing.totalPrice * 0.25) },
            ],
          },
        },
      ];

      // Cache in pricingStore
      const pricingKey = `${correlationId}:${req.hid}`;
      const reviewHash = `RH-${hotel.tjHotelId}-${Date.now()}`;
      pricingStore.set(pricingKey, {
        options,
        reviewHash,
        createdAt: new Date(),
      });

      return {
        tjHotelId: hotel.tjHotelId,
        hotelName: hotel.name,
        nationality: req.nationality,
        options,
        reviewHash,
        correlationId,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] pricing() error:', error);
      return {
        tjHotelId: req.hid,
        hotelName: '',
        nationality: req.nationality,
        options: [],
        reviewHash: '',
        correlationId: req.correlationId || req.hid,
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
      const searchKey = req.searchId || req.correlationId || req.hid;
      const searchEntry = searchStore.get(searchKey);
      if (!searchEntry) {
        return {
          reviewId: '',
          bookingId: '',
          tjHotelId: req.hid,
          hotelName: '',
          option: { optionId: req.optionId, pricing: { totalPrice: 0 } } as any,
          correlationId: req.correlationId,
          priceChanged: false,
          status: { success: false, message: 'Search not found' },
        };
      }

      const pricingKey = `${req.correlationId || req.hid}:${req.hid}`;
      const pricingEntry = pricingStore.get(pricingKey);

      if (!pricingEntry) {
        return {
          reviewId: '',
          bookingId: '',
          tjHotelId: req.hid,
          hotelName: '',
          option: { optionId: req.optionId, pricing: { totalPrice: 0 } } as any,
          correlationId: req.correlationId,
          priceChanged: false,
          status: { success: false, message: 'Option not found' },
        };
      }

      // Generate reviewId
      const reviewId = `REV-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const hotel = searchEntry.hotels.find((h) => h.tjHotelId === req.hid);
      const confirmedOption = pricingEntry.options.find((opt) => opt.optionId === req.optionId) || pricingEntry.options[0];
      if (!confirmedOption) {
        return {
          reviewId: '',
          bookingId: '',
          tjHotelId: req.hid,
          hotelName: hotel?.name || '',
          option: { optionId: req.optionId, pricing: { totalPrice: 0 } } as any,
          correlationId: req.correlationId,
          priceChanged: false,
          status: { success: false, message: 'No pricing options available' },
        };
      }

      // Cache in reviewStore keyed by reviewId (so book() can look it up by req.reviewId)
      reviewStore.set(reviewId, {
        reviewId,
        searchId: searchKey,
        reviewHash: req.reviewHash,
        hid: req.hid,
        priceChanged: false, // stub: price never changes
        createdAt: new Date(),
      });

      return {
        reviewId,
        bookingId: reviewId,
        tjHotelId: req.hid,
        hotelName: hotel?.name || '',
        option: confirmedOption,
        correlationId: req.correlationId || req.hid,
        onholdAllowed: 'true',
        priceChanged: false,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] review() error:', error);
      return {
        reviewId: '',
        bookingId: '',
        tjHotelId: req.hid,
        hotelName: '',
        option: { optionId: req.optionId, pricing: { totalPrice: 0 } } as any,
        correlationId: req.correlationId || req.hid,
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
            ...(checkInDate ? { checkInDate } : {}),
            ...(checkOutDate ? { checkOutDate } : {}),
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
  async staticDetail(_req: StaticDetailRequest): Promise<StaticDetailResponse> {
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

  /**
   * Fetch paginated city region IDs
   * Returns fixture rows in pages
   */
  async cityRegionIds(limit: number, cursor?: string): Promise<CityRegionResponse> {
    try {
      const pageSize = Math.min(Math.max(limit || 100, 1), 2000);
      const startIndex = cursor ? Number(Buffer.from(cursor, 'base64').toString('utf8')) || 0 : 0;
      const rows = FIXTURE_CITY_REGION_IDS.slice(startIndex, startIndex + pageSize);
      const nextIndex = startIndex + rows.length;

      return {
        hotelCityRegionIds: rows,
        nextCursor: nextIndex < FIXTURE_CITY_REGION_IDS.length ? Buffer.from(String(nextIndex)).toString('base64') : undefined,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] cityRegionIds() error:', error);
      return {
        hotelCityRegionIds: [],
        status: { success: false, message: 'City region lookup failed' },
      };
    }
  }

  /**
   * Return a fixed list of countries for local dev
   */
  async hotelCountries(): Promise<HotelCountriesResponse> {
    try {
      return {
        hotelCountries: FIXTURE_COUNTRIES,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] hotelCountries() error:', error);
      return {
        hotelCountries: [],
        status: { success: false, message: 'Countries failed' },
      };
    }
  }

  /**
   * Return synthetic mappings for local dev
   */
  async hotelMapping(req: HotelMappingRequest): Promise<HotelMappingResponse> {
    try {
      const seed = req.countryName || req.regionIds?.join(',') || 'DEFAULT';
      const allHotels = buildHotelMapping(seed, 48);
      const pageSize = Math.min(req.size, 2000);
      const start = req.page * pageSize;
      const end = start + pageSize;
      const hotels = allHotels.slice(start, end);
      const totalElements = allHotels.length;
      const totalPages = Math.max(1, Math.ceil(totalElements / pageSize));

      return {
        hotels,
        pageable: {
          pageNumber: req.page,
          pageSize,
          offset: start,
          totalElements,
          totalPages,
          size: pageSize,
        },
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] hotelMapping() error:', error);
      return {
        hotels: [],
        pageable: {
          pageNumber: req.page,
          pageSize: Math.min(req.size, 2000),
          offset: 0,
          totalElements: 0,
          totalPages: 0,
          size: Math.min(req.size, 2000),
        },
        status: { success: false, message: 'Hotel mapping failed' },
      };
    }
  }

  /**
   * Return synthetic hotel content for local dev
   */
  async hotelContent(req: HotelContentRequest): Promise<HotelContentResponse> {
    try {
      const hotels = req.hotelIds.slice(0, 100).map((hid, index) => ({
        tjHotelId: hid,
        unicaId: String(80000000 + index),
        name: `Hotel ${hid.slice(-4)}`,
        is_active: true,
        star_rating: String((index % 5) + 1),
        property_type: { id: 'Hotel', name: 'Hotel' },
        locale: {
          address: {
            fulladdr: `${index + 1} Example Street`,
            city: 'Sample City',
            countryname: 'INDIA',
          },
        },
      }));

      return {
        hotels,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] hotelContent() error:', error);
      return {
        hotels: [],
        status: { success: false, message: 'Hotel content failed' },
      };
    }
  }

  /**
   * Return synthetic NEW/UPDATE sync rows for local dev
   */
  async hotelMappingSync(req: HotelMappingSyncRequest): Promise<HotelMappingSyncResponse> {
    try {
      const seed = `${req.type}:${req.lastUpdateTime}`;
      const hotels = buildSyncRows(seed, 25);

      return {
        hotels,
        pageable: {
          pageNumber: req.page || 0,
          pageSize: hotels.length,
          totalElements: hotels.length,
          totalPages: 1,
        },
        nextCursor: undefined,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] hotelMappingSync() error:', error);
      return {
        hotels: [],
        pageable: {
          pageNumber: req.page || 0,
          pageSize: 0,
          totalElements: 0,
          totalPages: 0,
        },
        status: { success: false, message: 'Hotel mapping sync failed' },
      };
    }
  }

  /**
   * Return synthetic DELETE sync rows for local dev
   */
  async deletedHotelMappingSync(req: DeletedHotelMappingSyncRequest): Promise<HotelMappingSyncResponse> {
    try {
      const seed = `${req.type}:${req.lastUpdateTime}`;
      const hotels = buildSyncRows(seed, 10);

      return {
        hotels,
        pageable: {
          pageNumber: req.page || 0,
          pageSize: hotels.length,
          totalElements: hotels.length,
          totalPages: 1,
        },
        nextCursor: undefined,
        status: { success: true },
      };
    } catch (error) {
      console.error('[StubHotel] deletedHotelMappingSync() error:', error);
      return {
        hotels: [],
        pageable: {
          pageNumber: req.page || 0,
          pageSize: 0,
          totalElements: 0,
          totalPages: 0,
        },
        status: { success: false, message: 'Deleted hotel mapping sync failed' },
      };
    }
  }
}

export default new StubHotelService();
