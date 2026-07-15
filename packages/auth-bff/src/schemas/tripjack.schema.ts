/**
 * TripJack Hotel API Schemas (v3.0)
 * Zod validation schemas for all request bodies
 * Used by routes for safeParse() validation before service calls
 */

import { z } from 'zod';

// ─── Base Types ─────────────────────────────────────────────────────────────

const roomSchema = z.object({
  adults: z.number().int().min(1, 'At least 1 adult required'),
  children: z.number().int().min(0).max(6).optional(),
  childAge: z.array(z.number().int().min(0)).optional(),
}).superRefine((room, ctx) => {
  const children = room.children ?? 0;
  const childAgeCount = room.childAge?.length ?? 0;

  if (children > 0 && childAgeCount !== children) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'childAge is required and must contain one age per child when children > 0',
      path: ['childAge'],
    });
  }
});

const travellerInfoSchema = z.object({
  title: z.string().min(1, 'Title required'),
  fName: z.string().min(1, 'First name required'),
  lName: z.string().min(1, 'Last name required'),
  type: z.enum(['ADULT', 'CHILD'], { message: 'Type must be ADULT or CHILD' }),
});

const contactInfoSchema = z.object({
  email: z.string().email('Invalid email'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  code: z.string().optional(),
});

const paymentInfoSchema = z.object({
  method: z.string().min(1, 'Payment method required'),
});

// ─── Request Schemas ────────────────────────────────────────────────────────

export const searchRequestSchema = z.object({
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'checkIn must be YYYY-MM-DD'),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'checkOut must be YYYY-MM-DD'),
  hids: z.array(z.number().int().positive(), { message: 'At least one hotel ID required' }).max(100, 'Max 100 hotel IDs allowed'),
  rooms: z.array(roomSchema, { message: 'At least one room required' }).min(1).max(9),
  currency: z.string().length(3, 'Currency must be 3 characters (e.g., INR, USD)'),
  nationality: z.string().min(1, 'nationality required'),
  correlationId: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  const checkIn = new Date(`${value.checkIn}T00:00:00Z`);
  const checkOut = new Date(`${value.checkOut}T00:00:00Z`);

  if (!(checkOut > checkIn)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'checkOut must be after checkIn',
      path: ['checkOut'],
    });
  }
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const pricingRequestSchema = z.object({
  correlationId: z.string().min(1).optional(),
  hid: z.string().min(1, 'hid required'),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'checkIn must be YYYY-MM-DD'),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'checkOut must be YYYY-MM-DD'),
  rooms: z.array(roomSchema, { message: 'At least one room required' }),
  currency: z.string().length(3, 'Currency must be 3 characters'),
  nationality: z.string().min(1, 'nationality required'),
  timeoutMs: z.number().int().positive().optional(),
});

export type PricingRequest = z.infer<typeof pricingRequestSchema>;

export const reviewRequestSchema = z.object({
  correlationId: z.string().min(1).optional(),
  hid: z.string().min(1, 'hid required'),
  optionId: z.string().min(1, 'optionId required'),
  reviewHash: z.string().min(1, 'reviewHash required'),
  searchId: z.string().min(1).optional(),
});

export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

export const bookRequestSchema = z.object({
  reviewId: z.string().min(1, 'reviewId required'),
  travellerInfo: z.array(travellerInfoSchema, { message: 'At least one traveller required' }),
  contactInfo: contactInfoSchema,
  paymentInfo: paymentInfoSchema,
});

export type BookRequest = z.infer<typeof bookRequestSchema>;

export const bookingDetailRequestSchema = z.object({
  bookingId: z.string().min(1, 'bookingId required'),
});

export type BookingDetailRequest = z.infer<typeof bookingDetailRequestSchema>;

export const cancelRequestSchema = z.object({
  bookingId: z.string().min(1, 'bookingId required'),
  remark: z.string().min(1, 'Cancellation remark required'),
});

export type CancelRequest = z.infer<typeof cancelRequestSchema>;

export const staticDetailRequestSchema = z.object({
  hid: z.string().min(1, 'Hotel ID required'),
});

export type StaticDetailRequest = z.infer<typeof staticDetailRequestSchema>;

export const citiesRequestSchema = z.object({
  cityName: z.string().min(1, 'City name required'),
});

export type CitiesRequest = z.infer<typeof citiesRequestSchema>;

export const hotelMappingRequestSchema = z.object({
  countryName: z.string().optional(),
  regionIds: z.array(z.string().min(1)).optional(),
  page: z.number().int().min(0),
  size: z.number().int().min(1).max(2000),
}).refine((value) => Boolean(value.countryName || value.regionIds?.length), {
  message: 'countryName or regionIds is required',
});

export type HotelMappingRequest = z.infer<typeof hotelMappingRequestSchema>;

export const hotelContentRequestSchema = z.object({
  hotelIds: z.array(z.string().min(1)).min(1).max(100),
});

export type HotelContentRequest = z.infer<typeof hotelContentRequestSchema>;

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const hotelMappingSyncRequestSchema = z.object({
  type: z.enum(['NEW', 'UPDATE']),
  lastUpdateTime: isoDateTimeSchema,
  cursor: z.string().min(1).optional(),
  page: z.number().int().min(0).optional(),
});

export type HotelMappingSyncRequest = z.infer<typeof hotelMappingSyncRequestSchema>;

export const deletedHotelMappingSyncRequestSchema = z.object({
  type: z.literal('DELETE'),
  lastUpdateTime: isoDateTimeSchema,
  cursor: z.string().min(1).optional(),
  page: z.number().int().min(0).optional(),
});

export type DeletedHotelMappingSyncRequest = z.infer<typeof deletedHotelMappingSyncRequestSchema>;

// ─── Combined Schemas ──────────────────────────────────────────────────────

/**
 * All request schemas keyed by endpoint name
 * Use for route validation: const result = allSchemas.<endpoint>.safeParse(body)
 */
export const allSchemas = {
  search: searchRequestSchema,
  pricing: pricingRequestSchema,
  review: reviewRequestSchema,
  book: bookRequestSchema,
  bookingDetail: bookingDetailRequestSchema,
  cancel: cancelRequestSchema,
  staticDetail: staticDetailRequestSchema,
  cities: citiesRequestSchema,
  hotelMapping: hotelMappingRequestSchema,
  hotelContent: hotelContentRequestSchema,
  hotelMappingSync: hotelMappingSyncRequestSchema,
  deletedHotelMappingSync: deletedHotelMappingSyncRequestSchema,
};

export default {
  searchRequestSchema,
  pricingRequestSchema,
  reviewRequestSchema,
  bookRequestSchema,
  bookingDetailRequestSchema,
  cancelRequestSchema,
  staticDetailRequestSchema,
  citiesRequestSchema,
  hotelMappingRequestSchema,
  hotelContentRequestSchema,
  hotelMappingSyncRequestSchema,
  deletedHotelMappingSyncRequestSchema,
  allSchemas,
};
