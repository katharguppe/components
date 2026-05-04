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
});

export const priceIdsRequestSchema = z.object({
  priceIds: z.array(z.string().min(1)).min(1).max(6),
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
  remarks: z.string().min(1),
  trips: z.array(z.unknown()).optional(),
  travellers: z.array(z.unknown()).optional(),
});

export const amendmentDetailsRequestSchema = z.object({
  amendmentId: z.string().min(1),
});

export type FlightSearchRequest = z.infer<typeof flightSearchRequestSchema>;
export type PriceIdsRequest = z.infer<typeof priceIdsRequestSchema>;
export type FlightBookRequest = z.infer<typeof flightBookRequestSchema>;
export type BookingIdRequest = z.infer<typeof bookingIdRequestSchema>;
export type ConfirmBookRequest = z.infer<typeof confirmBookRequestSchema>;
export type BookingDetailsRequest = z.infer<typeof bookingDetailsRequestSchema>;
export type AmendmentRequest = z.infer<typeof amendmentRequestSchema>;
export type AmendmentDetailsRequest = z.infer<typeof amendmentDetailsRequestSchema>;
