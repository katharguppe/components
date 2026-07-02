/**
 * TripJack Flight Service Interface
 * Contract for Flight API flows documented in TripJack Air API references.
 */

export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
export type PaxType = 'ADULT' | 'CHILD' | 'INFANT';
export type BookingStatus = 'SUCCESS' | 'ON_HOLD' | 'PENDING' | 'CANCELLED' | 'FAILED' | 'ABORTED' | 'UNCONFIRMED';

export interface FlightStatus {
  success: boolean;
  message?: string | undefined;
  httpStatus?: number | undefined;
}

export interface PaxInfo {
  ADULT: number;
  CHILD?: number | undefined;
  INFANT?: number | undefined;
}

export interface RouteInfo {
  fromCityOrAirport: string;
  toCityOrAirport: string;
  travelDate: string;
}

export interface SearchModifiers {
  isDirectFlight?: boolean | undefined;
  isConnectingFlight?: boolean | undefined;
  pft?: 'REGULAR' | 'STUDENT' | 'SENIOR_CITIZEN' | undefined;
}

export interface FlightSearchRequest {
  cabinClass: CabinClass;
  paxInfo: PaxInfo;
  routeInfos: RouteInfo[];
  preferredAirlines?: string[] | undefined;
  searchModifiers?: SearchModifiers | undefined;
  filters?: FlightSearchFilters | undefined;
}

export type TimeRange = '00-06' | '06-12' | '12-18' | '18-24';
export type FareTypeFilter = 'REFUNDABLE' | 'NON_REFUNDABLE';
export type StopFilter = 'DIRECT' | 'CONNECTING';

export interface FlightSearchFilters {
  arrivalTimeRanges?: TimeRange[] | undefined;
  departureTimeRanges?: TimeRange[] | undefined;
  showCheckInBaggage?: boolean | undefined;
  handBaggageOnly?: boolean | undefined;
  fareIdentifiers?: string[] | undefined;
  flightNumbers?: string[] | undefined;
  airlines?: string[] | undefined;
  fareTypes?: FareTypeFilter[] | undefined;
  refundable?: boolean | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  departureTerminals?: string[] | undefined;
  arrivalTerminals?: string[] | undefined;
  departureAirports?: string[] | undefined;
  arrivalAirports?: string[] | undefined;
  layoverAirports?: string[] | undefined;
  minDurationMinutes?: number | undefined;
  maxDurationMinutes?: number | undefined;
  minLayoverMinutes?: number | undefined;
  maxLayoverMinutes?: number | undefined;
  stops?: StopFilter[] | undefined;
}

export interface FlightSegment {
  id: string;
  from: string;
  to: string;
  fromAirportName?: string | undefined;
  toAirportName?: string | undefined;
  departureTerminal?: string | undefined;
  arrivalTerminal?: string | undefined;
  departureTime: string;
  arrivalTime: string;
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  durationMinutes: number;
  ssrInfo?: {
    baggage?: SsrOption[] | undefined;
    meals?: SsrOption[] | undefined;
    seats?: SsrOption[] | undefined;
  } | undefined;
}

export interface FlightOption {
  priceId: string;
  totalFare: number;
  currency: string;
  refundable: boolean;
  fareIdentifier?: string | undefined;
  checkInBaggage?: boolean | undefined;
  handBaggageOnly?: boolean | undefined;
  segments: FlightSegment[];
}

export interface FlightSearchResponse {
  searchId: string;
  tripInfos: Record<string, FlightOption[]>;
  status: FlightStatus;
}

export interface ReviewRequest {
  priceIds: string[];
}

export interface ReviewConditions {
  st: number;
  isBA: boolean;
  isa: boolean;
  iecr: boolean;
  igm: boolean;
  dobe: boolean;
}

export interface ReviewTripInfo {
  id: string;
  priceId: string;
  conditions: ReviewConditions;
  totalPriceInfo: {
    fd: {
      fC: {
        TF: number;
      };
    };
  };
  segments: FlightSegment[];
}

export interface ReviewResponse {
  bookingId: string;
  tripInfos: ReviewTripInfo[];
  alerts: Array<{ type: string; message: string }>;
  status: FlightStatus;
}

export interface FareRuleRequest {
  priceIds?: string[] | undefined;
  id?: string | undefined;
  flowType?: 'SEARCH' | 'REVIEW' | 'BOOKING_DETAIL' | undefined;
  version?: 'v1' | 'v2' | undefined;
}

export interface FareRuleResponse {
  rules: Array<{
    priceId: string;
    cancellation: string;
    dateChange: string;
  }>;
  status: FlightStatus;
}

export interface SeatMapRequest {
  priceIds?: string[] | undefined;
  bookingId?: string | undefined;
  oldBookingId?: string | undefined;
}

export interface SsrOption {
  key: string;
  code: string;
  amount?: number | undefined;
  desc?: string | undefined;
}

export interface SeatMapResponse {
  seats: SsrOption[];
  meals: SsrOption[];
  baggage: SsrOption[];
  status: FlightStatus;
}

export interface DeliveryInfo {
  emails: string[];
  contacts: string[];
}

export interface EmergencyContactInfo {
  emails: string[];
  contacts: string[];
  ecn: string;
}

export interface GstInfo {
  gstNumber: string;
  registeredName: string;
  email: string;
  mobile: string;
  address: string;
}

export interface TravellerInfo {
  ti: string;
  pt: PaxType;
  fN: string;
  lN: string;
  email?: string | undefined;
  mobile?: string | undefined;
  dob?: string | undefined;
  pan?: string | undefined;
  pNum?: string | undefined;
  eD?: string | undefined;
  pNat?: string | undefined;
  pid?: string | undefined;
  ssrBaggageInfos?: SsrOption[] | undefined;
  ssrMealInfos?: SsrOption[] | undefined;
  ssrSeatInfos?: SsrOption[] | undefined;
  ssrExtraServiceInfos?: SsrOption[] | undefined;
}

export interface BookRequest {
  bookingId: string;
  amount?: number | undefined;
  hold?: boolean | undefined;
  deliveryInfo: DeliveryInfo;
  contactInfo?: EmergencyContactInfo | undefined;
  travellerInfo: TravellerInfo[];
  gstInfo?: GstInfo | undefined;
}

export interface BookResponse {
  bookingId: string;
  status: BookingStatus;
  pnr?: string | undefined;
  ticketNumbers?: string[] | undefined;
  statusObj?: FlightStatus | undefined;
}

export interface FareValidateRequest {
  bookingId: string;
}

export interface FareValidateResponse {
  bookingId: string;
  amount: number;
  status: FlightStatus;
}

export interface ConfirmBookRequest {
  bookingId: string;
  amount: number;
}

export interface ConfirmBookResponse {
  bookingId: string;
  status: BookingStatus;
  statusObj?: FlightStatus | undefined;
}

export interface BookingDetailsRequest {
  bookingId: string;
  requirePaxPricing?: boolean | undefined;
}

export interface BookingDetailsResponse {
  booking: {
    bookingId: string;
    status: BookingStatus;
    pnr?: string | undefined;
    ticketNumbers?: string[] | undefined;
    travellerInfo: TravellerInfo[];
    tripInfos: ReviewTripInfo[];
  };
  status: FlightStatus;
}

export interface UnholdRequest {
  bookingId: string;
}

export interface UnholdResponse {
  bookingId: string;
  status: BookingStatus;
  statusObj?: FlightStatus | undefined;
}

export interface AmendmentChargesRequest {
  bookingId: string;
  type?: 'CANCELLATION' | 'FULL_REFUND' | 'VOIDED' | undefined;
  remarks?: string | undefined;
  trips?: unknown[] | undefined;
  travellers?: unknown[] | undefined;
  label?: string | undefined;
}

export interface AmendmentChargesResponse {
  bookingId: string;
  refundAmount: number;
  penaltyAmount: number;
  status: FlightStatus;
}

export interface SubmitAmendmentRequest {
  bookingId: string;
  type?: 'CANCELLATION' | 'FULL_REFUND' | 'VOIDED' | undefined;
  remarks?: string | undefined;
  trips?: unknown[] | undefined;
  travellers?: unknown[] | undefined;
  label?: string | undefined;
}

export interface SubmitAmendmentResponse {
  amendmentId: string;
  status: FlightStatus;
}

export interface AmendmentDetailsRequest {
  amendmentId: string;
}

export interface AmendmentDetailsResponse {
  amendmentId: string;
  amendmentStatus: 'REQUESTED' | 'REJECTED' | 'SUCCESS' | 'PENDING';
  refundAmount?: number | undefined;
  status: FlightStatus;
}

export interface UserBalanceResponse {
  balance: number;
  creditLimit: number;
  currency: string;
  status: FlightStatus;
}

export interface GenericFlightResponse {
  data: unknown;
  status: FlightStatus;
}

export interface FlightDetailsRequest {
  priceIds: string[];
}

export interface FlightDetailsResponse {
  bookingId: string;
  flightDetails: unknown[];
  fareDetails: unknown[];
  fareRules: FareRuleResponse;
  baggageInformation: unknown[];
  seatMap?: SeatMapResponse | undefined;
  review: ReviewResponse;
  status: FlightStatus;
}

export interface ReissueSearchQueryRequest {
  paxInfo: PaxInfo;
  routeInfos: RouteInfo[];
  oldBookingId: string;
  pnr: string;
  paxIds: string[];
}

export interface ReissuePollRequest {
  requestId: string;
}

export interface ReissueReviewRequest {
  priceIds: string[];
  oldBookingId: string;
  priceValidation?: boolean | undefined;
}

export interface ReissueBookRequest {
  bookingId: string;
  oldBookingId: string;
  paymentInfos: Array<{ bookingId?: string | undefined; amount: number }>;
  travellerInfo: TravellerInfo[];
  deliveryInfo: DeliveryInfo;
  gstInfo?: GstInfo | undefined;
}

export interface AncillaryFetchRequest {
  bookingId: string;
}

export interface AddSsrRequest {
  bookingId: string;
  paymentInfos: Array<{ amount: number }>;
  sI: unknown[];
}

export interface IFlightService {
  search(req: FlightSearchRequest): Promise<FlightSearchResponse>;
  review(req: ReviewRequest): Promise<ReviewResponse>;
  flightDetails(req: FlightDetailsRequest): Promise<FlightDetailsResponse>;
  fareRule(req: FareRuleRequest): Promise<FareRuleResponse>;
  seatMap(req: SeatMapRequest): Promise<SeatMapResponse>;
  fareValidateBook(req: FareValidateRequest): Promise<FareValidateResponse>;
  book(req: BookRequest): Promise<BookResponse>;
  fareValidate(req: FareValidateRequest): Promise<FareValidateResponse>;
  confirmBook(req: ConfirmBookRequest): Promise<ConfirmBookResponse>;
  bookingDetails(req: BookingDetailsRequest): Promise<BookingDetailsResponse>;
  unhold(req: UnholdRequest): Promise<UnholdResponse>;
  amendmentCharges(req: AmendmentChargesRequest): Promise<AmendmentChargesResponse>;
  submitAmendment(req: SubmitAmendmentRequest): Promise<SubmitAmendmentResponse>;
  amendmentDetails(req: AmendmentDetailsRequest): Promise<AmendmentDetailsResponse>;
  userBalance(): Promise<UserBalanceResponse>;
  reissueSearchQueryList(req: ReissueSearchQueryRequest): Promise<GenericFlightResponse>;
  reissueSearch(req: ReissuePollRequest): Promise<GenericFlightResponse>;
  reissueReview(req: ReissueReviewRequest): Promise<GenericFlightResponse>;
  reissueBook(req: ReissueBookRequest): Promise<GenericFlightResponse>;
  fetchAncillarySeat(req: AncillaryFetchRequest): Promise<GenericFlightResponse>;
  fetchAncillarySsr(req: AncillaryFetchRequest): Promise<GenericFlightResponse>;
  addAncillarySsr(req: AddSsrRequest): Promise<GenericFlightResponse>;
}
