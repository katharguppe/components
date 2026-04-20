/**
 * TripJack Hotel Routes (v3.0)
 * 10 endpoints for hotel search, pricing, review, booking, and account operations
 * Middleware: tenantResolver → requireTenant → authenticate → requireRole('admin','operator')
 * Service: injected via factory pattern (stub or production)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { createHotelService } from '../services/tripjack/hotel.service.factory';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { tenantResolver, requireTenant } from '../middleware/tenant.middleware';
import {
  searchRequestSchema,
  pricingRequestSchema,
  reviewRequestSchema,
  bookRequestSchema,
  bookingDetailRequestSchema,
  cancelRequestSchema,
  citiesRequestSchema,
} from '../schemas/tripjack.schema';
import { logAuditEvent } from '../services/audit.service';

// ─── Router Setup ───────────────────────────────────────────────────────────

const router = Router();

// Initialize hotel service at module load time
const hotelService = createHotelService();

// ─── Middleware Stack ───────────────────────────────────────────────────────

// Apply middleware stack in order:
// 1. tenantResolver — resolve X-Tenant-Slug header
// 2. requireTenant — validate tenant context
// 3. authenticate — validate JWT token
// 4. requireRole — check admin/operator roles

router.use(tenantResolver);
router.use(requireTenant);
router.use(authenticate);
router.use(requireRole('admin', 'operator'));

// ─── Helper: Generate bookingId ──────────────────────────────────────────────

function generateBookingId(): string {
  // Format: TJS + 12 random digits
  const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
  return `TJS${digits}`;
}

// ─── Helper: Get tenant schema name ──────────────────────────────────────────

function getTenantSchema(tenant: any): string {
  // tenant.slug assumed to be formatted, e.g., "acme-corp" → "tenant_acme_corp"
  const slug = (tenant.slug || '').replace(/-/g, '_');
  return `tenant_${slug}`;
}

// ─── Route 1: POST /search ──────────────────────────────────────────────────

router.post('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request
    const validation = searchRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validation.error.flatten(),
      });
    }

    // Call hotel service
    const result = await hotelService.search(validation.data);

    if (!result.status.success) {
      return res.status(400).json({
        success: false,
        message: result.status.message || 'Search failed',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        searchId: result.searchId,
        hotels: result.hotels,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── Route 2: POST /pricing ─────────────────────────────────────────────────

router.post('/pricing', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = pricingRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validation.error.flatten(),
      });
    }

    const result = await hotelService.pricing(validation.data);

    if (!result.status.success) {
      return res.status(404).json({
        success: false,
        message: result.status.message || 'Pricing not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        options: result.options,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── Route 3: POST /review ──────────────────────────────────────────────────

router.post('/review', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = reviewRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validation.error.flatten(),
      });
    }

    const result = await hotelService.review(validation.data);

    if (!result.status.success) {
      return res.status(404).json({
        success: false,
        message: result.status.message || 'Review failed',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        reviewId: result.reviewId,
        priceChanged: result.priceChanged,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── Route 4: POST /book ────────────────────────────────────────────────────

router.post('/book', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = bookRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validation.error.flatten(),
      });
    }

    // Generate bookingId in route layer (server-side)
    const bookingId = generateBookingId();

    // Call hotel service with generated bookingId
    const result = await hotelService.book(validation.data, bookingId);

    if (result.status === 'FAILED') {
      return res.status(400).json({
        success: false,
        message: result.statusObj?.message || 'Booking failed',
      });
    }

    // Log audit event for booking mutation
    const tenant = res.locals['tenant'];
    const userId = res.locals['userId'];
    const tenantSchema = getTenantSchema(tenant);

    await logAuditEvent({
      tenantId: tenant.id,
      userId,
      eventType: 'user_updated', // Reusing as "booking_created"
      metadata: {
        action: 'hotel_booking',
        bookingId: result.bookingId,
        pnr: result.pnr,
        travellers: validation.data.travellerInfo.length,
      },
    });

    // Insert booking into tenant-specific table
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "${tenantSchema}".tripjack_bookings (
          booking_id, review_id, pnr, tenant_id, created_by,
          status, checkin_date, checkout_date, currency,
          traveller_info, contact_info, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, CURRENT_DATE, CURRENT_DATE + INTERVAL '2 days', $7,
          $8, $9, NOW(), NOW()
        )
      `,
        [
          result.bookingId,
          validation.data.reviewId,
          result.pnr,
          tenant.id,
          userId, // or mobile_number if available
          result.status,
          'INR',
          JSON.stringify(validation.data.travellerInfo),
          JSON.stringify(validation.data.contactInfo),
        ]
      );
    } catch (dbError) {
      // Log but don't fail the booking response
      console.warn('[TripJackRoutes] DB insert failed:', dbError);
    }

    return res.status(201).json({
      success: true,
      data: {
        bookingId: result.bookingId,
        pnr: result.pnr,
        bookingRef: result.bookingRef,
        status: result.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── Route 5: POST /booking-detail ──────────────────────────────────────────

router.post('/booking-detail', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = bookingDetailRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validation.error.flatten(),
      });
    }

    const result = await hotelService.bookingDetail(validation.data);

    if (!result.status.success) {
      return res.status(404).json({
        success: false,
        message: result.status.message || 'Booking not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: result.booking,
    });
  } catch (error) {
    next(error);
  }
});

// ─── Route 6: POST /cancel ──────────────────────────────────────────────────

router.post('/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = cancelRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validation.error.flatten(),
      });
    }

    const result = await hotelService.cancel(validation.data);

    if (result.status === 'FAILED') {
      const statusCode = result.statusObj?.message?.includes('already') ? 400 : 404;
      return res.status(statusCode).json({
        success: false,
        message: result.statusObj?.message || 'Cancellation failed',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        cancellationId: result.cancellationId,
        refundAmount: result.refundAmount,
        status: result.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── Route 7: GET /static-detail/:hid ────────────────────────────────────────

router.get('/static-detail/:hid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { hid } = req.params;

    if (!hid) {
      return res.status(400).json({
        success: false,
        message: 'Hotel ID required',
      });
    }

    const result = await hotelService.staticDetail({ hid });

    if (!result.status?.success) {
      return res.status(404).json({
        success: false,
        message: result.status?.message || 'Hotel not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: result.hotelDetail,
    });
  } catch (error) {
    next(error);
  }
});

// ─── Route 8: POST /cities ──────────────────────────────────────────────────

router.post('/cities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = citiesRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validation.error.flatten(),
      });
    }

    const result = await hotelService.cities(validation.data);

    return res.status(200).json({
      success: true,
      data: {
        cities: result.cities,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── Route 9: GET /nationalities ────────────────────────────────────────────

router.get('/nationalities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await hotelService.nationalities();

    return res.status(200).json({
      success: true,
      data: {
        nationalities: result.nationalities,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── Route 10: GET /account/balance ──────────────────────────────────────────

router.get('/account/balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await hotelService.accountBalance();

    return res.status(200).json({
      success: true,
      data: {
        balance: result.balance,
        creditLimit: result.creditLimit,
        currency: result.currency,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── Export ──────────────────────────────────────────────────────────────────

export default router;
