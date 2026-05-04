/**
 * TripJack Flight Routes
 * BFF prefix: /api/v1/tripjack/flights
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { enableTripJackFlightBookingsForTenant, toSchemaName } from '../db/tenant-provisioner';
import { authenticate, requireRole, requireSameTenant } from '../middleware/auth.middleware';
import { tenantResolver, requireTenant } from '../middleware/tenant.middleware';
import { logAuditEvent } from '../services/audit.service';
import { createFlightService } from '../services/tripjack/flight.service.factory';
import {
  amendmentDetailsRequestSchema,
  amendmentRequestSchema,
  bookingDetailsRequestSchema,
  bookingIdRequestSchema,
  confirmBookRequestSchema,
  flightBookRequestSchema,
  flightSearchRequestSchema,
  priceIdsRequestSchema,
} from '../schemas/tripjack-flight.schema';

const router = Router();
const flightService = createFlightService();

router.use(tenantResolver);
router.use(requireTenant);
router.use(authenticate);
router.use(requireSameTenant);
router.use(requireRole('admin', 'operator'));

function validationError(res: Response, errors: unknown): Response {
  return res.status(400).json({
    success: false,
    message: 'Validation error',
    errors,
  });
}

function tenantSchema(req: Request): string {
  return toSchemaName(req.tenant!.slug);
}

async function insertFlightBooking(req: Request, payload: {
  bookingId: string;
  status: string;
  pnr?: string | undefined;
  ticketNumbers?: string[] | undefined;
  amount?: number | undefined;
  travellerInfo: unknown[];
  deliveryInfo: unknown;
  rawResponse: unknown;
}): Promise<void> {
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "${tenantSchema(req)}".tripjack_flight_bookings (
        booking_id, tenant_id, created_by, status, pnr, ticket_numbers,
        amount, traveller_info, delivery_info, raw_response, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, CAST($6 AS JSONB), $7,
        CAST($8 AS JSONB), CAST($9 AS JSONB), CAST($10 AS JSONB), NOW(), NOW()
      )
      ON CONFLICT (booking_id) DO UPDATE SET
        status = EXCLUDED.status,
        pnr = EXCLUDED.pnr,
        ticket_numbers = EXCLUDED.ticket_numbers,
        amount = EXCLUDED.amount,
        traveller_info = EXCLUDED.traveller_info,
        delivery_info = EXCLUDED.delivery_info,
        raw_response = EXCLUDED.raw_response,
        updated_at = NOW()
    `,
    payload.bookingId,
    req.tenant!.id,
    req.user!.sub,
    payload.status,
    payload.pnr || null,
    JSON.stringify(payload.ticketNumbers || []),
    payload.amount || null,
    JSON.stringify(payload.travellerInfo),
    JSON.stringify(payload.deliveryInfo),
    JSON.stringify(payload.rawResponse)
  );
}

async function updateFlightStatus(req: Request, bookingId: string, status: string, rawResponse: unknown): Promise<void> {
  await prisma.$executeRawUnsafe(
    `
      UPDATE "${tenantSchema(req)}".tripjack_flight_bookings
      SET status = $1, raw_response = CAST($2 AS JSONB), updated_at = NOW()
      WHERE booking_id = $3
    `,
    status,
    JSON.stringify(rawResponse),
    bookingId
  );
}

router.post('/_provision', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    await enableTripJackFlightBookingsForTenant(req.tenant!.slug);
    return res.status(200).json({
      success: true,
      schema: tenantSchema(req),
      table: 'tripjack_flight_bookings',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/search', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = flightSearchRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    const result = await flightService.search(validation.data);
    if (!result.status.success) {
      return res.status(400).json({ success: false, message: result.status.message || 'Flight search failed' });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/review', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = priceIdsRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    const result = await flightService.review(validation.data);
    if (!result.status.success) {
      return res.status(404).json({ success: false, message: result.status.message || 'Review failed' });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/fare-rule', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = priceIdsRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    const result = await flightService.fareRule(validation.data);
    if (!result.status.success) {
      return res.status(404).json({ success: false, message: result.status.message || 'Fare rule not found' });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/seat-map', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = priceIdsRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    const result = await flightService.seatMap(validation.data);
    if (!result.status.success) {
      return res.status(404).json({ success: false, message: result.status.message || 'Seat map not found' });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/fare-validate-book', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = bookingIdRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    const result = await flightService.fareValidateBook(validation.data);
    if (!result.status.success) {
      return res.status(404).json({ success: false, message: result.status.message || 'Fare validation failed' });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/book', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = flightBookRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    const result = await flightService.book(validation.data);
    if (result.status === 'FAILED') {
      return res.status(400).json({ success: false, message: result.statusObj?.message || 'Flight booking failed' });
    }

    await logAuditEvent({
      tenantId: req.tenant!.id,
      userId: req.user!.sub,
      eventType: 'user_updated',
      metadata: {
        action: validation.data.hold ? 'flight_hold_created' : 'flight_booking_created',
        bookingId: result.bookingId,
        status: result.status,
      },
    });

    try {
      await insertFlightBooking(req, {
        bookingId: result.bookingId,
        status: result.status,
        pnr: result.pnr,
        ticketNumbers: result.ticketNumbers,
        amount: validation.data.amount,
        travellerInfo: validation.data.travellerInfo,
        deliveryInfo: validation.data.deliveryInfo,
        rawResponse: result,
      });
    } catch (dbError) {
      console.warn('[TripJackFlightRoutes] DB insert failed:', dbError);
    }

    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/fare-validate', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = bookingIdRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    const result = await flightService.fareValidate(validation.data);
    if (!result.status.success) {
      return res.status(404).json({ success: false, message: result.status.message || 'Fare validation failed' });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/confirm-book', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = confirmBookRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    const result = await flightService.confirmBook(validation.data);
    if (result.status === 'FAILED') {
      return res.status(404).json({ success: false, message: result.statusObj?.message || 'Confirm booking failed' });
    }

    try {
      await updateFlightStatus(req, result.bookingId, result.status, result);
    } catch (dbError) {
      console.warn('[TripJackFlightRoutes] DB update failed:', dbError);
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/booking-details', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = bookingDetailsRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    const result = await flightService.bookingDetails(validation.data);
    if (!result.status.success) {
      return res.status(404).json({ success: false, message: result.status.message || 'Booking not found' });
    }

    return res.status(200).json({ success: true, data: result.booking });
  } catch (error) {
    next(error);
  }
});

router.post('/unhold', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = bookingIdRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    const result = await flightService.unhold(validation.data);
    if (result.status === 'FAILED') {
      return res.status(404).json({ success: false, message: result.statusObj?.message || 'Unhold failed' });
    }

    try {
      await updateFlightStatus(req, result.bookingId, result.status, result);
    } catch (dbError) {
      console.warn('[TripJackFlightRoutes] DB update failed:', dbError);
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/amendment-charges', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = amendmentRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    const result = await flightService.amendmentCharges(validation.data);
    if (!result.status.success) {
      return res.status(404).json({ success: false, message: result.status.message || 'Amendment charges not found' });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/submit-amendment', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = amendmentRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    const result = await flightService.submitAmendment(validation.data);
    if (!result.status.success) {
      return res.status(404).json({ success: false, message: result.status.message || 'Amendment submit failed' });
    }

    try {
      await updateFlightStatus(req, validation.data.bookingId, 'CANCELLED', result);
    } catch (dbError) {
      console.warn('[TripJackFlightRoutes] DB update failed:', dbError);
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/amendment-details', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validation = amendmentDetailsRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return validationError(res, validation.error.flatten());
    }

    const result = await flightService.amendmentDetails(validation.data);
    if (!result.status.success) {
      return res.status(404).json({ success: false, message: result.status.message || 'Amendment not found' });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.get('/user-balance', async (_req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const result = await flightService.userBalance();
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
