import axios, { AxiosError } from 'axios';
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { enableTripJackHotelBookingsForTenant, toSchemaName } from '../db/tenant-provisioner';
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

function createTripJackBookingClient() {
  const baseURL =
    process.env['TRIPJACK_HOTEL_BOOKER_BASE_URL'] || 'https://apitest-hotel-booker.tripjack.com';
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

async function callTripJackPost<T>(body: unknown, path: string): Promise<T> {
  const client = createTripJackClient();
  const response = await client.post(path, body);
  return response.data as T;
}

function parsePaginationParams(query: Request['query'], defaultPageSize = 24) {
  const pageValue = query?.['page'];
  const pageSizeValue = query?.['pageSize'];
  const searchValue = query?.['query'];
  const page = Number.isFinite(Number(pageValue)) ? Math.max(0, Math.floor(Number(pageValue))) : 0;
  const pageSize = Number.isFinite(Number(pageSizeValue))
    ? Math.max(1, Math.min(100, Math.floor(Number(pageSizeValue))))
    : defaultPageSize;
  const search = typeof searchValue === 'string' ? searchValue.trim() : '';

  return { page, pageSize, search };
}

function normalizeCountryName(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const countryName =
    candidate['countryName'] ||
    candidate['country_name'] ||
    candidate['name'] ||
    candidate['label'] ||
    candidate['value'];

  return typeof countryName === 'string' ? countryName.trim() || null : null;
}

function normalizeCountryList(payload: unknown): Array<{ countryName: string }> {
  const raw = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)['hotelCountries'] ||
        (payload as Record<string, unknown>)['countries'] ||
        (payload as Record<string, unknown>)['data'] ||
        []
      : [];

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => normalizeCountryName(item))
    .filter((item): item is string => Boolean(item))
    .map((countryName) => ({ countryName }))
    .sort((a, b) => a.countryName.localeCompare(b.countryName));
}

async function callTripJackBookingPost<T>(body: unknown, path: string): Promise<T> {
  const client = createTripJackBookingClient();
  const response = await client.post(path, body);
  return response.data as T;
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

type HotelSearchResponseRow = {
  tj_hotel_id?: string;
  name?: string | null;
  is_active?: boolean | null;
  star_rating?: string | null;
  property_type?: unknown;
  locale?: unknown;
  images?: unknown;
  descriptions?: unknown;
  raw_response?: unknown;
};

type HotelBookingRecord = {
  booking_id: string;
  tenant_id: string;
  created_by: string;
  hotel_id: string;
  hotel_name?: string | null;
  option_id?: string | null;
  review_hash?: string | null;
  status?: string | null;
  correlation_id?: string | null;
  nationality?: string | null;
  currency?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  rooms?: unknown;
  traveller_info?: unknown;
  delivery_info?: unknown;
  gst_info?: unknown;
  review_request?: unknown;
  review_response?: unknown;
  book_request?: unknown;
  book_response?: unknown;
  booking_detail?: unknown;
  cancel_request?: unknown;
  cancel_response?: unknown;
  raw_response?: unknown;
};

function normalizeHotelId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return null;
}

function resolveHotelIdFromRow(row: any): string | null {
  return (
    normalizeHotelId(row?.tj_hotel_id) ||
    normalizeHotelId(row?.tjHotelId) ||
    normalizeHotelId(row?.hotelId) ||
    normalizeHotelId(row?.hid) ||
    normalizeHotelId(row?.id)
  );
}

function resolveHotelIdFromHotelPayload(payload: any): string | null {
  return (
    normalizeHotelId(payload?.tjHotelId) ||
    normalizeHotelId(payload?.hotelId) ||
    normalizeHotelId(payload?.hid) ||
    normalizeHotelId(payload?.id) ||
    normalizeHotelId(payload?.bookingId)
  );
}

function resolveHotelNameFromPayload(payload: any): string | null {
  const value =
    payload?.hotelName ||
    payload?.name ||
    payload?.hotel_name ||
    payload?.itemInfos?.HOTEL?.hInfo?.name ||
    payload?.order?.hotelName;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function mergeStaticHotelsWithLiveData(
  staticRows: HotelSearchResponseRow[],
  liveRows: any[]
): Array<any> {
  const liveLookup = new Map<string, any>();

  for (const hotel of liveRows || []) {
    const hotelId = resolveHotelIdFromRow(hotel);
    if (hotelId) {
      liveLookup.set(hotelId, hotel);
    }
  }

  return staticRows.map((row) => {
    const hotelId = normalizeHotelId(row.tj_hotel_id);
    const live = hotelId ? liveLookup.get(hotelId) : null;

    return {
      ...(live || {}),
      tjHotelId: hotelId,
      hotelId,
      hid: hotelId,
      id: hotelId,
      name: live?.name || row.name || hotelId,
      staticOnly: !live,
      liveAvailable: Boolean(live),
      options: Array.isArray(live?.options) ? live.options : [],
      staticContent: {
        isActive: row.is_active ?? null,
        starRating: row.star_rating ?? null,
        propertyType: row.property_type ?? null,
        locale: row.locale ?? null,
        images: row.images ?? null,
        descriptions: row.descriptions ?? null,
        rawResponse: row.raw_response ?? null,
      },
    };
  });
}

async function ensureHotelBookingsStoreForTenant(tenantSlug: string): Promise<void> {
  await enableTripJackHotelBookingsForTenant(tenantSlug);
}

async function upsertHotelBookingRecord(
  req: Request,
  booking: Partial<HotelBookingRecord> & { booking_id: string; hotel_id: string }
): Promise<void> {
  const schemaName = resolveSchemaName(req.tenant!.slug);

  await ensureHotelBookingsStoreForTenant(req.tenant!.slug);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      req.tenant!.id
    );

    await tx.$executeRawUnsafe(
      `
        INSERT INTO "${schemaName}".tripjack_hotel_bookings (
          booking_id, tenant_id, created_by, hotel_id, hotel_name, option_id, review_hash, status,
          correlation_id, nationality, currency, check_in, check_out, rooms, traveller_info,
          delivery_info, gst_info, review_request, review_response, book_request, book_response,
          booking_detail, cancel_request, cancel_response, raw_response, updated_at, created_at
        ) VALUES (
          $1, $2::uuid, $3, $4, $5, $6, $7, COALESCE($8, 'PENDING'),
          $9, $10, $11, $12::date, $13::date, CAST($14 AS JSONB), CAST($15 AS JSONB),
          CAST($16 AS JSONB), CAST($17 AS JSONB), CAST($18 AS JSONB), CAST($19 AS JSONB), CAST($20 AS JSONB),
          CAST($21 AS JSONB), CAST($22 AS JSONB), CAST($23 AS JSONB), CAST($24 AS JSONB), CAST($25 AS JSONB),
          NOW(), NOW()
        )
        ON CONFLICT (booking_id) DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          created_by = EXCLUDED.created_by,
          hotel_id = EXCLUDED.hotel_id,
          hotel_name = EXCLUDED.hotel_name,
          option_id = EXCLUDED.option_id,
          review_hash = EXCLUDED.review_hash,
          status = EXCLUDED.status,
          correlation_id = EXCLUDED.correlation_id,
          nationality = EXCLUDED.nationality,
          currency = EXCLUDED.currency,
          check_in = EXCLUDED.check_in,
          check_out = EXCLUDED.check_out,
          rooms = EXCLUDED.rooms,
          traveller_info = EXCLUDED.traveller_info,
          delivery_info = EXCLUDED.delivery_info,
          gst_info = EXCLUDED.gst_info,
          review_request = EXCLUDED.review_request,
          review_response = EXCLUDED.review_response,
          book_request = EXCLUDED.book_request,
          book_response = EXCLUDED.book_response,
          booking_detail = EXCLUDED.booking_detail,
          cancel_request = EXCLUDED.cancel_request,
          cancel_response = EXCLUDED.cancel_response,
          raw_response = EXCLUDED.raw_response,
          updated_at = NOW()
      `,
      booking.booking_id,
      req.tenant!.id,
      req.user!.sub,
      booking.hotel_id,
      booking.hotel_name || null,
      booking.option_id || null,
      booking.review_hash || null,
      booking.status || 'PENDING',
      booking.correlation_id || null,
      booking.nationality || null,
      booking.currency || null,
      booking.check_in || null,
      booking.check_out || null,
      JSON.stringify(booking.rooms || null),
      JSON.stringify(booking.traveller_info || null),
      JSON.stringify(booking.delivery_info || null),
      JSON.stringify(booking.gst_info || null),
      JSON.stringify(booking.review_request || null),
      JSON.stringify(booking.review_response || null),
      JSON.stringify(booking.book_request || null),
      JSON.stringify(booking.book_response || null),
      JSON.stringify(booking.booking_detail || null),
      JSON.stringify(booking.cancel_request || null),
      JSON.stringify(booking.cancel_response || null),
      JSON.stringify(booking.raw_response || null)
    );
  });
}

async function updateHotelBookingRecord(
  req: Request,
  bookingId: string,
  patch: Partial<HotelBookingRecord>
): Promise<void> {
  const schemaName = resolveSchemaName(req.tenant!.slug);
  await ensureHotelBookingsStoreForTenant(req.tenant!.slug);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      req.tenant!.id
    );

    await tx.$executeRawUnsafe(
      `
        UPDATE "${schemaName}".tripjack_hotel_bookings
        SET
          status = COALESCE($1, status),
          hotel_id = COALESCE($2, hotel_id),
          hotel_name = COALESCE($3, hotel_name),
          option_id = COALESCE($4, option_id),
          review_hash = COALESCE($5, review_hash),
          correlation_id = COALESCE($6, correlation_id),
          nationality = COALESCE($7, nationality),
          currency = COALESCE($8, currency),
          check_in = COALESCE($9::date, check_in),
          check_out = COALESCE($10::date, check_out),
          rooms = COALESCE(CAST($11 AS JSONB), rooms),
          traveller_info = COALESCE(CAST($12 AS JSONB), traveller_info),
          delivery_info = COALESCE(CAST($13 AS JSONB), delivery_info),
          gst_info = COALESCE(CAST($14 AS JSONB), gst_info),
          review_request = COALESCE(CAST($15 AS JSONB), review_request),
          review_response = COALESCE(CAST($16 AS JSONB), review_response),
          book_request = COALESCE(CAST($17 AS JSONB), book_request),
          book_response = COALESCE(CAST($18 AS JSONB), book_response),
          booking_detail = COALESCE(CAST($19 AS JSONB), booking_detail),
          cancel_request = COALESCE(CAST($20 AS JSONB), cancel_request),
          cancel_response = COALESCE(CAST($21 AS JSONB), cancel_response),
          raw_response = COALESCE(CAST($22 AS JSONB), raw_response),
          updated_at = NOW()
        WHERE booking_id = $23
      `,
      patch.status || null,
      patch.hotel_id || null,
      patch.hotel_name || null,
      patch.option_id || null,
      patch.review_hash || null,
      patch.correlation_id || null,
      patch.nationality || null,
      patch.currency || null,
      patch.check_in || null,
      patch.check_out || null,
      patch.rooms ? JSON.stringify(patch.rooms) : null,
      patch.traveller_info ? JSON.stringify(patch.traveller_info) : null,
      patch.delivery_info ? JSON.stringify(patch.delivery_info) : null,
      patch.gst_info ? JSON.stringify(patch.gst_info) : null,
      patch.review_request ? JSON.stringify(patch.review_request) : null,
      patch.review_response ? JSON.stringify(patch.review_response) : null,
      patch.book_request ? JSON.stringify(patch.book_request) : null,
      patch.book_response ? JSON.stringify(patch.book_response) : null,
      patch.booking_detail ? JSON.stringify(patch.booking_detail) : null,
      patch.cancel_request ? JSON.stringify(patch.cancel_request) : null,
      patch.cancel_response ? JSON.stringify(patch.cancel_response) : null,
      patch.raw_response ? JSON.stringify(patch.raw_response) : null,
      bookingId
    );
  });
}

async function getHotelBookingById(req: Request, bookingId: string): Promise<HotelBookingRecord | null> {
  const schemaName = resolveSchemaName(req.tenant!.slug);
  await ensureHotelBookingsStoreForTenant(req.tenant!.slug);

  const rows = await prisma.$queryRawUnsafe<HotelBookingRecord[]>(
    `SELECT *
     FROM "${schemaName}".tripjack_hotel_bookings
     WHERE booking_id = $1
     LIMIT 1`,
    bookingId
  );

  return rows[0] || null;
}

async function listHotelBookings(
  req: Request,
  options: { limit: number; offset: number }
): Promise<{ total: number; bookings: HotelBookingRecord[] }> {
  const schemaName = resolveSchemaName(req.tenant!.slug);
  await ensureHotelBookingsStoreForTenant(req.tenant!.slug);

  const totalRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
    `SELECT COUNT(*)::int AS total
     FROM "${schemaName}".tripjack_hotel_bookings`
  );

  const bookings = await prisma.$queryRawUnsafe<HotelBookingRecord[]>(
    `SELECT *
     FROM "${schemaName}".tripjack_hotel_bookings
     ORDER BY created_at DESC
     LIMIT $1
     OFFSET $2`,
    options.limit,
    options.offset
  );

  return {
    total: totalRows[0]?.total || 0,
    bookings,
  };
}

function normalizeSearchBy(value: unknown): HotelSearchBy {
  if (value === 'country' || value === 'region' || value === 'hotelId' || value === 'hotelName') {
    return value;
  }
  return 'auto';
}

function buildSearchWhereClause(searchBy: HotelSearchBy, term: string) {
  const like = `%${term.trim()}%`;
  const tokens = term
    .toLowerCase()
    .split(/[\s,/-]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const locationColumns = [
    "COALESCE(s.locale->'address'->>'city', '')",
    "COALESCE(s.locale->'address'->>'statename', '')",
    "COALESCE(s.locale->'address'->>'region', '')",
    "COALESCE(s.locale->'address'->>'regioncode', '')",
    "COALESCE(s.locale->'address'->>'fulladdr', '')",
    "COALESCE(s.locale->'address'->>'line_1', '')",
    "COALESCE(s.locale->'address'->>'line_2', '')",
    "COALESCE(s.locale->'address'->>'countryname', '')",
  ] as const;

  switch (searchBy) {
    case 'country':
      return {
        sql: `WHERE (
          LOWER(COALESCE(m.country_name, c.country_name, s.locale->'address'->>'countryname', '')) LIKE LOWER($1)
        )`,
        params: [like],
      };
    case 'region':
      return {
        sql: `WHERE (
          ${buildTokenMatchSql(locationColumns[0], tokens)}
          OR ${buildTokenMatchSql(locationColumns[1], tokens)}
          OR ${buildTokenMatchSql(locationColumns[2], tokens)}
          OR ${buildTokenMatchSql(locationColumns[3], tokens)}
          OR ${buildTokenMatchSql(locationColumns[4], tokens)}
          OR ${buildTokenMatchSql(locationColumns[5], tokens)}
          OR ${buildTokenMatchSql(locationColumns[6], tokens)}
          OR ${buildTokenMatchSql(locationColumns[7], tokens)}
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
          LOWER(COALESCE(m.country_name, c.country_name, s.locale->'address'->>'countryname', '')) LIKE LOWER($1)
          OR ${buildTokenMatchSql(locationColumns[0], tokens)}
          OR ${buildTokenMatchSql(locationColumns[1], tokens)}
          OR ${buildTokenMatchSql(locationColumns[2], tokens)}
          OR ${buildTokenMatchSql(locationColumns[3], tokens)}
          OR ${buildTokenMatchSql(locationColumns[4], tokens)}
          OR ${buildTokenMatchSql(locationColumns[5], tokens)}
          OR ${buildTokenMatchSql(locationColumns[6], tokens)}
          OR ${buildTokenMatchSql(locationColumns[7], tokens)}
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
  const exact = normalized.toLowerCase();
  const searchTokens = normalized
    .toLowerCase()
    .split(/[\s,/-]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  console.log('[TripJackHotelSuggestions] query', {
    schemaName,
    term: normalized,
    tokens: searchTokens,
  });

  const countries = await prisma.$queryRawUnsafe<Array<{ country_name: string }>>(
     `SELECT DISTINCT c.country_name
     FROM ${countryTable} c
     WHERE COALESCE(c.country_name, '') <> ''
       AND (${buildTokenMatchSql('c.country_name', searchTokens)})
     ORDER BY c.country_name ASC
     LIMIT 8`,
  );

  const regions = await prisma.$queryRawUnsafe<Array<{ label: string; sub_label: string | null }>>(
    `SELECT DISTINCT
       COALESCE(r.full_region_name, r.region_name, r.city_name) AS label,
       r.country_name AS sub_label,
       r.region_type AS region_type,
       CASE
         WHEN LOWER(COALESCE(r.full_region_name, '')) = $1
           OR LOWER(COALESCE(r.region_name, '')) = $1
           OR LOWER(COALESCE(r.city_name, '')) = $1
           OR LOWER(COALESCE(r.country_name, '')) = $1
           THEN 0
         WHEN r.region_type = 'PROVINCE_STATE' THEN 1
         ELSE 2
       END AS sort_rank
     FROM ${regionTable} r
     WHERE (
       ${buildTokenMatchSql('r.city_name', searchTokens)}
       OR ${buildTokenMatchSql('r.region_name', searchTokens)}
       OR ${buildTokenMatchSql('r.full_region_name', searchTokens)}
       OR ${buildTokenMatchSql('r.country_name', searchTokens)}
     )
     ORDER BY sort_rank ASC, label ASC
     LIMIT 12`,
    exact
  );

  const hotelIds = await prisma.$queryRawUnsafe<Array<{ value: string; label: string; sub_label: string | null }>>(
    `SELECT DISTINCT
       s.tj_hotel_id AS value,
       s.tj_hotel_id AS label,
       m.country_name AS sub_label
     FROM ${staticTable} s
     LEFT JOIN ${mappingTable} m ON m.tj_hotel_id = s.tj_hotel_id
     WHERE s.tj_hotel_id ILIKE $1
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
     LEFT JOIN ${mappingTable} m ON m.tj_hotel_id = s.tj_hotel_id
     WHERE (
       ${buildTokenMatchSql('s.name', searchTokens)}
       AND COALESCE(s.name, '') <> COALESCE(s.tj_hotel_id, '')
     )
     ORDER BY label ASC
     LIMIT 8`,
  );

  const suggestions = [
    ...hotelNames.map((item) => ({
      type: 'hotelName' as const,
      value: item.value,
      label: item.label,
      subLabel: item.sub_label,
    })),
    ...regions.map((item) => ({
      type: 'region' as const,
      value: item.label,
      label: item.label,
      subLabel: item.sub_label,
    })),
    ...countries.map((item) => ({
      type: 'country' as const,
      value: item.country_name,
      label: item.country_name,
      subLabel: 'Country',
    })),
    ...hotelIds.map((item) => ({
      type: 'hotelId' as const,
      value: item.value,
      label: item.label,
      subLabel: item.sub_label,
    })),
  ].slice(0, 24);

  console.log('[TripJackHotelSuggestions] raw matches', {
    term: normalized,
    countries: countries.length,
    regions: regions.length,
    hotelNames: hotelNames.length,
    hotelIds: hotelIds.length,
    returned: suggestions.length,
    sample: {
      countries: countries.slice(0, 3),
      regions: regions.slice(0, 3),
      hotelNames: hotelNames.slice(0, 3),
      hotelIds: hotelIds.slice(0, 3),
    },
  });

  return suggestions;
}

function buildTokenMatchSql(column: string, tokens: string[]): string {
  if (!tokens.length) {
    return 'FALSE';
  }

  return tokens
    .map(
      (token) => `EXISTS (
        SELECT 1
        FROM unnest(regexp_split_to_array(lower(COALESCE(${column}, '')), '[^a-z0-9]+')) AS token(token)
        WHERE token LIKE '${token.replace(/'/g, "''")}%'
      )`
    )
    .join(' AND ');
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
    const tenantSlug = req.tenant!.slug;
    const { page, pageSize, search } = parsePaginationParams(req.query, 24);

    const client = createTripJackClient();
    const response = await client.get('/hms/v3/content/fetch-countries');
    const allCountries = normalizeCountryList(
      response.data?.['hotelCountries'] || response.data?.['countries'] || response.data?.['data'] || response.data,
    );

    const syncedResult = await getSyncedHotelCountries(tenantSlug);
    const syncedLookup = new Set(
      (syncedResult.countries || []).map((item) => item.countryName.trim().toLowerCase()),
    );

    const availableCountries = allCountries.filter((item) => !syncedLookup.has(item.countryName.trim().toLowerCase()));
    const filteredCountries = search
      ? availableCountries.filter((item) => item.countryName.toLowerCase().includes(search.toLowerCase()))
      : availableCountries;
    const total = filteredCountries.length;
    const pages = total ? Math.max(1, Math.ceil(total / pageSize)) : 0;
    const safePage = pages ? Math.min(page, pages - 1) : 0;
    const countries = filteredCountries.slice(safePage * pageSize, safePage * pageSize + pageSize);

    console.log('[TripJackHotelRoutes] fetch-countries paginated', {
      tenantSlug,
      total,
      page: safePage,
      pageSize,
      search,
    });

    return res.status(200).json({
      success: true,
      data: {
        countries,
        total,
        page: safePage,
        pageSize,
        pages,
        query: search,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/content/synced-countries', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const tenantSlug = req.tenant!.slug;
    const { page, pageSize, search } = parsePaginationParams(req.query, 24);
    const result = await getSyncedHotelCountries(tenantSlug);
    const filteredCountries = search
      ? (result.countries || []).filter((item) => item.countryName.toLowerCase().includes(search.toLowerCase()))
      : result.countries || [];
    const total = filteredCountries.length;
    const pages = total ? Math.max(1, Math.ceil(total / pageSize)) : 0;
    const safePage = pages ? Math.min(page, pages - 1) : 0;
    const countries = filteredCountries.slice(safePage * pageSize, safePage * pageSize + pageSize);

    return res.status(200).json({
      success: true,
      data: {
        countries,
        total,
        hotelsSyncedTotal: result.hotelsSyncedTotal || 0,
        page: safePage,
        pageSize,
        pages,
        query: search,
      },
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
    let noMatchMessage: string | null = null;

    if (!resolvedHotelIds.length) {
      const searchPage = await resolveHotelSearchPage(schemaName, searchBy, query, page, pageSize);
      totalResults = searchPage.total;
      pagedHotelIds = searchPage.hotelIds.map((row) => Number(row.tj_hotel_id)).filter((value) => Number.isInteger(value) && value > 0);
    }

    if (!pagedHotelIds.length) {
      noMatchMessage = `No hotels matched "${query || 'requested hotel IDs'}"`;
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
          message: noMatchMessage,
        },
      });
    }

    const listingIds: number[] = pagedHotelIds.slice(0, pageSize);
    const staticRows = await prisma.$queryRawUnsafe<HotelSearchResponseRow[]>(
      `SELECT
         tj_hotel_id,
         name,
         is_active,
         star_rating,
         property_type,
         locale,
         images,
         descriptions,
         raw_response
       FROM ${tableName(schemaName, 'tripjack_hotel_static_content')}
       WHERE tj_hotel_id = ANY($1::text[])`,
      listingIds.map((item) => String(item))
    );

    const client = createTripJackClient();
    const response = await client
      .post('/hms/v3/hotel/listing', {
        ...req.body,
        query: undefined,
        searchBy,
        page,
        pageSize,
        hids: listingIds.slice(0, 100),
      })
      .catch((error) => {
        console.error('[TripJackHotelRoutes] listing fallback', {
          error: axios.isAxiosError(error) ? error.response?.data || error.message : error,
        });
        return null;
      });

    const liveHotels = Array.isArray(response?.data?.hotels) ? response.data.hotels : [];
    const hotels = mergeStaticHotelsWithLiveData(staticRows, liveHotels);
    const liveCount = liveHotels.length;

    return res.status(response?.status || 200).json({
      ...(response?.data || {}),
      totalResults,
      page,
      pageSize,
      searchBy,
      query,
      hotels,
      status: {
        success: true,
        message:
          liveCount > 0
            ? response?.data?.status?.message
            : noMatchMessage ||
              `No live availability for "${query || 'requested hotel IDs'}" from page ${page + 1}. The hotel exists in synced data, but TripJack did not return a listing for these exact criteria.`,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/pricing', async (req: Request, res: Response, _next: NextFunction): Promise<any> => {
  try {
    return await proxyPost(req, res, '/hms/v3/hotel/pricing', 'pricing');
  } catch (error) {
    _next(error);
  }
});

router.post('/review', async (req: Request, res: Response, _next: NextFunction): Promise<any> => {
  try {
    const payload = req.body;
    const response = await callTripJackPost<any>(payload, '/hms/v3/hotel/review');
    const bookingId = normalizeHotelId(response?.bookingId);

    if (bookingId) {
      await upsertHotelBookingRecord(req, {
        booking_id: bookingId,
        tenant_id: req.tenant!.id,
        created_by: req.user!.sub,
        hotel_id: resolveHotelIdFromHotelPayload(payload?.['hid']) || bookingId,
        hotel_name: resolveHotelNameFromPayload(response),
        option_id: typeof payload?.['optionId'] === 'string' ? payload['optionId'] : null,
        review_hash: typeof payload?.['reviewHash'] === 'string' ? payload['reviewHash'] : null,
        status: 'PENDING',
        correlation_id: typeof payload?.['correlationId'] === 'string' ? payload['correlationId'] : null,
        nationality: typeof payload?.['nationality'] === 'string' ? payload['nationality'] : null,
        currency: typeof payload?.['currency'] === 'string' ? payload['currency'] : null,
        check_in: typeof payload?.['checkIn'] === 'string' ? payload['checkIn'] : null,
        check_out: typeof payload?.['checkOut'] === 'string' ? payload['checkOut'] : null,
        rooms: payload?.['rooms'] || null,
        traveller_info: payload?.['travellerInfo'] || null,
        delivery_info: payload?.['deliveryInfo'] || null,
        gst_info: payload?.['gstInfo'] || null,
        review_request: payload || null,
        review_response: response,
        raw_response: response,
      });
    }

    return res.status(200).json(response);
  } catch (error) {
    return handleError(res, error, 'review');
  }
});

router.post('/book', async (req: Request, res: Response, _next: NextFunction): Promise<any> => {
  try {
    const payload = req.body;
    console.info('[TripJackHotelRoutes] book request', {
      tenantSlug: req.tenant?.slug,
      userId: req.user?.sub,
      bookingId: typeof payload?.['bookingId'] === 'string' ? payload['bookingId'] : null,
      hid: typeof payload?.['hid'] === 'string' ? payload['hid'] : null,
      optionId: typeof payload?.['optionId'] === 'string' ? payload['optionId'] : null,
      hasPaymentInfos: Array.isArray(payload?.['paymentInfos']),
      roomTravellerInfoCount: Array.isArray(payload?.['roomTravellerInfo']) ? payload['roomTravellerInfo'].length : 0,
      deliveryInfoKeys: payload?.['deliveryInfo'] && typeof payload['deliveryInfo'] === 'object'
        ? Object.keys(payload['deliveryInfo'] as Record<string, unknown>)
        : [],
      hasGstInfo: Boolean(payload?.['gstInfo']),
    });

    const response = await callTripJackBookingPost<any>(payload, '/oms/v3/hotel/book');
    const bookingId = normalizeHotelId(response?.bookingId || payload?.['bookingId']);

    if (bookingId) {
      const existing = await getHotelBookingById(req, bookingId);
      await updateHotelBookingRecord(req, bookingId, {
        status: existing?.status || 'PENDING',
        book_request: payload || null,
        book_response: response,
        raw_response: response,
        hotel_id: existing?.hotel_id || resolveHotelIdFromHotelPayload(payload?.['hid']) || bookingId,
        hotel_name: existing?.hotel_name || resolveHotelNameFromPayload(response),
        option_id: existing?.option_id || null,
        review_hash: existing?.review_hash || null,
        correlation_id: existing?.correlation_id || null,
      });
    }

    console.info('[TripJackHotelRoutes] book response', {
      tenantSlug: req.tenant?.slug,
      bookingId,
      status: response?.status || null,
      hasMetaInfo: Boolean(response?.metaInfo),
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error('[TripJackHotelRoutes] book failed', {
      tenantSlug: req.tenant?.slug,
      userId: req.user?.sub,
      bookingId: typeof req.body?.['bookingId'] === 'string' ? req.body['bookingId'] : null,
      hid: typeof req.body?.['hid'] === 'string' ? req.body['hid'] : null,
      optionId: typeof req.body?.['optionId'] === 'string' ? req.body['optionId'] : null,
      error: axios.isAxiosError(error)
        ? {
            status: error.response?.status,
            data: error.response?.data || null,
            message: error.message,
          }
        : error,
    });
    return handleError(res, error, 'book');
  }
});

router.post('/booking-detail', async (req: Request, res: Response, _next: NextFunction): Promise<any> => {
  try {
    const payload = req.body;
    const response = await callTripJackBookingPost<any>(payload, '/oms/v3/hotel/booking-details');
    const bookingId = normalizeHotelId(payload?.['bookingId']);

    if (bookingId) {
      const existing = await getHotelBookingById(req, bookingId);
      await updateHotelBookingRecord(req, bookingId, {
        status: response?.order?.status || existing?.status || 'PENDING',
        booking_detail: response,
        raw_response: response,
        hotel_id: existing?.hotel_id || bookingId,
        hotel_name: existing?.hotel_name || resolveHotelNameFromPayload(response),
      });
    }

    return res.status(200).json(response);
  } catch (error) {
    return handleError(res, error, 'booking-detail');
  }
});

router.post('/cancel/:bookingId', async (req: Request, res: Response, _next: NextFunction): Promise<any> => {
  try {
    const bookingId = String(req.params['bookingId'] || '').trim();
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_BOOKING_ID',
          message: 'bookingId is required',
        },
      });
    }
    const response = await callTripJackBookingPost<any>({}, `/oms/v3/hotel/cancel-booking/${bookingId}`);
    const existing = await getHotelBookingById(req, bookingId);
    await updateHotelBookingRecord(req, bookingId, {
      status: 'CANCELLATION_PENDING',
      cancel_request: {},
      cancel_response: response,
      raw_response: response,
      hotel_id: existing?.hotel_id || bookingId,
      hotel_name: existing?.hotel_name || null,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleError(res, error, 'cancel');
  }
});

router.get('/bookings', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query['limit']) || 20));
    const offset = Math.max(0, Number(req.query['offset']) || 0);
    const result = await listHotelBookings(req, { limit, offset });

    return res.status(200).json({
      success: true,
      data: {
        total: result.total,
        limit,
        offset,
        bookings: result.bookings,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/bookings/:bookingId', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const bookingId = String(req.params['bookingId'] || '').trim();
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'bookingId is required',
      });
    }

    const booking = await getHotelBookingById(req, bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: booking,
    });
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
