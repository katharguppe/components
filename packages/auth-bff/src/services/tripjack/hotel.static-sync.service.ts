import fs from 'fs';
import path from 'path';
import { prisma } from '../../db/prisma';
import { createHotelService } from './hotel.service.factory';

const HOTEL_STATIC_SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const HOTEL_CONTENT_BATCH_SIZE = 25;
const HOTEL_STATIC_SCHEMA = 'public';
const TRIPJACK_HOTEL_STATIC_SQL = path.resolve(
  __dirname,
  '../../../../../db/migrations/public/007_tripjack_hotel_static_content.sql'
);

function tableName(schemaName: string, table: string): string {
  return `"${schemaName}".${table}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function ensureGlobalTripJackHotelStaticContent(): Promise<void> {
  if (!fs.existsSync(TRIPJACK_HOTEL_STATIC_SQL)) {
    throw new Error(`TripJack hotel static-content migration file not found: ${TRIPJACK_HOTEL_STATIC_SQL}`);
  }

  const migrationSql = fs.readFileSync(TRIPJACK_HOTEL_STATIC_SQL, 'utf8');
  const statements = migrationSql
    .split(/;\s*\n/)
    .map((stmt) => stmt.trim())
    .filter(Boolean);

  if (statements.length === 0) {
    throw new Error('TripJack hotel static-content migration file is empty or contains no statements');
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      `tripjack_hotel_static_content:${HOTEL_STATIC_SCHEMA}`
    );

    const existing = await tx.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM   information_schema.tables
        WHERE  table_schema = ${HOTEL_STATIC_SCHEMA}
          AND  table_name   = 'tripjack_hotel_static_content'
      ) AS exists
    `;

    if (existing[0]?.exists) {
      return;
    }

    for (const stmt of statements) {
      await tx.$executeRawUnsafe(stmt);
    }
  });
}

async function clearHotelStaticContent(
  countryNames?: string[]
): Promise<void> {
  if (!countryNames?.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_static_content')}`
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_mappings')}`
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_city_region_ids')}`
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_countries')}`
    );
    return;
  }

  const payload = JSON.stringify(
    countryNames.map((country_name) => ({ country_name }))
  );

  await prisma.$executeRawUnsafe(
    `DELETE FROM ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_static_content')} s
     USING ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_mappings')} m,
           jsonb_to_recordset($1::jsonb) AS x(country_name text)
     WHERE s.tj_hotel_id = m.tj_hotel_id
       AND LOWER(COALESCE(m.country_name, '')) = LOWER(x.country_name)`,
    payload
  );

  await prisma.$executeRawUnsafe(
    `DELETE FROM ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_mappings')} m
     USING jsonb_to_recordset($1::jsonb) AS x(country_name text)
     WHERE LOWER(COALESCE(m.country_name, '')) = LOWER(x.country_name)`,
    payload
  );

  await prisma.$executeRawUnsafe(
    `DELETE FROM ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_city_region_ids')} r
     USING jsonb_to_recordset($1::jsonb) AS x(country_name text)
     WHERE LOWER(COALESCE(r.country_name, '')) = LOWER(x.country_name)`,
    payload
  );

  await prisma.$executeRawUnsafe(
    `DELETE FROM ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_countries')} c
     USING jsonb_to_recordset($1::jsonb) AS x(country_name text)
     WHERE LOWER(COALESCE(c.country_name, '')) = LOWER(x.country_name)`,
    payload
  );
}

async function upsertCountries(schemaName: string, countries: string[]): Promise<number> {
  if (!countries.length) return 0;

  await prisma.$executeRawUnsafe(
    `INSERT INTO ${tableName(schemaName, 'tripjack_hotel_countries')} (country_name, source, synced_at)
     SELECT x.country_name, 'fetch-countries', NOW()
     FROM jsonb_to_recordset($1::jsonb) AS x(country_name text)
     ON CONFLICT (country_name) DO UPDATE
       SET source = EXCLUDED.source,
           synced_at = EXCLUDED.synced_at`,
    JSON.stringify(countries.map((country) => ({ country_name: country })))
  );

  return countries.length;
}

async function upsertCityRegions(
  schemaName: string,
  rows: Array<{
    cityName: string;
    cityRegionId: number;
    regionName: string;
    countryName: string;
    regionType: string;
    fullRegionName: string;
  }>
): Promise<number> {
  if (!rows.length) return 0;

  const payload = rows.map((row) => ({
    city_region_id: row.cityRegionId,
    city_name: row.cityName,
    region_name: row.regionName,
    country_name: row.countryName,
    region_type: row.regionType,
    full_region_name: row.fullRegionName,
  }));

  await prisma.$executeRawUnsafe(
    `INSERT INTO ${tableName(schemaName, 'tripjack_city_region_ids')}
      (city_region_id, city_name, region_name, country_name, region_type, full_region_name, source, synced_at)
     SELECT x.city_region_id, x.city_name, x.region_name, x.country_name, x.region_type, x.full_region_name, 'fetch-city-regionIds', NOW()
     FROM jsonb_to_recordset($1::jsonb) AS x(
       city_region_id bigint,
       city_name text,
       region_name text,
       country_name text,
       region_type text,
       full_region_name text
     )
     ON CONFLICT (city_region_id) DO UPDATE
       SET city_name = EXCLUDED.city_name,
           region_name = EXCLUDED.region_name,
           country_name = EXCLUDED.country_name,
           region_type = EXCLUDED.region_type,
           full_region_name = EXCLUDED.full_region_name,
           source = EXCLUDED.source,
           synced_at = EXCLUDED.synced_at`,
    JSON.stringify(payload)
  );

  return rows.length;
}

async function upsertHotelMappings(
  rows: Array<{ tjHotelId: string; unicaId: string }>,
  countryName?: string,
  regionId?: string
): Promise<number> {
  if (!rows.length) return 0;

  const payload = rows.map((row) => ({
    tj_hotel_id: row.tjHotelId,
    unica_id: row.unicaId,
    country_name: countryName ?? null,
    region_id: regionId && /^-?\d+$/.test(regionId) ? Number(regionId) : null,
  }));

  await prisma.$executeRawUnsafe(
    `INSERT INTO ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_mappings')}
      (tj_hotel_id, unica_id, country_name, region_id, source, synced_at)
     SELECT x.tj_hotel_id, x.unica_id, x.country_name, x.region_id, 'fetch-hotel-mapping', NOW()
     FROM jsonb_to_recordset($1::jsonb) AS x(
       tj_hotel_id text,
       unica_id text,
       country_name text,
       region_id bigint
     )
     ON CONFLICT (tj_hotel_id) DO UPDATE
       SET unica_id = EXCLUDED.unica_id,
           country_name = COALESCE(EXCLUDED.country_name, ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_mappings')}.country_name),
           region_id = COALESCE(EXCLUDED.region_id, ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_mappings')}.region_id),
           source = EXCLUDED.source,
           synced_at = EXCLUDED.synced_at`,
    JSON.stringify(payload)
  );

  return rows.length;
}

async function fetchAllHotelMappings(
  hotelService: ReturnType<typeof createHotelService>,
  params: { countryName?: string; regionIds?: string[] }
): Promise<Array<{ tjHotelId: string; unicaId: string }>> {
  const hotelMappings: Array<{ tjHotelId: string; unicaId: string }> = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages) {
    const response = await hotelService.hotelMapping({
      countryName: params.countryName,
      regionIds: params.regionIds,
      page,
      size: 2000,
    });

    hotelMappings.push(...(response.hotels || []));
    totalPages = response.pageable?.totalPages || 0;
    page += 1;

    if (!response.hotels?.length) break;
  }

  return hotelMappings;
}

async function upsertHotelContent(_schemaName: string, rows: Array<any>): Promise<number> {
  if (!rows.length) return 0;

  const payload = rows.map((row) => ({
    tj_hotel_id: row.tjHotelId,
    unica_id: row.unicaId,
    name: row.name,
    is_active: row.is_active ?? null,
    star_rating: row.star_rating ?? null,
    property_type: row.property_type ?? null,
    locale: row.locale ?? null,
    policies: row.policies ?? null,
    amenities: row.amenities ?? null,
    images: row.images ?? null,
    descriptions: row.descriptions ?? null,
    raw_response: row,
  }));

  await prisma.$executeRawUnsafe(
    `INSERT INTO ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_static_content')}
      (tj_hotel_id, unica_id, name, is_active, star_rating, property_type, locale, policies, amenities, images, descriptions, raw_response, synced_at)
     SELECT x.tj_hotel_id, x.unica_id, x.name, x.is_active, x.star_rating, x.property_type, x.locale, x.policies, x.amenities, x.images, x.descriptions, x.raw_response, NOW()
     FROM jsonb_to_recordset($1::jsonb) AS x(
       tj_hotel_id text,
       unica_id text,
       name text,
       is_active boolean,
       star_rating text,
       property_type jsonb,
       locale jsonb,
       policies jsonb,
       amenities jsonb,
       images jsonb,
       descriptions jsonb,
       raw_response jsonb
     )
     ON CONFLICT (tj_hotel_id) DO UPDATE
       SET unica_id = EXCLUDED.unica_id,
           name = EXCLUDED.name,
           is_active = EXCLUDED.is_active,
           star_rating = EXCLUDED.star_rating,
           property_type = EXCLUDED.property_type,
           locale = EXCLUDED.locale,
           policies = EXCLUDED.policies,
           amenities = EXCLUDED.amenities,
           images = EXCLUDED.images,
           descriptions = EXCLUDED.descriptions,
           raw_response = EXCLUDED.raw_response,
           synced_at = EXCLUDED.synced_at`,
    JSON.stringify(payload)
  );

  return rows.length;
}

async function upsertSyncStateCheckpoint(params: {
  mode: string;
  page?: number | null;
  cursor?: string | null;
  completed?: boolean;
}) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_sync_state')} (sync_key, last_sync_at, last_cursor, last_page, last_mode, updated_at)
     VALUES ('static-full', ${params.completed ? 'NOW()' : 'NULL'}, $1, $2, $3, NOW())
     ON CONFLICT (sync_key) DO UPDATE
       SET last_sync_at = CASE
             WHEN EXCLUDED.last_sync_at IS NULL THEN ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_sync_state')}.last_sync_at
             ELSE EXCLUDED.last_sync_at
           END,
           last_cursor = EXCLUDED.last_cursor,
           last_page = EXCLUDED.last_page,
           last_mode = EXCLUDED.last_mode,
           updated_at = EXCLUDED.updated_at`,
    params.cursor ?? null,
    params.page ?? null,
    params.mode
  );
}

export async function syncHotelStaticContent(
  options: { countryNames?: string[] } = {}
) {
  const hotelService = createHotelService();

  await ensureGlobalTripJackHotelStaticContent();
  await clearHotelStaticContent(options.countryNames);

  const result = {
    countriesSynced: 0,
    cityRegionsSynced: 0,
    hotelMappingsSynced: 0,
    hotelContentSynced: 0,
    deletedMappingsSynced: 0,
    pagesProcessed: 0,
  };

  const countries = await hotelService.hotelCountries();
  const requestedCountries = (options?.countryNames || [])
    .map((country) => country.trim())
    .filter(Boolean);
  const requestedCountryLookup = new Set(
    requestedCountries.map((country) => country.toLowerCase())
  );
  const countriesToSync =
    requestedCountries.length > 0
      ? (countries.hotelCountries || []).filter((country) => requestedCountries.includes(country))
      : countries.hotelCountries || [];

  result.countriesSynced = await upsertCountries(HOTEL_STATIC_SCHEMA, countriesToSync);
  await upsertSyncStateCheckpoint({ mode: 'COUNTRIES', page: 0, cursor: null, completed: false });

  let cursor: string | undefined;
  let hasMore = true;
  const allowedCountryLookup =
    requestedCountries.length > 0 ? requestedCountryLookup : null;
  const syncedRegionIds = new Set<string>();
  while (hasMore) {
    const page = await hotelService.cityRegionIds(2000, cursor);
    const pageRows = page.hotelCityRegionIds || [];
    const rows = pageRows.filter((row) => {
      if (!allowedCountryLookup) return true;
      const countryName = String(row.countryName || '').trim().toLowerCase();
      return allowedCountryLookup.has(countryName);
    });

    result.cityRegionsSynced += await upsertCityRegions(HOTEL_STATIC_SCHEMA, rows);
    rows.forEach((row) => {
      if (row.cityRegionId != null) {
        syncedRegionIds.add(String(row.cityRegionId));
      }
    });
    result.pagesProcessed += 1;
    cursor = page.nextCursor;
    hasMore = Boolean(cursor) && pageRows.length > 0;
    await upsertSyncStateCheckpoint({
      mode: 'REGIONS',
      page: result.pagesProcessed,
      cursor: cursor ?? null,
      completed: false,
    });
  }
  const cityRegions = syncedRegionIds.size
    ? Array.from(syncedRegionIds).map((cityRegionId) => ({ city_region_id: cityRegionId }))
    : await prisma.$queryRawUnsafe<Array<{ city_region_id: string }>>(
        `SELECT city_region_id::text AS city_region_id
         FROM ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_city_region_ids')}`
      );
  const hotelIds = new Set<string>();

  for (const regionId of cityRegions.map((row) => row.city_region_id)) {
    const mappingRows = await fetchAllHotelMappings(hotelService, { regionIds: [regionId] });
    result.hotelMappingsSynced += await upsertHotelMappings(mappingRows, undefined, regionId);
    mappingRows.forEach((item) => hotelIds.add(item.tjHotelId));
  }

  for (const country of countriesToSync) {
    const mappingRows = await fetchAllHotelMappings(hotelService, { countryName: country });
    result.hotelMappingsSynced += await upsertHotelMappings(mappingRows, country);
    mappingRows.forEach((item) => hotelIds.add(item.tjHotelId));
  }
  await upsertSyncStateCheckpoint({ mode: 'MAPPINGS', page: null, cursor: null, completed: false });

  const hotelIdChunks = chunk(Array.from(hotelIds), HOTEL_CONTENT_BATCH_SIZE);
  let hotelContentPage = 0;
  for (const hotelChunk of hotelIdChunks) {
    hotelContentPage += 1;
    const content = await hotelService.hotelContent({ hotelIds: hotelChunk });
    result.hotelContentSynced += await upsertHotelContent(HOTEL_STATIC_SCHEMA, content.hotels || []);
    await upsertSyncStateCheckpoint({
      mode: 'CONTENT',
      page: hotelContentPage,
      cursor: hotelChunk[hotelChunk.length - 1] || null,
      completed: false,
    });
  }
  await upsertSyncStateCheckpoint({
    mode: 'FULL',
    page: result.pagesProcessed,
    cursor: null,
    completed: true,
  });

  return result;
}

export async function getHotelStaticSyncState() {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      sync_key: string;
      last_sync_at: Date | string | null;
      last_cursor: string | null;
      last_page: number | null;
      last_mode: string | null;
      updated_at: Date | string | null;
    }>>(
      `SELECT sync_key, last_sync_at, last_cursor, last_page, last_mode, updated_at
       FROM ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_sync_state')}
       WHERE sync_key = 'static-full'
       LIMIT 1`
    );

    const row = rows[0] || null;
    const lastSyncAt = row?.last_sync_at ? new Date(row.last_sync_at) : null;
    const updatedAt = row?.updated_at ? new Date(row.updated_at) : null;
    const referenceTime = lastSyncAt || updatedAt;
    const ageMs = referenceTime ? Date.now() - referenceTime.getTime() : null;
    const needsSync = ageMs === null ? true : ageMs >= HOTEL_STATIC_SYNC_INTERVAL_MS;
    const isComplete = row?.last_mode === 'FULL' && Boolean(row?.last_sync_at);

    return {
      syncKey: row?.sync_key || 'static-full',
      lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
      lastCursor: row?.last_cursor || null,
      lastPage: row?.last_page ?? null,
      lastMode: row?.last_mode || null,
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
      syncIntervalDays: 7,
      needsSync,
      isComplete,
    };
  } catch (error) {
    console.error('[TripJackHotelSync] read status failed', { schemaName: HOTEL_STATIC_SCHEMA, error });

    return {
      syncKey: 'static-full',
      lastSyncAt: null,
      lastCursor: null,
      lastPage: null,
      lastMode: null,
      updatedAt: null,
      syncIntervalDays: 7,
      needsSync: true,
      isComplete: false,
    };
  }
}

export async function getSyncedHotelCountries() {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      country_name: string;
      hotels_synced: number;
      hotels_synced_total: number;
      synced_at: Date | string | null;
    }>>(
      `SELECT
         m.country_name,
         COUNT(*)::int AS hotels_synced,
         SUM(COUNT(*)) OVER ()::int AS hotels_synced_total,
         MAX(COALESCE(s.synced_at, m.synced_at)) AS synced_at
       FROM ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_mappings')} m
       INNER JOIN ${tableName(HOTEL_STATIC_SCHEMA, 'tripjack_hotel_static_content')} s
         ON s.tj_hotel_id = m.tj_hotel_id
       WHERE COALESCE(m.country_name, '') <> ''
       GROUP BY m.country_name
       ORDER BY synced_at DESC, m.country_name ASC`
    );

    return {
      countries: rows.map((row) => ({
        countryName: row.country_name,
        hotelsSynced: row.hotels_synced,
        syncedAt: row.synced_at ? new Date(row.synced_at).toISOString() : null,
      })),
      hotelsSyncedTotal: rows[0]?.hotels_synced_total || 0,
      total: rows.length,
    };
  } catch (error) {
    console.error('[TripJackHotelSync] read synced countries failed', { schemaName: HOTEL_STATIC_SCHEMA, error });
    return {
      countries: [] as Array<{ countryName: string; hotelsSynced: number; syncedAt: string | null }>,
      hotelsSyncedTotal: 0,
      total: 0,
    };
  }
}

export default {
  syncHotelStaticContent,
  getHotelStaticSyncState,
  getSyncedHotelCountries,
};
