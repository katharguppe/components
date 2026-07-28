import axios, { AxiosError } from 'axios';
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { enableTripJackHotelStaticContentForTenant, toSchemaName } from '../db/tenant-provisioner';
import { authenticate, requireRole, requireSameTenant } from '../middleware/auth.middleware';
import { tenantResolver, requireTenant } from '../middleware/tenant.middleware';
import {
  getHotelStaticSyncState,
  getSyncedHotelCountries,
  syncHotelStaticContent,
} from '../services/tripjack/hotel.static-sync.service';

const router = Router();
const HOTEL_STATIC_SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const hotelSyncJobs = new Map<string, Promise<void>>();

type TripJackErrorResponse = {
  message?: string;
  errors?: Array<{ description?: string }>;
};

function tableName(schemaName: string, table: string): string {
  return `"${schemaName}".${table}`;
}

function createTripJackClient() {
  const baseURL =
    process.env['TRIPJACK_HOTEL_BASE_URL'] || 'https://apitest-hms.tripjack.com';
  const apiKey = process.env['TRIPJACK_API_KEY'] || '';

  return axios.create({
    baseURL: baseURL.replace(/\/+$/, ''),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      apikey: apiKey,
    },
    timeout: 30000,
  });
}

router.use(tenantResolver);
router.use(requireTenant);
router.use(authenticate);
router.use(requireSameTenant);
router.use(requireRole('admin', 'operator'));

function handleError(res: Response, error: unknown, operation: string): Response {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<TripJackErrorResponse>;
    const status = axiosError.response?.status || 500;
    const message =
      axiosError.response?.data?.message ||
      axiosError.response?.data?.errors?.[0]?.description ||
      axiosError.message ||
      'TripJack request failed';

    console.error(`[TripJackHotelRoutes] ${operation} failed`, {
      status,
      message,
      responseData: axiosError.response?.data || null,
      requestBody: axiosError.config?.data || null,
      requestUrl: axiosError.config?.url || null,
      requestMethod: axiosError.config?.method || null,
    });

    return res.status(status).json({
      code: 'TRIPJACK_ERROR',
      message,
      raw: axiosError.response?.data || null,
    });
  }

  console.error(`[TripJackHotelRoutes] ${operation} failed`, error);
  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'TripJack hotel request failed',
  });
}

async function proxyGet(req: Request, res: Response, path: string, operation: string) {
  try {
    const client = createTripJackClient();
    const response = await client.get(path, { params: req.query });
    return res.status(response.status).json(response.data);
  } catch (error) {
    return handleError(res, error, operation);
  }
}

async function proxyPost(req: Request, res: Response, path: string, operation: string) {
  try {
    const client = createTripJackClient();
    const response = await client.post(path, req.body);
    return res.status(response.status).json(response.data);
  } catch (error) {
    return handleError(res, error, operation);
  }
}

function startHotelSyncBackground(
  tenantSlug: string,
  options: { countryNames?: string[] } = {}
): { started: boolean; running: boolean } {
  if (hotelSyncJobs.has(tenantSlug)) {
    return { started: false, running: true };
  }

  const job = syncHotelStaticContent(tenantSlug, options)
    .catch((error) => {
      console.error('[TripJackHotelRoutes] background sync failed', { tenantSlug, error });
    })
    .finally(() => {
      hotelSyncJobs.delete(tenantSlug);
    }) as Promise<void>;

  hotelSyncJobs.set(tenantSlug, job);
  return { started: true, running: true };
}

function isHotelStaticSyncDue(result: { updatedAt: string | null; lastSyncAt: string | null }): boolean {
  const reference = result.lastSyncAt || result.updatedAt;
  if (!reference) {
    return true;
  }

  const time = new Date(reference).getTime();
  if (Number.isNaN(time)) {
    return true;
  }

  return Date.now() - time >= HOTEL_STATIC_SYNC_INTERVAL_MS;
}

function resolveSchemaName(tenantSlug: string): string {
  return toSchemaName(tenantSlug);
}

type HotelSearchBy = 'auto' | 'country' | 'region' | 'hotelId' | 'hotelName';

type HotelSuggestion = {
  type: HotelSearchBy;
  value: string;
  label: string;
  subLabel?: string | null;
};

function normalizeSearchBy(value: unknown): HotelSearchBy {
  if (value === 'country' || value === 'region' || value === 'hotelId' || value === 'hotelName') {
    return value;
  }
  return 'auto';
}

function buildSearchWhereClause(searchBy: HotelSearchBy, term: string) {
  const like = `%${term.trim()}%`;

  switch (searchBy) {
    case 'country':
      return {
        sql: `WHERE LOWER(COALESCE(m.country_name, c.country_name, '')) LIKE LOWER($1)`,
        params: [like],
      };
    case 'region':
      return {
        sql: `WHERE (
          LOWER(COALESCE(r.city_name, '')) LIKE LOWER($1)
          OR LOWER(COALESCE(r.region_name, '')) LIKE LOWER($1)
          OR LOWER(COALESCE(r.full_region_name, '')) LIKE LOWER($1)
          OR LOWER(COALESCE(r.country_name, '')) LIKE LOWER($1)
        )`,
        params: [like],
      };
    case 'hotelId':
      return {
        sql: `WHERE LOWER(COALESCE(s.tj_hotel_id, '')) LIKE LOWER($1)`,
        params: [like],
      };
    case 'hotelName':
      return {
        sql: `WHERE LOWER(COALESCE(s.name, '')) LIKE LOWER($1)`,
        params: [like],
      };
    case 'auto':
    default:
      return {
        sql: `WHERE (
          LOWER(COALESCE(m.country_name, c.country_name, '')) LIKE LOWER($1)
          OR LOWER(COALESCE(r.city_name, '')) LIKE LOWER($1)
          OR LOWER(COALESCE(r.region_name, '')) LIKE LOWER($1)
          OR LOWER(COALESCE(r.full_region_name, '')) LIKE LOWER($1)
          OR LOWER(COALESCE(s.tj_hotel_id, '')) LIKE LOWER($1)
          OR LOWER(COALESCE(s.name, '')) LIKE LOWER($1)
        )`,
        params: [like],
      };
  }
}

async function getHotelSearchSuggestions(schemaName: string, term: string): Promise<HotelSuggestion[]> {
  const normalized = term.trim();
  if (!normalized) return [];

  const countryTable = tableName(schemaName, 'tripjack_hotel_countries');
  const regionTable = tableName(schemaName, 'tripjack_city_region_ids');
  const mappingTable = tableName(schemaName, 'tripjack_hotel_mappings');
  const staticTable = tableName(schemaName, 'tripjack_hotel_static_content');

  const like = `%${normalized}%`;
  const isNumericTerm = /^\d+$/.test(normalized);

  if (isNumericTerm) {
    const hotelIds = await prisma.$queryRawUnsafe<Array<{ value: string; label: string; sub_label: string | null }>>(
      `SELECT DISTINCT
         s.tj_hotel_id AS value,
         s.tj_hotel_id AS label,
         m.country_name AS sub_label
       FROM ${staticTable} s
       LEFT JOIN ${mappingTable} m ON m.tj_hotel_id = s.tj_hotel_id
       WHERE s.tj_hotel_id ILIKE $1
       ORDER BY label ASC
       LIMIT 12`,
      like
    );

    return hotelIds.map((item) => ({
      type: 'hotelId' as const,
      value: item.value,
      label: item.label,
      subLabel: item.sub_label,
    }));
  }

  const countries = await prisma.$queryRawUnsafe<Array<{ country_name: string }>>(
    `SELECT DISTINCT m.country_name
     FROM ${mappingTable} m
     INNER JOIN ${staticTable} s ON s.tj_hotel_id = m.tj_hotel_id
     WHERE COALESCE(m.country_name, '') <> ''
       AND m.country_name ILIKE $1
     ORDER BY m.country_name ASC
     LIMIT 8`,
    like
  );

  const regions = await prisma.$queryRawUnsafe<Array<{ label: string; sub_label: string | null }>>(
    `SELECT DISTINCT
       COALESCE(r.full_region_name, r.region_name, r.city_name) AS label,
       r.country_name AS sub_label
     FROM ${regionTable} r
     INNER JOIN ${mappingTable} m ON m.region_id = r.city_region_id
     INNER JOIN ${staticTable} s ON s.tj_hotel_id = m.tj_hotel_id
     WHERE (
       r.city_name ILIKE $1
       OR r.region_name ILIKE $1
       OR r.full_region_name ILIKE $1
       OR r.country_name ILIKE $1
     )
     ORDER BY label ASC
     LIMIT 8`,
    like
  );

  const hotelNames = await prisma.$queryRawUnsafe<Array<{ value: string; label: string; sub_label: string | null }>>(
    `SELECT DISTINCT
       s.name AS value,
       s.name AS label,
       m.country_name AS sub_label
     FROM ${staticTable} s
     INNER JOIN ${mappingTable} m ON m.tj_hotel_id = s.tj_hotel_id
     WHERE (
       s.name ILIKE $1
       AND COALESCE(s.name, '') <> COALESCE(s.tj_hotel_id, '')
     )
     ORDER BY label ASC
     LIMIT 8`,
    like
  );

  return [
    ...countries.map((item) => ({
      type: 'country' as const,
      value: item.country_name,
      label: item.country_name,
      subLabel: 'Country',
    })),
    ...regions.map((item) => ({
      type: 'region' as const,
      value: item.label,
      label: item.label,
      subLabel: item.sub_label,
    })),
    ...hotelNames.map((item) => ({
      type: 'hotelName' as const,
      value: item.value,
      label: item.label,
      subLabel: item.sub_label,
    })),
  ].slice(0, 24);
}

async function resolveHotelSearchPage(
  schemaName: string,
  searchBy: HotelSearchBy,
  term: string,
  page: number,
  pageSize: number
): Promise<{ total: number; hotelIds: Array<{ tj_hotel_id: string }> }> {
  const staticTable = tableName(schemaName, 'tripjack_hotel_static_content');
  const mappingTable = tableName(schemaName, 'tripjack_hotel_mappings');
  const regionTable = tableName(schemaName, 'tripjack_city_region_ids');
  const countryTable = tableName(schemaName, 'tripjack_hotel_countries');

  const { sql, params } = buildSearchWhereClause(searchBy, term);
  const like = params[0];
  const offset = Math.max(0, page) * Math.max(1, pageSize);
  const size = Math.max(1, Math.min(100, pageSize));

  const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
    `SELECT COUNT(DISTINCT s.tj_hotel_id)::int AS total
     FROM ${staticTable} s
     LEFT JOIN ${mappingTable} m ON m.tj_hotel_id = s.tj_hotel_id
     LEFT JOIN ${regionTable} r ON r.city_region_id = m.region_id
     LEFT JOIN ${countryTable} c ON c.country_name = m.country_name
     ${sql}`,
    like
  );

  const rows = await prisma.$queryRawUnsafe<Array<{ tj_hotel_id: string }>>(
    `SELECT DISTINCT
       s.tj_hotel_id,
       COALESCE(s.name, s.tj_hotel_id) AS sort_name
     FROM ${staticTable} s
     LEFT JOIN ${mappingTable} m ON m.tj_hotel_id = s.tj_hotel_id
     LEFT JOIN ${regionTable} r ON r.city_region_id = m.region_id
     LEFT JOIN ${countryTable} c ON c.country_name = m.country_name
     ${sql}
     ORDER BY sort_name ASC, s.tj_hotel_id ASC
     LIMIT $2
     OFFSET $3`,
    like,
    size,
    offset
  );

  return {
    total: countRows[0]?.total || 0,
    hotelIds: rows,
  };
}

router.get('/content/fetch-countries', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    return await proxyGet(req, res, '/hms/v3/content/fetch-countries', 'fetch-countries');
  } catch (error) {
    next(error);
  }
});

router.get('/content/synced-countries', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const tenantSlug = req.tenant!.slug;
    const result = await getSyncedHotelCountries(tenantSlug);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/content/search-suggestions', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const tenantSlug = req.tenant!.slug;
    const schemaName = resolveSchemaName(tenantSlug);
    const query = typeof req.query?.['query'] === 'string' ? req.query['query'] : '';
    const suggestions = await getHotelSearchSuggestions(schemaName, query);
    return res.status(200).json({
      success: true,
      data: {
        suggestions,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/content/fetch-city-regionIds', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    return await proxyGet(req, res, '/hms/v3/content/fetch-city-regionIds', 'fetch-city-regionIds');
  } catch (error) {
    next(error);
  }
});

router.get('/nationalities', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    return await proxyGet(req, res, '/hms/v3/nationality-info', 'nationalities');
  } catch (error) {
    next(error);
  }
});

router.post('/search', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const tenantSlug = req.tenant!.slug;
    const schemaName = resolveSchemaName(tenantSlug);

    const query =
      typeof req.body?.query === 'string'
        ? req.body.query.trim()
        : '';
    const searchBy = normalizeSearchBy(req.body?.searchBy);
    const hids = Array.isArray(req.body?.hids) ? req.body.hids : [];
    const page = Number.isFinite(Number(req.body?.page)) ? Math.max(0, Math.floor(Number(req.body.page))) : 0;
    const pageSize = Number.isFinite(Number(req.body?.pageSize)) ? Math.max(1, Math.min(100, Math.floor(Number(req.body.pageSize)))) : 20;

    if (!hids.length && !query) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Provide either a query or hids for hotel search',
      });
    }

    const resolvedHotelIds = hids.length
      ? hids.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0)
      : [];

    let totalResults = resolvedHotelIds.length;
    let pagedHotelIds = resolvedHotelIds.slice(page * pageSize, page * pageSize + pageSize);

    if (!resolvedHotelIds.length) {
      const searchPage = await resolveHotelSearchPage(schemaName, searchBy, query, page, pageSize);
      totalResults = searchPage.total;
      pagedHotelIds = searchPage.hotelIds.map((row) => Number(row.tj_hotel_id)).filter((value) => Number.isInteger(value) && value > 0);
    }

    if (!pagedHotelIds.length) {
      return res.status(200).json({
        success: true,
        totalResults: 0,
        page,
        pageSize,
        searchBy,
        query,
        hotels: [],
        status: {
          success: true,
          message: `No hotels matched "${query || 'requested hotel IDs'}"`,
        },
      });
    }

    const listingIds = pagedHotelIds.slice(0, pageSize);

    const client = createTripJackClient();
    const response = await client.post('/hms/v3/hotel/listing', {
      ...req.body,
      query: undefined,
      searchBy,
      page,
      pageSize,
      hids: listingIds.slice(0, 100),
    });

    return res.status(response.status).json({
      ...response.data,
      totalResults,
      page,
      pageSize,
      searchBy,
      query,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/pricing', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    return await proxyPost(req, res, '/hms/v3/hotel/pricing', 'pricing');
  } catch (error) {
    next(error);
  }
});

router.post('/review', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    return await proxyPost(req, res, '/hms/v3/hotel/review', 'review');
  } catch (error) {
    next(error);
  }
});

router.post('/book', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    return await proxyPost(req, res, '/hms/v3/hotel/book', 'book');
  } catch (error) {
    next(error);
  }
});

router.post('/booking-detail', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    return await proxyPost(req, res, '/oms/v3/hotel/booking-details', 'booking-detail');
  } catch (error) {
    next(error);
  }
});

router.post('/cancel', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    return await proxyPost(req, res, '/oms/v3/hotel/cancel-booking', 'cancel');
  } catch (error) {
    next(error);
  }
});

router.post('/content/fetch-hotel-mapping', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    return await proxyPost(req, res, '/hms/v3/content/fetch-hotel-mapping', 'fetch-hotel-mapping');
  } catch (error) {
    next(error);
  }
});

router.post('/content/fetch-hotel-content', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    return await proxyPost(req, res, '/hms/v3/content/fetch-hotel-content', 'fetch-hotel-content');
  } catch (error) {
    next(error);
  }
});

router.post('/content/fetch-hotel-mapping-sync', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    return await proxyPost(req, res, '/hms/v3/content/fetch-hotel-mapping-sync', 'fetch-hotel-mapping-sync');
  } catch (error) {
    next(error);
  }
});

router.post('/content/fetch-deleted-hotel-mapping', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    return await proxyPost(req, res, '/hms/v3/content/fetch-deleted-hotel-mapping', 'fetch-deleted-hotel-mapping');
  } catch (error) {
    next(error);
  }
});

router.post('/content/sync-static-content', async (_req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const tenantSlug = _req.tenant!.slug;
    const countryNames = Array.isArray(_req.body?.countryNames)
      ? _req.body.countryNames.filter((item: unknown): item is string => typeof item === 'string')
      : [];
    const currentState = await getHotelStaticSyncState(tenantSlug);

    if (!countryNames.length && !isHotelStaticSyncDue(currentState)) {
      return res.status(200).json({
        success: true,
        data: {
          running: hotelSyncJobs.has(tenantSlug),
          started: false,
          skipped: true,
          reason: 'Hotel static content was synced within the last 7 days',
        },
      });
    }

    const syncState = startHotelSyncBackground(tenantSlug, { countryNames });
    return res.status(syncState.started ? 202 : 200).json({
      success: true,
      data: {
        running: syncState.running,
        started: syncState.started,
        skipped: false,
        reason: null,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/content/sync-status', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const tenantSlug = req.tenant!.slug;
    const result = await getHotelStaticSyncState(tenantSlug);
    return res.status(200).json({
      success: true,
      data: {
        ...result,
        running: hotelSyncJobs.has(tenantSlug),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/account/balance', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    return await proxyGet(req, res, '/hms/v3/account/balance', 'account-balance');
  } catch (error) {
    next(error);
  }
});

export default router;
