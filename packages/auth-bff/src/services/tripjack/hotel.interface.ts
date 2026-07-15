/**
 * Hotel Service Interface
 * Defines the contract for hotel booking operations (v3.0 API shapes)
 * Two implementations: StubHotelService (Gemini + in-memory) and RealHotelService (axios HTTP)
 */

// ─── v3.0 Request/Response Types ────────────────────────────────────────────

export interface Room {
  adults: number;
  children?: number | undefined;
  childAge?: number[] | undefined;
}

export interface SearchRequest {
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  hids: number[]; // TripJack hotel IDs
  rooms: Room[];
  currency: string; // INR, USD, etc.
  nationality: string; // country code, e.g., "106" for India
  correlationId?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface HotelOption {
  optionId: string;
  pricing: {
    totalPrice: number;
    currency: string;
  };
}

export interface HotelListingItem {
  tjHotelId: string;
  name: string;
  img: string;
  rt: number; // rating
  options: HotelOption[];
}

export interface SearchResponse {
  searchId: string;
  hotels: HotelListingItem[];
  correlationId?: string | undefined;
  nationality?: string | undefined;
  currency?: string | undefined;
  totalResults?: number | undefined;
  status: { success: boolean; message?: string };
}

export interface PricingRequest {
  correlationId?: string | undefined;
  hid: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  rooms: Room[];
  currency: string;
  nationality: string;
  timeoutMs?: number | undefined;
}

export interface PricingOption {
  optionId: string;
  optionType?: 'SRSM' | 'SRCM' | 'CRSM' | 'CRCM';
  roomInfo?: Array<{ id: string; name: string }>;
  rooms?: Array<{ name: string; count: number }>;
  inclusions?: string[];
  mealPlan?: string;
  mealBasis?: string;
  pricing: {
    totalPrice: number;
    basePrice?: number;
    discount?: number;
    taxes?: number;
    mf?: number;
    mft?: number;
    currency?: string;
    strikethrough?: number;
  };
  commercial?: {
    type?: 'NET' | 'COMMISSIONABLE' | 'EXTRANET';
    commission?: number;
  };
  compliance?: {
    gstType?: string;
    panRequired?: boolean;
    passportRequired?: boolean;
  };
  cancellation: {
    isRefundable: boolean;
    penalties: Array<{
      from: string; // ISO datetime
      to?: string;
      amount: number;
    }>;
  };
}

export interface PricingResponse {
  tjHotelId: string;
  hotelName: string;
  nationality: string;
  options: PricingOption[];
  reviewHash: string;
  correlationId: string;
  status: { success: boolean; message?: string };
}

export interface ReviewRequest {
  correlationId?: string | undefined;
  hid: string;
  optionId: string;
  reviewHash: string;
  searchId?: string | undefined;
}

export interface ReviewResponse {
  reviewId?: string | undefined;
  bookingId: string;
  tjHotelId: string;
  hotelName: string;
  option: PricingOption;
  correlationId: string;
  onholdAllowed?: string | undefined;
  priceChanged?: boolean | undefined;
  status: { success: boolean; message?: string };
}

export interface TravellerInfo {
  title: string; // MR, MRS, MS, etc.
  fName: string;
  lName: string;
  type: string; // ADULT, CHILD
}

export interface ContactInfo {
  email: string;
  phone: string;
  code?: string | undefined; // country code
}

export interface PaymentInfo {
  method: string; // WALLET, CREDIT_CARD, etc.
}

export interface BookRequest {
  reviewId: string;
  travellerInfo: TravellerInfo[];
  contactInfo: ContactInfo;
  paymentInfo: PaymentInfo;
}

export interface BookResponse {
  bookingId: string;
  pnr: string;
  bookingRef?: string;
  status: string; // CONFIRMED, CANCELLED, etc.
  statusObj?: { success: boolean; message?: string };
}

export interface BookingDetailRequest {
  bookingId: string;
}

export interface BookingDetailResponse {
  booking: {
    status: string;
    voucherUrl?: string | undefined;
    travellers: TravellerInfo[];
    itinerary: {
      hotelName: string;
      checkInDate?: string | undefined;
      checkOutDate?: string | undefined;
    };
  };
  status: { success: boolean; message?: string };
}

export interface CancelRequest {
  bookingId: string;
  remark: string;
}

export interface CancelResponse {
  cancellationId: string;
  refundAmount: number;
  status: string;
  statusObj?: { success: boolean; message?: string };
}

export interface StaticDetailRequest {
  hid: string; // hotel ID (path param)
}

export interface StaticDetailResponse {
  hotelDetail: {
    name: string;
    address: string;
    amenities: string[];
    images: string[];
  };
  status?: { success: boolean; message?: string | undefined } | undefined;
}

export interface CitiesRequest {
  cityName: string;
}

export interface City {
  cityCode: string;
  cityName: string;
  country: string;
}

export interface CitiesResponse {
  cities: City[];
  status: { success: boolean; message?: string };
}

export interface CityRegionItem {
  cityName: string;
  cityRegionId: number;
  regionName: string;
  countryName: string;
  regionType: string;
  fullRegionName: string;
}

export interface CityRegionResponse {
  hotelCityRegionIds: CityRegionItem[];
  nextCursor?: string | undefined;
  status: { success: boolean; message?: string };
}

export interface NationalitiesResponse {
  nationalities: Array<{
    countryId: string;
    name: string;
  }>;
  status: { success: boolean; message?: string };
}

export interface BalanceResponse {
  balance: number;
  creditLimit: number;
  currency: string;
  status: { success: boolean; message?: string };
}

export interface HotelMappingRequest {
  countryName?: string | undefined;
  regionIds?: string[] | undefined;
  page: number;
  size: number;
}

export interface HotelMappingItem {
  tjHotelId: string;
  unicaId: string;
}

export interface HotelMappingResponse {
  hotels: HotelMappingItem[];
  pageable: {
    pageNumber: number;
    pageSize: number;
    offset: number;
    totalElements: number;
    totalPages: number;
    size: number;
  };
  status: { success: boolean; message?: string };
}

export interface HotelContentRequest {
  hotelIds: string[];
}

export interface HotelContentItem {
  tjHotelId: string;
  unicaId: string;
  name: string;
  is_active?: boolean | undefined;
  star_rating?: string | undefined;
  property_type?: { id: string; name: string } | undefined;
  locale?: {
    address?: {
      fulladdr?: string | undefined;
      line_1?: string | undefined;
      line_2?: string | undefined;
      city?: string | undefined;
      statename?: string | undefined;
      countryname?: string | undefined;
      postal_code?: string | undefined;
    } | undefined;
  } | undefined;
}

export interface HotelContentResponse {
  hotels: HotelContentItem[];
  status: { success: boolean; message?: string };
}

export interface HotelCountriesResponse {
  hotelCountries: string[];
  status: { success: boolean; message?: string };
}

export type HotelMappingSyncType = 'NEW' | 'UPDATE';
export type DeletedHotelMappingSyncType = 'DELETE';

export interface HotelMappingSyncRequest {
  type: HotelMappingSyncType;
  lastUpdateTime: string;
  cursor?: string | undefined;
  page?: number | undefined;
}

export interface DeletedHotelMappingSyncRequest {
  type: DeletedHotelMappingSyncType;
  lastUpdateTime: string;
  cursor?: string | undefined;
  page?: number | undefined;
}

export interface HotelMappingSyncItem {
  tjHotelId: string;
}

export interface HotelMappingSyncResponse {
  hotels: HotelMappingSyncItem[];
  pageable: {
    pageNumber: number;
    pageSize: number;
    totalElements: number;
    totalPages: number;
  };
  nextCursor?: string | undefined;
  status: { success: boolean; message?: string };
}

// ─── Service Interface ──────────────────────────────────────────────────────

/**
 * IHotelService: contract for hotel booking operations
 * Implementations must handle v3.0 API shapes and error conditions
 */
export interface IHotelService {
  /**
   * Search hotels by date and hotel IDs
   * TripJack upstream: POST /hms/v3/hotel/listing
   */
  search(req: SearchRequest): Promise<SearchResponse>;

  /**
   * Get pricing options for a specific hotel
   * TripJack upstream: POST /hms/v3/hotel/pricing
   */
  pricing(req: PricingRequest): Promise<PricingResponse>;

  /**
   * Review (re-validate) a selected pricing option
   * TripJack upstream: POST /hms/v3/hotel/review
   */
  review(req: ReviewRequest): Promise<ReviewResponse>;

  /**
   * Book a hotel with traveller details
   * TripJack upstream: POST /hms/v3/hotel/book
   * Note: bookingId is generated by route layer, not by service
   */
  book(req: BookRequest, bookingId: string): Promise<BookResponse>;

  /**
   * Get details of a confirmed booking
   * TripJack upstream: POST /oms/v3/hotel/booking-details
   */
  bookingDetail(req: BookingDetailRequest): Promise<BookingDetailResponse>;

  /**
   * Cancel an existing booking
   * TripJack upstream: POST /oms/v3/hotel/cancel-booking
   */
  cancel(req: CancelRequest): Promise<CancelResponse>;

  /**
   * Get static details of a specific hotel
   * TripJack upstream: GET /hms/v3/hotel/static-detail?hid={hid}
   */
  staticDetail(req: StaticDetailRequest): Promise<StaticDetailResponse>;

  /**
   * Search for cities
   * TripJack upstream: POST /hms/v3/hotel/static-cities
   */
  cities(req: CitiesRequest): Promise<CitiesResponse>;

  /**
   * Fetch paginated city region IDs
   * TripJack upstream: GET /hms/v3/content/fetch-city-regionIds
   */
  cityRegionIds(limit: number, cursor?: string): Promise<CityRegionResponse>;

  /**
   * Get list of nationalities
   * TripJack upstream: GET /hms/v3/hotel/nationalities
   */
  nationalities(): Promise<NationalitiesResponse>;

  /**
   * Get account balance and credit limit
   * TripJack upstream: GET /hms/v3/account/balance
   */
  accountBalance(): Promise<BalanceResponse>;

  /**
   * Fetch country names for hotel mapping lookups
   * TripJack upstream: GET /hms/v3/content/fetch-countries
   */
  hotelCountries(): Promise<HotelCountriesResponse>;

  /**
   * Fetch hotel mapping by country name or region IDs
   * TripJack upstream: POST /hms/v3/content/fetch-hotel-mapping
   */
  hotelMapping(req: HotelMappingRequest): Promise<HotelMappingResponse>;

  /**
   * Fetch hotel static content by TripJack hotel IDs
   * TripJack upstream: POST /hms/v3/content/fetch-hotel-content
   */
  hotelContent(req: HotelContentRequest): Promise<HotelContentResponse>;

  /**
   * Fetch newly created or updated hotel mappings after a timestamp
   * TripJack upstream: POST /hms/v3/content/fetch-hotel-mapping-sync
   */
  hotelMappingSync(req: HotelMappingSyncRequest): Promise<HotelMappingSyncResponse>;

  /**
   * Fetch deleted hotel mappings after a timestamp
   * TripJack upstream: POST /hms/v3/content/fetch-deleted-hotel-mapping
   */
  deletedHotelMappingSync(req: DeletedHotelMappingSyncRequest): Promise<HotelMappingSyncResponse>;
}
