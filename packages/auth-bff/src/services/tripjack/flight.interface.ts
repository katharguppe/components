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
}

export interface FlightSegment {
  id: string;
  from: string;
  to: string;
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
  priceIds: string[];
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
  priceIds: string[];
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
  dob?: string | undefined;
  pNum?: string | undefined;
  eD?: string | undefined;
  pNat?: string | undefined;
  pid?: string | undefined;
  ssrBaggageInfos?: SsrOption[] | undefined;
  ssrMealInfos?: SsrOption[] | undefined;
  ssrSeatInfos?: SsrOption[] | undefined;
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
  remarks: string;
  trips?: unknown[] | undefined;
  travellers?: unknown[] | undefined;
}

export interface AmendmentChargesResponse {
  bookingId: string;
  refundAmount: number;
  penaltyAmount: number;
  status: FlightStatus;
}

export interface SubmitAmendmentRequest {
  bookingId: string;
  remarks: string;
  trips?: unknown[] | undefined;
  travellers?: unknown[] | undefined;
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

export interface IFlightService {
  search(req: FlightSearchRequest): Promise<FlightSearchResponse>;
  review(req: ReviewRequest): Promise<ReviewResponse>;
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
}
