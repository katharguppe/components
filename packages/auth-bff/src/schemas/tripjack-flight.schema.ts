/**
 * TripJack Flight API Zod Schemas
 */

import { z } from 'zod';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const paxInfoSchema = z.object({
  ADULT: z.number().int().min(1, 'At least one adult is required'),
  CHILD: z.number().int().min(0).optional(),
  INFANT: z.number().int().min(0).optional(),
});

const routeInfoSchema = z.object({
  fromCityOrAirport: z.string().length(3, 'Origin must be a 3-letter IATA code'),
  toCityOrAirport: z.string().length(3, 'Destination must be a 3-letter IATA code'),
  travelDate: dateSchema,
});

const timeRangeSchema = z.enum(['00-06', '06-12', '12-18', '18-24']);

const filterTextSchema = z.string().trim().min(1).max(80);

const flightSearchFiltersSchema = z.object({
  arrivalTimeRanges: z.array(timeRangeSchema).max(4).optional(),
  departureTimeRanges: z.array(timeRangeSchema).max(4).optional(),
  showCheckInBaggage: z.boolean().optional(),
  handBaggageOnly: z.boolean().optional(),
  fareIdentifiers: z.array(filterTextSchema).max(25).optional(),
  flightNumbers: z.array(filterTextSchema).max(25).optional(),
  airlines: z.array(filterTextSchema).max(25).optional(),
  fareTypes: z.array(z.enum(['REFUNDABLE', 'NON_REFUNDABLE'])).max(2).optional(),
  refundable: z.boolean().optional(),
  departureTerminals: z.array(filterTextSchema).max(25).optional(),
  arrivalTerminals: z.array(filterTextSchema).max(25).optional(),
  departureAirports: z.array(filterTextSchema).max(25).optional(),
  arrivalAirports: z.array(filterTextSchema).max(25).optional(),
  layoverAirports: z.array(filterTextSchema).max(25).optional(),
  minDurationMinutes: z.number().int().min(0).optional(),
  maxDurationMinutes: z.number().int().min(0).optional(),
  minLayoverMinutes: z.number().int().min(0).optional(),
  maxLayoverMinutes: z.number().int().min(0).optional(),
  stops: z.array(z.enum(['DIRECT', 'CONNECTING'])).max(2).optional(),
}).optional();

export const flightSearchRequestSchema = z.object({
  cabinClass: z.enum(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']).default('ECONOMY'),
  paxInfo: paxInfoSchema,
  routeInfos: z.array(routeInfoSchema).min(1).max(6),
  preferredAirlines: z.array(z.string().length(2)).max(10).optional(),
  searchModifiers: z.object({
    isDirectFlight: z.boolean().optional(),
    isConnectingFlight: z.boolean().optional(),
    pft: z.enum(['REGULAR', 'STUDENT', 'SENIOR_CITIZEN']).optional(),
  }).optional(),
  filters: flightSearchFiltersSchema,
});

export const priceIdsRequestSchema = z.object({
  priceIds: z.array(z.string().min(1)).min(1).max(6),
});

export const fareRuleRequestSchema = z.object({
  priceIds: z.array(z.string().min(1)).min(1).max(6).optional(),
  id: z.string().min(1).optional(),
  flowType: z.enum(['SEARCH', 'REVIEW', 'BOOKING_DETAIL']).optional(),
  version: z.enum(['v1', 'v2']).default('v2'),
}).superRefine((value, ctx) => {
  if (!value.priceIds?.length && !value.id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['id'],
      message: 'id or priceIds is required',
    });
  }
});

export const seatMapRequestSchema = z.object({
  priceIds: z.array(z.string().min(1)).min(1).max(6).optional(),
  bookingId: z.string().min(1).optional(),
  oldBookingId: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (!value.priceIds?.length && !value.bookingId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['priceIds'],
      message: 'priceIds or bookingId is required',
    });
  }
});

const deliveryInfoSchema = z.object({
  emails: z.array(z.string().email()).min(1),
  contacts: z.array(z.string().min(8)).min(1),
});

const emergencyContactInfoSchema = z.object({
  emails: z.array(z.string().email()).min(1),
  contacts: z.array(z.string().min(8)).min(1),
  ecn: z.string().min(1),
});

const gstInfoSchema = z.object({
  gstNumber: z.string().min(5),
  registeredName: z.string().min(1),
  email: z.string().email(),
  mobile: z.string().min(8),
  address: z.string().min(1),
});

const ssrInfoSchema = z.object({
  key: z.string().min(1),
  code: z.string().min(1),
  amount: z.number().optional(),
  desc: z.string().optional(),
});

const travellerInfoSchema = z.object({
  ti: z.string().min(1),
  pt: z.enum(['ADULT', 'CHILD', 'INFANT']),
  fN: z.string().min(1),
  lN: z.string().min(1),
  dob: dateSchema.optional(),
  pNum: z.string().optional(),
  eD: dateSchema.optional(),
  pNat: z.string().length(2).optional(),
  pid: dateSchema.optional(),
  ssrBaggageInfos: z.array(ssrInfoSchema).optional(),
  ssrMealInfos: z.array(ssrInfoSchema).optional(),
  ssrSeatInfos: z.array(ssrInfoSchema).optional(),
});

export const flightBookRequestSchema = z.object({
  bookingId: z.string().min(1),
  amount: z.number().positive().optional(),
  hold: z.boolean().optional(),
  deliveryInfo: deliveryInfoSchema,
  contactInfo: emergencyContactInfoSchema.optional(),
  travellerInfo: z.array(travellerInfoSchema).min(1),
  gstInfo: gstInfoSchema.optional(),
}).superRefine((value, ctx) => {
  if (!value.hold && value.amount === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['amount'],
      message: 'amount is required for instant booking',
    });
  }
});

export const bookingIdRequestSchema = z.object({
  bookingId: z.string().min(1),
});

export const confirmBookRequestSchema = z.object({
  bookingId: z.string().min(1),
  amount: z.number().positive(),
});

export const bookingDetailsRequestSchema = z.object({
  bookingId: z.string().min(1),
  requirePaxPricing: z.boolean().optional(),
});

export const amendmentRequestSchema = z.object({
  bookingId: z.string().min(1),
  type: z.enum(['CANCELLATION', 'FULL_REFUND', 'VOIDED']).default('CANCELLATION'),
  remarks: z.string().min(1).optional(),
  trips: z.array(z.unknown()).optional(),
  travellers: z.array(z.unknown()).optional(),
  label: z.string().min(1).optional(),
});

export const amendmentDetailsRequestSchema = z.object({
  amendmentId: z.string().min(1),
});

export const reissueSearchQueryRequestSchema = z.object({
  paxInfo: paxInfoSchema,
  routeInfos: z.array(routeInfoSchema).min(1).max(6),
  oldBookingId: z.string().min(1),
  pnr: z.string().min(1),
  paxIds: z.array(z.string().min(1)).min(1),
});

export const reissuePollRequestSchema = z.object({
  requestId: z.string().min(1),
});

export const reissueReviewRequestSchema = z.object({
  priceIds: z.array(z.string().min(1)).min(1).max(6),
  oldBookingId: z.string().min(1),
  priceValidation: z.boolean().optional(),
});

export const reissueBookRequestSchema = z.object({
  bookingId: z.string().min(1),
  oldBookingId: z.string().min(1),
  paymentInfos: z.array(z.object({
    bookingId: z.string().min(1).optional(),
    amount: z.number(),
  })).min(1),
  travellerInfo: z.array(travellerInfoSchema).min(1),
  deliveryInfo: deliveryInfoSchema,
  gstInfo: gstInfoSchema.optional(),
});

export const ancillaryFetchRequestSchema = z.object({
  bookingId: z.string().min(1),
});

export const addSsrRequestSchema = z.object({
  bookingId: z.string().min(1),
  paymentInfos: z.array(z.object({ amount: z.number() })).min(1),
  sI: z.array(z.unknown()).min(1),
});

export type FlightSearchRequest = z.infer<typeof flightSearchRequestSchema>;
export type PriceIdsRequest = z.infer<typeof priceIdsRequestSchema>;
export type FareRuleRequest = z.infer<typeof fareRuleRequestSchema>;
export type SeatMapRequest = z.infer<typeof seatMapRequestSchema>;
export type FlightBookRequest = z.infer<typeof flightBookRequestSchema>;
export type BookingIdRequest = z.infer<typeof bookingIdRequestSchema>;
export type ConfirmBookRequest = z.infer<typeof confirmBookRequestSchema>;
export type BookingDetailsRequest = z.infer<typeof bookingDetailsRequestSchema>;
export type AmendmentRequest = z.infer<typeof amendmentRequestSchema>;
export type AmendmentDetailsRequest = z.infer<typeof amendmentDetailsRequestSchema>;
export type ReissueSearchQueryRequest = z.infer<typeof reissueSearchQueryRequestSchema>;
export type ReissuePollRequest = z.infer<typeof reissuePollRequestSchema>;
export type ReissueReviewRequest = z.infer<typeof reissueReviewRequestSchema>;
export type ReissueBookRequest = z.infer<typeof reissueBookRequestSchema>;
export type AncillaryFetchRequest = z.infer<typeof ancillaryFetchRequestSchema>;
export type AddSsrRequest = z.infer<typeof addSsrRequestSchema>;
