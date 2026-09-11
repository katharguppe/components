import axios, { AxiosError } from 'axios';
import { randomUUID } from 'crypto';
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
const HOTEL_SEARCH_TOKEN_TTL_MS = 30 * 60 * 1000;
const HOTEL_STATIC_SCHEMA = 'public';
const hotelSearchTokenCache = new Map<string, {
  hotelIds: string[];
  createdAt: number;
  query: string;
  searchBy: HotelSearchBy;
}>();

type TripJackErrorResponse = {
  message?: string;
  errors?: Array<{
    errCode?: string | number;
    code?: string | number;
    description?: string;
    message?: string;
    errorMessage?: string;
  }>;
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
    const firstError = axiosError.response?.data?.errors?.[0];
    const errorCode = firstError?.errCode || firstError?.code;
    const message =
      axiosError.response?.data?.message ||
      axiosError.response?.data?.errors?.[0]?.description ||
      firstError?.message ||
      firstError?.errorMessage ||
      axiosError.message ||
      `TripJack ${operation} request failed`;

    return res.status(status).json({
      code: 'TRIPJACK_ERROR',
      message: errorCode ? `TripJack error ${errorCode}: ${message}` : message,
      raw: axiosError.response?.data || null,
    });
  }

  console.error(`[TripJack][backend] ${operation} failed`, error);
  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'TripJack hotel request failed',
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
  scopeKey: string,
  options: { countryNames?: string[] } = {}
): { started: boolean; running: boolean } {
  if (hotelSyncJobs.has(scopeKey)) {
    return { started: false, running: true };
  }

  const job = syncHotelStaticContent(options)
    .catch(() => {
    })
    .finally(() => {
      hotelSyncJobs.delete(scopeKey);
    }) as Promise<void>;

  hotelSyncJobs.set(scopeKey, job);
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
  amenities?: unknown;
  images?: unknown;
  descriptions?: unknown;
  raw_response?: unknown;
};

type HotelSearchFilters = {
  availability: 'all' | 'live' | 'staticOnly';
  starRatings: string[];
  propertyTypes: string[];
  hasImages: 'any' | 'yes' | 'no';
  hasDescription: 'any' | 'yes' | 'no';
  refundable: 'all' | 'refundable' | 'nonRefundable';
  mealBasis: string;
  minPrice: number | null;
  maxPrice: number | null;
  sortBy: 'relevance' | 'nameAsc' | 'nameDesc' | 'starDesc' | 'priceAsc' | 'priceDesc';
};

type HotelSearchFacets = {
  starRatings: string[];
  propertyTypes: string[];
  mealBases: string[];
};

type HotelBookingRecord = {
  booking_id: string;
  tripjack_booking_id: string;
  tenant_id: string;
  created_by: string;
  hotel_id: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type HotelBookingListItem = {
  booking_id: string;
  hotel_name: string;
  status: string;
  check_in: string;
  check_out: string;
  guest_names: string[];
  room_count: number;
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
    const liveOptions = Array.isArray(live?.options) ? live.options : [];
    const sortedOptions = sortHotelOptionsByPrice(liveOptions);
    const lowestOption = sortedOptions[0] || null;

    return {
      ...(live || {}),
      tjHotelId: hotelId,
      hotelId,
      hid: hotelId,
      id: hotelId,
      name: live?.name || row.name || hotelId,
      staticOnly: !live,
      liveAvailable: Boolean(live),
      options: sortedOptions,
      lowestOption,
      lowestPrice: getHotelOptionPrice(lowestOption),
      lowestCurrency: lowestOption?.pricing?.currency ?? null,
      previewImageUrl: getHotelPreviewImage(hotelId, row.images),
      previewImageUrls: getHotelPreviewStrings(row.images),
      displayAddress: getHotelDisplayAddress(row.locale),
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

function collectSearchStrings(value: unknown): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  function push(candidate: unknown) {
    if (typeof candidate !== 'string') {
      return;
    }

    const trimmed = candidate.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }

    seen.add(trimmed);
    results.push(trimmed);
  }

  function walk(node: unknown) {
    if (node == null) {
      return;
    }

    if (typeof node === 'string') {
      push(node);
      return;
    }

    if (typeof node === 'number' || typeof node === 'boolean') {
      push(String(node));
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (typeof node === 'object') {
      Object.values(node as Record<string, unknown>).forEach(walk);
    }
  }

  walk(value);
  return results;
}

function normalizeHotelSearchFilters(value: unknown): HotelSearchFilters {
  if (!value || typeof value !== 'object') {
    return {
      availability: 'all',
      starRatings: [],
      propertyTypes: [],
      hasImages: 'any',
      hasDescription: 'any',
      refundable: 'all',
      mealBasis: '',
      minPrice: null,
      maxPrice: null,
      sortBy: 'relevance',
    };
  }

  const candidate = value as Record<string, unknown>;
  const starRatings = Array.isArray(candidate['starRatings'])
    ? candidate['starRatings'].map((item) => String(item).trim()).filter(Boolean)
    : [];
  const propertyTypes = Array.isArray(candidate['propertyTypes'])
    ? candidate['propertyTypes'].map((item) => String(item).trim()).filter(Boolean)
    : [];
  const availability = candidate['availability'];
  const hasImages = candidate['hasImages'];
  const hasDescription = candidate['hasDescription'];
  const refundable = candidate['refundable'];
  const mealBasis = typeof candidate['mealBasis'] === 'string' ? candidate['mealBasis'].trim() : '';
  const minPriceRaw = candidate['minPrice'];
  const maxPriceRaw = candidate['maxPrice'];
  const minPriceValue =
    minPriceRaw === '' || minPriceRaw == null ? Number.NaN : Number(minPriceRaw);
  const maxPriceValue =
    maxPriceRaw === '' || maxPriceRaw == null ? Number.NaN : Number(maxPriceRaw);
  const sortBy = candidate['sortBy'];

  return {
    availability:
      availability === 'live' || availability === 'staticOnly' ? availability : 'all',
    starRatings,
    propertyTypes,
    hasImages: hasImages === 'yes' || hasImages === 'no' ? hasImages : 'any',
    hasDescription: hasDescription === 'yes' || hasDescription === 'no' ? hasDescription : 'any',
    refundable:
      refundable === 'refundable' || refundable === 'nonRefundable' ? refundable : 'all',
    mealBasis,
    minPrice: Number.isFinite(minPriceValue) ? minPriceValue : null,
    maxPrice: Number.isFinite(maxPriceValue) ? maxPriceValue : null,
    sortBy:
      sortBy === 'nameAsc' ||
      sortBy === 'nameDesc' ||
      sortBy === 'starDesc' ||
      sortBy === 'priceAsc' ||
      sortBy === 'priceDesc'
        ? sortBy
        : 'relevance',
  };
}

function getHotelStarRating(hotel: any): string {
  const candidate =
    hotel?.staticContent?.starRating ??
    hotel?.starRating ??
    hotel?.star_rating ??
    hotel?.rating ??
    hotel?.staticContent?.rating ??
    null;
  return candidate == null ? '' : String(candidate).trim();
}

function hotelHasImages(hotel: any): boolean {
  return collectSearchStrings(hotel?.staticContent?.images).length > 0;
}

function hotelHasDescription(hotel: any): boolean {
  return collectSearchStrings(hotel?.staticContent?.descriptions).length > 0;
}

function getHotelPropertyTypes(hotel: any): string[] {
  return collectSearchStrings(hotel?.staticContent?.propertyType || hotel?.propertyType);
}

function getHotelOptionPrices(hotel: any): number[] {
  const options = Array.isArray(hotel?.options) ? hotel.options : [];
  return options
    .map((option: any) => Number(option?.pricing?.totalPrice ?? option?.pricing?.basePrice ?? NaN))
    .filter((price: number) => Number.isFinite(price));
}

function getHotelPreviewStrings(value: unknown): string[] {
  return collectSearchStrings(value).filter((item) => {
    const trimmed = item.trim();
    return Boolean(trimmed) && (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/'));
  });
}

function getHotelDisplayAddress(locale: unknown): string {
  if (!locale || typeof locale !== 'object') {
    return '';
  }

  const address = (locale as Record<string, unknown>)['address'];
  if (!address || typeof address !== 'object') {
    return '';
  }

  const record = address as Record<string, unknown>;
  const parts = [
    record['fulladdr'],
    record['line_1'],
    record['line_2'],
    record['city'],
    record['statename'],
    record['region'],
    record['regioncode'],
    record['countryname'],
    record['pincode'],
    record['postalcode'],
  ]
    .map((item) => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
    .filter(Boolean);

  return Array.from(new Set(parts)).join(', ');
}

function getHotelPreviewImage(hotelId: string | null, images: unknown): string | null {
  const candidates = getHotelPreviewStrings(images);
  if (!candidates.length) {
    return null;
  }

  if (!hotelId) {
    return candidates[0] || null;
  }

  const seed = hotelId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return candidates[seed % candidates.length] || candidates[0] || null;
}

function getHotelOptionPrice(option: any): number | null {
  const price = Number(option?.pricing?.totalPrice ?? option?.pricing?.basePrice ?? NaN);
  return Number.isFinite(price) ? price : null;
}

function sortHotelOptionsByPrice(options: any[]): any[] {
  return [...options].sort((a, b) => {
    const aPrice = getHotelOptionPrice(a);
    const bPrice = getHotelOptionPrice(b);

    if (aPrice == null && bPrice == null) {
      return String(a?.optionId || a?.optionType || '').localeCompare(String(b?.optionId || b?.optionType || ''));
    }
    if (aPrice == null) return 1;
    if (bPrice == null) return -1;
    if (aPrice !== bPrice) return aPrice - bPrice;
    return String(a?.optionId || a?.optionType || '').localeCompare(String(b?.optionId || b?.optionType || ''));
  });
}

function getHotelLowestOption(hotel: any): any | null {
  const options = Array.isArray(hotel?.options) ? hotel.options : [];
  if (!options.length) {
    return null;
  }

  return sortHotelOptionsByPrice(options)[0] || null;
}

function getHotelMinPrice(hotel: any): number | null {
  const lowestOption = getHotelLowestOption(hotel);
  const lowestPrice = getHotelOptionPrice(lowestOption);
  if (lowestPrice != null) {
    return lowestPrice;
  }

  const prices = getHotelOptionPrices(hotel);
  return prices.length ? Math.min(...prices) : null;
}

function getHotelMealBases(hotel: any): string[] {
  const options = Array.isArray(hotel?.options) ? hotel.options : [];
  const bases = options
    .map((option: any) => String(option?.mealBasis || '').trim())
    .filter(Boolean);
  return Array.from(new Set(bases));
}

function buildHotelSearchFacets(hotels: any[]): HotelSearchFacets {
  const starRatings = new Set<string>();
  const propertyTypes = new Set<string>();
  const mealBases = new Set<string>();

  for (const hotel of hotels || []) {
    const starRating = getHotelStarRating(hotel);
    if (starRating) {
      starRatings.add(starRating);
    }

    for (const propertyType of getHotelPropertyTypes(hotel)) {
      const normalized = propertyType.trim();
      if (normalized) {
        propertyTypes.add(normalized);
      }
    }

    for (const mealBasis of getHotelMealBases(hotel)) {
      const normalized = mealBasis.trim();
      if (normalized) {
        mealBases.add(normalized);
      }
    }
  }

  return {
    starRatings: Array.from(starRatings).sort((a, b) => Number(a) - Number(b)),
    propertyTypes: Array.from(propertyTypes).sort((a, b) => a.localeCompare(b)),
    mealBases: Array.from(mealBases).sort((a, b) => a.localeCompare(b)),
  };
}

function hotelMatchesFilters(hotel: any, filters: HotelSearchFilters): boolean {
  if (filters.availability === 'live' && !hotel?.liveAvailable) {
    return false;
  }

  if (filters.availability === 'staticOnly' && !hotel?.staticOnly) {
    return false;
  }

  if (filters.starRatings?.length) {
    const starRating = getHotelStarRating(hotel);
    if (!filters.starRatings.includes(starRating)) {
      return false;
    }
  }

  if (filters.propertyTypes?.length) {
    const propertyTypes = getHotelPropertyTypes(hotel).map((item) => item.toLowerCase());
    const matchesPropertyType = filters.propertyTypes.some((item) =>
      propertyTypes.some((candidate) => candidate.includes(item.toLowerCase()))
    );
    if (!matchesPropertyType) {
      return false;
    }
  }

  if (filters.hasImages === 'yes' && !hotelHasImages(hotel)) {
    return false;
  }
  if (filters.hasImages === 'no' && hotelHasImages(hotel)) {
    return false;
  }

  if (filters.hasDescription === 'yes' && !hotelHasDescription(hotel)) {
    return false;
  }
  if (filters.hasDescription === 'no' && hotelHasDescription(hotel)) {
    return false;
  }

  const minPrice = getHotelMinPrice(hotel);
  if (typeof filters.minPrice === 'number' && Number.isFinite(filters.minPrice)) {
    if (minPrice != null && minPrice < filters.minPrice) {
      return false;
    }
  }
  if (typeof filters.maxPrice === 'number' && Number.isFinite(filters.maxPrice)) {
    if (minPrice != null && minPrice > filters.maxPrice) {
      return false;
    }
  }

  if (filters.mealBasis) {
    const mealBasisLookup = filters.mealBasis.toLowerCase();
    const mealBases = getHotelMealBases(hotel).map((item) => item.toLowerCase());
    if (!mealBases.some((item) => item.includes(mealBasisLookup))) {
      return false;
    }
  }

  if (filters.refundable === 'refundable') {
    const options = Array.isArray(hotel?.options) ? hotel.options : [];
    if (!options.some((option: any) => option?.cancellation?.isRefundable)) {
      return false;
    }
  }

  if (filters.refundable === 'nonRefundable') {
    const options = Array.isArray(hotel?.options) ? hotel.options : [];
    if (!options.some((option: any) => option?.cancellation?.isRefundable === false)) {
      return false;
    }
  }

  return true;
}

function sortHotels(hotels: any[], sortBy: HotelSearchFilters['sortBy']) {
  const sorted = [...hotels];

  switch (sortBy) {
    case 'nameAsc':
      return sorted.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
    case 'nameDesc':
      return sorted.sort((a, b) => String(b?.name || '').localeCompare(String(a?.name || '')));
    case 'starDesc':
      return sorted.sort((a, b) => Number(getHotelStarRating(b) || 0) - Number(getHotelStarRating(a) || 0));
    case 'priceAsc':
      return sorted.sort((a, b) => (getHotelMinPrice(a) || Number.POSITIVE_INFINITY) - (getHotelMinPrice(b) || Number.POSITIVE_INFINITY));
    case 'priceDesc':
      return sorted.sort((a, b) => (getHotelMinPrice(b) || 0) - (getHotelMinPrice(a) || 0));
    case 'relevance':
    default:
      return sorted;
  }
}

async function ensureHotelBookingsStoreForTenant(tenantSlug: string): Promise<void> {
  await enableTripJackHotelBookingsForTenant(tenantSlug);
}

async function upsertHotelBookingRecord(
  req: Request,
  booking: Partial<HotelBookingRecord> & { tripjack_booking_id: string; hotel_id: string }
): Promise<void> {
  const schemaName = resolveSchemaName(req.tenant!.slug);

  await ensureHotelBookingsStoreForTenant(req.tenant!.slug);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      req.tenant!.id
    );

    const sequenceRows = await tx.$queryRawUnsafe<Array<{ next_value: bigint }>>(
      `SELECT nextval('"${schemaName}".tripjack_hotel_booking_seq') AS next_value`
    );
    const sequenceNumber = String(sequenceRows[0]?.next_value || '1');
    const tenantPrefix = req.tenant!.slug.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toUpperCase() || 'TENANT';
    const localBookingId = `${tenantPrefix}-HB-${sequenceNumber.padStart(6, '0')}`;

    await tx.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".tripjack_hotel_bookings
       (booking_id, tripjack_booking_id, tenant_id, created_by, hotel_id, created_at, updated_at)
       VALUES ($1, $2, $3::uuid, $4, $5, NOW(), NOW())
       ON CONFLICT (tripjack_booking_id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         created_by = EXCLUDED.created_by,
         hotel_id = EXCLUDED.hotel_id,
         updated_at = NOW()`,
      localBookingId,
      booking.tripjack_booking_id,
      req.tenant!.id,
      req.user!.sub,
      booking.hotel_id
    );
  });
}

async function getHotelBookingById(req: Request, bookingId: string): Promise<HotelBookingRecord | null> {
  const schemaName = resolveSchemaName(req.tenant!.slug);
  await ensureHotelBookingsStoreForTenant(req.tenant!.slug);

  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      req.tenant!.id
    );
    return tx.$queryRawUnsafe<HotelBookingRecord[]>(
      `SELECT *
       FROM "${schemaName}".tripjack_hotel_bookings
       WHERE booking_id::text = $1 OR tripjack_booking_id = $1
       LIMIT 1`,
      bookingId
    );
  });

  return rows[0] || null;
}

function readTripJackString(value: unknown, key: string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const result = (value as Record<string, unknown>)[key];
  return typeof result === 'string' || typeof result === 'number' ? String(result) : '';
}

async function getTripJackBookingListItem(localBooking: HotelBookingRecord): Promise<HotelBookingListItem> {
  const bookingId = localBooking.tripjack_booking_id;
  try {
    const response = await callTripJackBookingPost<any>(
      { bookingId },
      '/oms/v3/hotel/booking-details'
    );
    const itemInfos = response?.itemInfos;
    const hotel = itemInfos?.HOTEL || {};
    const hotelInfo = hotel?.hInfo || {};
    const query = hotel?.query || {};
    const order = response?.order || {};
    const status = readTripJackString(order, 'status') || readTripJackString(response?.status, 'message');
    const rooms = Array.isArray(hotelInfo?.ops?.[0]?.ris) ? hotelInfo.ops[0].ris : [];
    const guestNames = rooms.flatMap((room: any) => Array.isArray(room?.ti) ? room.ti : [])
      .map((guest: any) => [guest?.fN, guest?.lN].filter(Boolean).join(' ').trim())
      .filter(Boolean);

    return {
      booking_id: localBooking.booking_id,
      hotel_name: readTripJackString(hotelInfo, 'name') || '-',
      status: status || '-',
      check_in: readTripJackString(query, 'checkinDate') || '-',
      check_out: readTripJackString(query, 'checkoutDate') || '-',
      guest_names: Array.from(new Set(guestNames)),
      room_count: rooms.length,
    };
  } catch (error) {
    console.warn(`[TripJack][backend] booking details failed for ${bookingId}`, error);
    return {
      booking_id: localBooking.booking_id,
      hotel_name: '-',
      status: 'UNAVAILABLE',
      check_in: '-',
      check_out: '-',
      guest_names: [],
      room_count: 0,
    };
  }
}

async function listHotelBookings(
  req: Request,
  options: { limit: number; offset: number; search?: string }
): Promise<{ total: number; bookings: HotelBookingListItem[] }> {
  const schemaName = resolveSchemaName(req.tenant!.slug);
  await ensureHotelBookingsStoreForTenant(req.tenant!.slug);

  const filters: string[] = [];
  const params: unknown[] = [];

  if (options.search) {
    params.push(`%${options.search}%`);
    const searchParam = `$${params.length}`;
    filters.push(`(
      regexp_replace(LOWER(booking_id::text), '[^a-z0-9]', '', 'g')
        LIKE '%' || regexp_replace(LOWER(${searchParam}), '[^a-z0-9]', '', 'g') || '%'
      OR regexp_replace(LOWER(COALESCE(tripjack_booking_id, '')), '[^a-z0-9]', '', 'g')
        LIKE '%' || regexp_replace(LOWER(${searchParam}), '[^a-z0-9]', '', 'g') || '%'
      OR regexp_replace(LOWER(COALESCE(hotel_id, '')), '[^a-z0-9]', '', 'g')
        LIKE '%' || regexp_replace(LOWER(${searchParam}), '[^a-z0-9]', '', 'g') || '%'
    )`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const totalRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
    `SELECT COUNT(*)::int AS total
     FROM "${schemaName}".tripjack_hotel_bookings`
     + ` ${whereClause}`,
    ...params
  );

  const limitParam = params.length + 1;
  const offsetParam = params.length + 2;
  const bookings = await prisma.$queryRawUnsafe<HotelBookingRecord[]>(
    `SELECT *
     FROM "${schemaName}".tripjack_hotel_bookings
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${limitParam}
     OFFSET $${offsetParam}`,
    ...params,
    options.limit,
    options.offset
  );

  const liveBookings = await Promise.all(
      bookings.map((booking) => getTripJackBookingListItem(booking))
  );

  return {
    total: totalRows[0]?.total || 0,
    bookings: liveBookings,
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

async function getHotelSearchSuggestions(
  schemaName: string,
  term: string,
  countryName?: string,
): Promise<HotelSuggestion[]> {
  const normalized = term.trim();
  if (!normalized) return [];
  const normalizedCountry = countryName?.trim().toLowerCase() || "";

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

  const countries = await prisma.$queryRawUnsafe<Array<{ country_name: string }>>(
     `SELECT DISTINCT c.country_name
     FROM ${countryTable} c
     WHERE COALESCE(c.country_name, '') <> ''
       AND (${buildTokenMatchSql('c.country_name', searchTokens)})
       ${normalizedCountry ? 'AND LOWER(COALESCE(c.country_name, \'\')) = $1' : ''}
     ORDER BY c.country_name ASC
     LIMIT 8`,
     ...(normalizedCountry ? [normalizedCountry] : [])
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
     ${normalizedCountry ? 'AND LOWER(COALESCE(r.country_name, \'\')) = $2' : ''}
     ORDER BY sort_rank ASC, label ASC
     LIMIT 12`,
    ...(normalizedCountry ? [exact, normalizedCountry] : [exact])
  );

  const hotelIds = await prisma.$queryRawUnsafe<Array<{ value: string; label: string; sub_label: string | null }>>(
    `SELECT DISTINCT
       s.tj_hotel_id AS value,
       s.tj_hotel_id AS label,
       COALESCE(r.full_region_name, r.region_name, r.city_name, m.country_name) AS sub_label
     FROM ${staticTable} s
     LEFT JOIN ${mappingTable} m ON m.tj_hotel_id = s.tj_hotel_id
     LEFT JOIN ${regionTable} r ON r.city_region_id = m.region_id
     WHERE s.tj_hotel_id ILIKE $1
     ${normalizedCountry ? 'AND LOWER(COALESCE(m.country_name, s.locale->\'address\'->>\'countryname\', \'\')) = $2' : ''}
     ORDER BY label ASC
     LIMIT 8`,
    ...(normalizedCountry ? [like, normalizedCountry] : [like])
  );

  const hotelNames = await prisma.$queryRawUnsafe<Array<{ value: string; label: string; sub_label: string | null }>>(
    `SELECT DISTINCT
       s.name AS value,
       s.name AS label,
       COALESCE(r.full_region_name, r.region_name, r.city_name, m.country_name) AS sub_label
     FROM ${staticTable} s
     LEFT JOIN ${mappingTable} m ON m.tj_hotel_id = s.tj_hotel_id
     LEFT JOIN ${regionTable} r ON r.city_region_id = m.region_id
     WHERE (
       ${buildTokenMatchSql('s.name', searchTokens)}
       AND COALESCE(s.name, '') <> COALESCE(s.tj_hotel_id, '')
     )
     ${normalizedCountry ? 'AND LOWER(COALESCE(m.country_name, s.locale->\'address\'->>\'countryname\', \'\')) = $1' : ''}
     ORDER BY label ASC
     LIMIT 8`,
    ...(normalizedCountry ? [normalizedCountry] : [])
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

function cleanupExpiredHotelSearchTokens(now = Date.now()) {
  for (const [token, entry] of hotelSearchTokenCache.entries()) {
    if (now - entry.createdAt > HOTEL_SEARCH_TOKEN_TTL_MS) {
      hotelSearchTokenCache.delete(token);
    }
  }
}

function storeHotelSearchToken(payload: {
  hotelIds: string[];
  query: string;
  searchBy: HotelSearchBy;
}) {
  cleanupExpiredHotelSearchTokens();
  const token = randomUUID();
  hotelSearchTokenCache.set(token, {
    hotelIds: payload.hotelIds,
    query: payload.query,
    searchBy: payload.searchBy,
    createdAt: Date.now(),
  });
  return token;
}

function getHotelSearchToken(token: string) {
  cleanupExpiredHotelSearchTokens();
  const entry = hotelSearchTokenCache.get(token);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.createdAt > HOTEL_SEARCH_TOKEN_TTL_MS) {
    hotelSearchTokenCache.delete(token);
    return null;
  }

  return entry;
}

async function resolveAllHotelSearchIds(
  schemaName: string,
  searchBy: HotelSearchBy,
  term: string,
): Promise<string[]> {
  const pageSize = 100;
  let page = 0;
  const ids = new Set<string>();
  let total = 0;

  while (true) {
    const result = await resolveHotelSearchPage(schemaName, searchBy, term, page, pageSize);
    total = result.total;

    for (const row of result.hotelIds) {
      const hotelId = String(row.tj_hotel_id || '').trim();
      if (hotelId) {
        ids.add(hotelId);
      }
    }

    if (!total || ids.size >= total || result.hotelIds.length < pageSize) {
      break;
    }

    page += 1;

    if (page > 1000) {
      break;
    }
  }

  return Array.from(ids);
}

async function fetchHotelListingsByIds(
  reqBody: Record<string, unknown>,
  hotelIds: string[],
  searchBy: HotelSearchBy,
) {
  const client = createTripJackClient();
  const chunkSize = 100;
  const liveHotels: any[] = [];

  for (let index = 0; index < hotelIds.length; index += chunkSize) {
    const chunk = hotelIds.slice(index, index + chunkSize);
    if (!chunk.length) {
      continue;
    }

    const response = await client
      .post('/hms/v3/hotel/listing', {
        ...reqBody,
        query: undefined,
        searchBy,
        page: 0,
        pageSize: chunk.length,
        hids: chunk,
        searchToken: undefined,
      })
      .catch(() => null);

    if (Array.isArray(response?.data?.hotels)) {
      liveHotels.push(...response.data.hotels);
    }
  }

  return liveHotels;
}

router.get('/content/fetch-countries', async (_req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { page, pageSize, search } = parsePaginationParams(_req.query, 24);

    const client = createTripJackClient();
    const response = await client.get('/hms/v3/content/fetch-countries');
    const allCountries = normalizeCountryList(
      response.data?.['hotelCountries'] || response.data?.['countries'] || response.data?.['data'] || response.data,
    );

    const filteredCountries = search
      ? allCountries.filter((item) => item.countryName.toLowerCase().includes(search.toLowerCase()))
      : allCountries;
    const total = filteredCountries.length;
    const pages = total ? Math.max(1, Math.ceil(total / pageSize)) : 0;
    const safePage = pages ? Math.min(page, pages - 1) : 0;
    const countries = filteredCountries.slice(safePage * pageSize, safePage * pageSize + pageSize);

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

router.get('/content/synced-countries', async (_req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { page, pageSize, search } = parsePaginationParams(_req.query, 24);
    const result = await getSyncedHotelCountries();
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
    const schemaName = HOTEL_STATIC_SCHEMA;
    const query = typeof req.query?.['query'] === 'string' ? req.query['query'] : '';
    const countryName =
      typeof req.query?.['countryName'] === 'string'
        ? req.query['countryName']
        : '';
    const suggestions = await getHotelSearchSuggestions(schemaName, query, countryName);
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
    const schemaName = HOTEL_STATIC_SCHEMA;

    const query =
      typeof req.body?.query === 'string'
        ? req.body.query.trim()
        : '';
    const searchBy = normalizeSearchBy(req.body?.searchBy);
    const hids = Array.isArray(req.body?.hids) ? req.body.hids : [];
    const searchToken =
      typeof req.body?.searchToken === 'string'
        ? req.body.searchToken.trim()
        : '';
    const page = Number.isFinite(Number(req.body?.page)) ? Math.max(0, Math.floor(Number(req.body.page))) : 0;
    const pageSize = Number.isFinite(Number(req.body?.pageSize)) ? Math.max(1, Math.min(100, Math.floor(Number(req.body.pageSize)))) : 20;
    const filters = normalizeHotelSearchFilters(req.body?.filters);

    if (!hids.length && !query && !searchToken) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Provide either a query, hids, or searchToken for hotel search',
      });
    }

    let resolvedHotelIds: string[] = [];
    let effectiveSearchToken = searchToken || '';

    if (searchToken) {
      const cached = getHotelSearchToken(searchToken);
      if (cached) {
        resolvedHotelIds = cached.hotelIds;
      } else if (!query && !hids.length) {
        return res.status(404).json({
          code: 'SEARCH_TOKEN_EXPIRED',
          message: 'Hotel search token expired. Please search again.',
        });
      }
    }

    if (!resolvedHotelIds.length && hids.length) {
      resolvedHotelIds = hids
        .map((value: unknown) => String(value).trim())
        .filter((value: string) => value.length > 0);
    }

    let noMatchMessage: string | null = null;

    if (!resolvedHotelIds.length) {
      resolvedHotelIds = await resolveAllHotelSearchIds(schemaName, searchBy, query);
      if (resolvedHotelIds.length) {
        effectiveSearchToken = storeHotelSearchToken({
          hotelIds: resolvedHotelIds,
          query,
          searchBy,
        });
      }
    }

    if (!resolvedHotelIds.length) {
      noMatchMessage = `No hotels matched "${query || 'requested hotel IDs'}"`;
      return res.status(200).json({
        success: true,
        totalResults: 0,
        page,
        pageSize,
        searchBy,
        query,
        searchToken: effectiveSearchToken || undefined,
        hotels: [],
        status: {
          success: true,
          message: noMatchMessage,
        },
      });
    }

    const listingIds = resolvedHotelIds;
    const staticRows = await prisma.$queryRawUnsafe<HotelSearchResponseRow[]>(
      `SELECT
         tj_hotel_id,
         name,
         is_active,
       star_rating,
       property_type,
       locale,
       amenities,
       images,
       descriptions,
       raw_response
       FROM ${tableName(schemaName, 'tripjack_hotel_static_content')}
       WHERE tj_hotel_id = ANY($1::text[])`,
      listingIds.map((item) => String(item))
    );

    const liveHotels = await fetchHotelListingsByIds(req.body as Record<string, unknown>, listingIds, searchBy);
    const mergedHotels = mergeStaticHotelsWithLiveData(staticRows, liveHotels);
    const filteredHotels = sortHotels(
      mergedHotels.filter((hotel) => hotelMatchesFilters(hotel, filters)),
      filters.sortBy,
    );
    const liveCount = liveHotels.length;
    const hotels = filteredHotels.slice(page * pageSize, page * pageSize + pageSize);
    const facets = buildHotelSearchFacets(mergedHotels);
    const filtersApplied =
      filters.availability !== 'all' ||
      filters.starRatings.length > 0 ||
      filters.propertyTypes.length > 0 ||
      filters.hasImages !== 'any' ||
      filters.hasDescription !== 'any' ||
      filters.refundable !== 'all' ||
      Boolean(filters.mealBasis) ||
      filters.minPrice != null ||
      filters.maxPrice != null ||
      filters.sortBy !== 'relevance';

    return res.status(200).json({
      totalResults: filteredHotels.length,
      page,
      pageSize,
      searchBy,
      query,
      searchToken: effectiveSearchToken || undefined,
      facets,
      hotels,
      status: {
        success: true,
        message:
          hotels.length > 0
            ? undefined
            : filtersApplied
              ? `No hotels matched the selected filters for "${query || 'requested hotel IDs'}".`
              : liveCount > 0
                ? undefined
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
    const tripJackPayload = { ...(payload || {}) };
    delete tripJackPayload._checkIn;
    delete tripJackPayload._checkOut;
    delete tripJackPayload._rooms;
    const response = await callTripJackPost<any>(tripJackPayload, '/hms/v3/hotel/review');
    const bookingId = normalizeHotelId(response?.bookingId);

    if (bookingId) {
      await upsertHotelBookingRecord(req, {
        tripjack_booking_id: bookingId,
        tenant_id: req.tenant!.id,
        created_by: req.user!.sub,
        hotel_id: normalizeHotelId(payload?.['hid'] || payload?.['hotelId'] || payload?.['hotel_id']) || bookingId,
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
    const body = payload && typeof payload === 'object' ? payload as Record<string, any> : {};
    const tripJackPayload: Record<string, any> = {
      bookingId: typeof body['bookingId'] === 'string' ? body['bookingId'].trim() : body['bookingId'],
      roomTravellerInfo: Array.isArray(body['roomTravellerInfo'])
        ? body['roomTravellerInfo'].map((room: any) => ({
          travellerInfo: Array.isArray(room?.['travellerInfo'])
            ? room['travellerInfo'].map((traveller: any) => ({
              ti: traveller?.ti,
              pt: traveller?.pt,
              fN: traveller?.fN,
              lN: traveller?.lN,
              ...(traveller?.pan ? { pan: traveller.pan } : {}),
              ...(traveller?.pNum ? { pNum: traveller.pNum } : {}),
            }))
            : [],
        }))
        : [],
      deliveryInfo: body['deliveryInfo'],
      type: 'HOTEL',
    };

    if (Array.isArray(body['paymentInfos'])) {
      tripJackPayload['paymentInfos'] = body['paymentInfos'];
    }
    if (body['gstInfo'] && typeof body['gstInfo'] === 'object') {
      tripJackPayload['gstInfo'] = {
        gstNumber: body['gstInfo']['gstNumber'],
        registeredName: body['gstInfo']['registeredName'],
      };
    }

    const logPayload = JSON.parse(JSON.stringify(tripJackPayload));
    for (const room of logPayload.roomTravellerInfo || []) {
      for (const traveller of room.travellerInfo || []) {
        if (traveller.pan) {
          traveller.pan = `${String(traveller.pan).slice(0, 2)}******${String(traveller.pan).slice(-1)}`;
        }
        if (traveller.pNum) {
          traveller.pNum = '********';
        }
      }
    }
    logPayload.deliveryInfo = 'masked';
    if (logPayload['gstInfo']) {
      logPayload['gstInfo'] = { gstNumber: 'masked', registeredName: 'masked' };
    }
    console.log('[TripJack][backend] /oms/v3/hotel/book payload', JSON.stringify(logPayload, null, 2));
    console.log('[TripJack][backend] outbound cURL', [
      "curl --location 'https://apitest-hotel-booker.tripjack.com/oms/v3/hotel/book'",
      "--header 'Content-Type: application/json'",
      "--header 'apikey: <API_KEY>'",
      `--data-raw '${JSON.stringify(tripJackPayload).replace(/'/g, "'\\''")}'`,
    ].join(' \\\n'));

    const response = await callTripJackBookingPost<any>(tripJackPayload, '/oms/v3/hotel/book');
    console.log('[TripJack][backend] /oms/v3/hotel/book response', JSON.stringify({
      bookingId: response?.bookingId,
      status: response?.status,
      error: response?.error,
    }, null, 2));
    return res.status(200).json(response);
  } catch (error) {
    return handleError(res, error, 'book');
  }
});

router.post('/booking-detail', async (req: Request, res: Response, _next: NextFunction): Promise<any> => {
  try {
    const bookingId = String(req.body?.['bookingId'] || '').trim();
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'bookingId is required',
      });
    }

    // The database is used only to confirm this booking belongs to the
    // authenticated tenant. All displayed details come from TripJack live.
    const storedBooking = await getHotelBookingById(req, bookingId);
    if (!storedBooking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    const bookingCreator = await prisma.user.findFirst({
      where: {
        id: storedBooking.created_by,
        tenantId: req.tenant!.id,
      },
      select: { email: true },
    });

    const response = await callTripJackBookingPost<any>(
      { bookingId: storedBooking.tripjack_booking_id },
      '/oms/v3/hotel/booking-details'
    );

    return res.status(200).json({
      ...response,
      _bookingMeta: {
        booking_id: storedBooking.booking_id,
        tripjack_booking_id: storedBooking.tripjack_booking_id,
        created_by: storedBooking.created_by,
        created_by_email: bookingCreator?.email || '',
      },
    });
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
    const storedBooking = await getHotelBookingById(req, bookingId);
    if (!storedBooking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    const response = await callTripJackBookingPost<any>({}, `/oms/v3/hotel/cancel-booking/${storedBooking.tripjack_booking_id}`);
    return res.status(200).json(response);
  } catch (error) {
    return handleError(res, error, 'cancel');
  }
});

router.get('/bookings', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query['limit']) || 20));
    const offset = Math.max(0, Number(req.query['offset']) || 0);
    const search = typeof req.query['search'] === 'string'
      ? req.query['search'].trim()
      : '';

    const listOptions: { limit: number; offset: number; search?: string } = {
      limit,
      offset,
    };
    if (search) listOptions.search = search;

    const result = await listHotelBookings(req, listOptions);

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
    const countryNames = Array.isArray(_req.body?.countryNames)
      ? _req.body.countryNames.filter((item: unknown): item is string => typeof item === 'string')
      : [];
    const currentState = await getHotelStaticSyncState();

    if (!countryNames.length && !isHotelStaticSyncDue(currentState)) {
      return res.status(200).json({
        success: true,
        data: {
          running: hotelSyncJobs.has(HOTEL_STATIC_SCHEMA),
          started: false,
          skipped: true,
          reason: 'Hotel static content was synced within the last 7 days',
        },
      });
    }

    const syncState = startHotelSyncBackground(HOTEL_STATIC_SCHEMA, { countryNames });
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

router.get('/content/sync-status', async (_req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const result = await getHotelStaticSyncState();
    return res.status(200).json({
      success: true,
      data: {
        ...result,
        running: hotelSyncJobs.has(HOTEL_STATIC_SCHEMA),
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
