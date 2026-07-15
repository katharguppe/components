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
  hotelMappingRequestSchema,
  hotelContentRequestSchema,
  hotelMappingSyncRequestSchema,
  deletedHotelMappingSyncRequestSchema,
} from '../schemas/tripjack.schema';
import { logAuditEvent } from '../services/audit.service';
import {
  syncHotelStaticContentForTenant,
} from '../services/tripjack/hotel.static-sync.service';

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

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

async function tableExists(schemaName: string, tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = ${schemaName}
        AND table_name = ${tableName}
    ) AS exists
  `;

  return rows[0]?.exists ?? false;
}

async function countRows(schemaName: string, tableName: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
    `SELECT COUNT(*)::bigint AS count FROM "${schemaName}".${tableName}`
  );

  const value = rows[0]?.count ?? 0;
  return typeof value === 'bigint' ? Number(value) : Number(value);
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
        searchId: '',
        hotels: [],
        status: { success: false, message: result.status.message || 'Search failed' },
      });
    }

    return res.status(200).json(result);
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
        options: [],
        status: { success: false, message: result.status.message || 'Pricing not found' },
      });
    }

    return res.status(200).json(result);
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
        reviewId: '',
        priceChanged: false,
        status: { success: false, message: result.status.message || 'Review failed' },
      });
    }

    return res.status(200).json(result);
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
        bookingId: '',
        pnr: '',
        status: 'FAILED',
        statusObj: { success: false, message: result.statusObj?.message || 'Booking failed' },
      });
    }

    // Log audit event for booking mutation
    const tenant = req.tenant!;
    const userId = req.user?.sub;
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

    return res.status(201).json(result);
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
        booking: {
          status: 'NOT_FOUND',
          travellers: [],
          itinerary: { hotelName: '' },
        },
        status: { success: false, message: result.status.message || 'Booking not found' },
      });
    }

    return res.status(200).json(result);
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
      return res.status(statusCode).json(result);
    }

    return res.status(200).json(result);
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
        hotelDetail: {
          name: '',
          address: '',
          amenities: [],
          images: [],
        },
        status: { success: false, message: result.status?.message || 'Hotel not found' },
      });
    }

    return res.status(200).json(result);
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

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// ─── Route 9: GET /nationalities ────────────────────────────────────────────

router.get('/nationalities', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await hotelService.nationalities();

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

// ─── Route 10: GET /account/balance ──────────────────────────────────────────

router.get('/content/fetch-countries', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await hotelService.hotelCountries();

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.get('/content/fetch-city-regionIds', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Number(req.query['limit'] ?? 100) || 100, 2000);
    const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
    const result = await hotelService.cityRegionIds(limit, cursor);

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.post('/content/fetch-hotel-mapping', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = hotelMappingRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validation.error.flatten(),
      });
    }

    const payload = {
      page: validation.data.page,
      size: validation.data.size,
      ...(validation.data.countryName ? { countryName: validation.data.countryName } : {}),
      ...(validation.data.regionIds?.length ? { regionIds: validation.data.regionIds } : {}),
    };

    const result = await hotelService.hotelMapping(payload);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/content/fetch-hotel-content', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = hotelContentRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validation.error.flatten(),
      });
    }

    const result = await hotelService.hotelContent(validation.data);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/content/search-hotels', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = req.tenant;
    if (!tenant?.slug) {
      return res.status(400).json({
        hotels: [],
        status: { success: false, message: 'Tenant context required' },
      });
    }

    const query = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';
    const limit = Math.min(Number(req.query['limit'] ?? 10) || 10, 2000);

    if (!query) {
      return res.status(200).json({
        hotels: [],
        status: { success: true, message: 'Query required' },
      });
    }

    const schemaName = getTenantSchema(tenant);
    const pattern = `%${escapeLikePattern(query)}%`;
    const countriesExists = await tableExists(schemaName, 'tripjack_hotel_countries');
    const cityRegionsExists = await tableExists(schemaName, 'tripjack_city_region_ids');
    const mappingsExists = await tableExists(schemaName, 'tripjack_hotel_mappings');
    const staticExists = await tableExists(schemaName, 'tripjack_hotel_static_content');

    const debug = {
      tables: {
        tripjack_hotel_countries: countriesExists ? await countRows(schemaName, 'tripjack_hotel_countries') : null,
        tripjack_city_region_ids: cityRegionsExists ? await countRows(schemaName, 'tripjack_city_region_ids') : null,
        tripjack_hotel_mappings: mappingsExists ? await countRows(schemaName, 'tripjack_hotel_mappings') : null,
        tripjack_hotel_static_content: staticExists ? await countRows(schemaName, 'tripjack_hotel_static_content') : null,
      },
    };

    if (!staticExists) {
      return res.status(200).json({
        hotels: [],
        debug,
        status: { success: true, message: 'Hotel static content not synced yet' },
      });
    }

    const hotels = await prisma.$queryRaw<Array<{
      tjHotelId: string;
      name: string;
      cityName: string | null;
      regionName: string | null;
      fullRegionName: string | null;
      countryName: string | null;
      fullAddress: string | null;
    }>>`
      SELECT DISTINCT
        s.tj_hotel_id AS "tjHotelId",
        s.name AS name,
        c.city_name AS "cityName",
        c.region_name AS "regionName",
        c.full_region_name AS "fullRegionName",
        c.country_name AS "countryName",
        COALESCE(s.locale->'address'->>'fulladdr', '') AS "fullAddress"
      FROM "${schemaName}".tripjack_hotel_static_content s
      LEFT JOIN "${schemaName}".tripjack_hotel_mappings m
        ON m.tj_hotel_id = s.tj_hotel_id
      LEFT JOIN "${schemaName}".tripjack_city_region_ids c
        ON c.city_region_id = m.region_id
      WHERE
        s.tj_hotel_id ILIKE ${pattern} ESCAPE '\\'
        OR s.name ILIKE ${pattern} ESCAPE '\\'
        OR COALESCE(s.locale->'address'->>'city', '') ILIKE ${pattern} ESCAPE '\\'
        OR COALESCE(s.locale->'address'->>'statename', '') ILIKE ${pattern} ESCAPE '\\'
        OR COALESCE(s.locale->'address'->>'countryname', '') ILIKE ${pattern} ESCAPE '\\'
        OR COALESCE(s.locale->'address'->>'fulladdr', '') ILIKE ${pattern} ESCAPE '\\'
        OR COALESCE(c.city_name, '') ILIKE ${pattern} ESCAPE '\\'
        OR COALESCE(c.region_name, '') ILIKE ${pattern} ESCAPE '\\'
        OR COALESCE(c.full_region_name, '') ILIKE ${pattern} ESCAPE '\\'
      ORDER BY
        CASE
          WHEN s.tj_hotel_id = ${query} THEN 0
          WHEN LOWER(s.name) = LOWER(${query}) THEN 1
          WHEN LOWER(COALESCE(c.city_name, '')) = LOWER(${query}) THEN 2
          ELSE 3
        END,
        s.name ASC
      LIMIT ${limit}
    `;

    return res.status(200).json({
      hotels,
      debug,
      status: { success: true, message: 'ok' },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/content/fetch-hotel-mapping-sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = hotelMappingSyncRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validation.error.flatten(),
      });
    }

    const result = await hotelService.hotelMappingSync(validation.data);

    if (!result.status.success) {
      return res.status(400).json({
        hotels: [],
        pageable: {
          pageNumber: validation.data.page || 0,
          pageSize: 0,
          totalElements: 0,
          totalPages: 0,
        },
        status: { success: false, message: result.status.message || 'Hotel mapping sync failed' },
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/content/fetch-deleted-hotel-mapping', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = deletedHotelMappingSyncRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validation.error.flatten(),
      });
    }

    const result = await hotelService.deletedHotelMappingSync(validation.data);

    if (!result.status.success) {
      return res.status(400).json({
        hotels: [],
        pageable: {
          pageNumber: validation.data.page || 0,
          pageSize: 0,
          totalElements: 0,
          totalPages: 0,
        },
        status: { success: false, message: result.status.message || 'Deleted hotel mapping sync failed' },
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/content/sync-static-content', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = req.tenant;
    if (!tenant?.slug) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context required',
      });
    }

    const result = await syncHotelStaticContentForTenant(tenant.slug);

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.get('/account/balance', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await hotelService.accountBalance();

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

// ─── Export ──────────────────────────────────────────────────────────────────

export default router;
