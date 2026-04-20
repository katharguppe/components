/**
 * TripJack Hotel API Schemas (v3.0)
 * Zod validation schemas for all request bodies
 * Used by routes for safeParse() validation before service calls
 */

import { z } from 'zod';

// ─── Base Types ─────────────────────────────────────────────────────────────

const roomSchema = z.object({
  adults: z.number().int().min(1, 'At least 1 adult required'),
  children: z.number().int().min(0).optional(),
  childAge: z.array(z.number().int()).optional(),
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
  hids: z.array(z.string().min(1), { message: 'At least one hotel ID required' }),
  rooms: z.array(roomSchema, { message: 'At least one room required' }),
  currency: z.string().length(3, 'Currency must be 3 characters (e.g., INR, USD)'),
  nationality: z.string().optional(),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const pricingRequestSchema = z.object({
  searchId: z.string().min(1, 'searchId required'),
  tjHotelId: z.string().min(1, 'tjHotelId required'),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'checkIn must be YYYY-MM-DD'),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'checkOut must be YYYY-MM-DD'),
  rooms: z.array(roomSchema, { message: 'At least one room required' }),
  currency: z.string().length(3, 'Currency must be 3 characters'),
});

export type PricingRequest = z.infer<typeof pricingRequestSchema>;

export const reviewRequestSchema = z.object({
  searchId: z.string().min(1, 'searchId required'),
  optionId: z.string().min(1, 'optionId required'),
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
  allSchemas,
};
