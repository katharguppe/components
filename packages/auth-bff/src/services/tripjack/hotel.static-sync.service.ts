/**
 * TripJack Hotel Static Content Sync Service
 * Downloads static data from TripJack v3 content APIs and stores it locally
 * in the tenant schema.
 */

import { prisma } from '../../db/prisma';
import { toSchemaName, enableTripJackHotelStaticContentForTenant } from '../../db/tenant-provisioner';
import hotelService from './real-hotel.service';
import type {
  CityRegionItem,
  HotelContentItem,
  HotelMappingItem,
} from './hotel.interface';

export interface HotelStaticSyncResult {
  countriesSynced: number;
  cityRegionsSynced: number;
  hotelMappingsSynced: number;
  hotelContentSynced: number;
  deletedMappingsSynced: number;
  pagesProcessed: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function mapCountryRows(countries: string[]) {
  return countries.map((country) => ({ country_name: country }));
}

async function upsertCountries(schemaName: string, countries: string[]): Promise<number> {
  if (!countries.length) return 0;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schemaName}".tripjack_hotel_countries (country_name, source, synced_at)
     SELECT x.country_name, 'fetch-countries', NOW()
     FROM jsonb_to_recordset($1::jsonb) AS x(country_name text)
     ON CONFLICT (country_name) DO UPDATE
       SET source = EXCLUDED.source,
           synced_at = EXCLUDED.synced_at`,
    JSON.stringify(mapCountryRows(countries))
  );

  return countries.length;
}

async function upsertCityRegions(schemaName: string, rows: CityRegionItem[]): Promise<number> {
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
    `INSERT INTO "${schemaName}".tripjack_city_region_ids
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

async function upsertHotelMappings(schemaName: string, rows: HotelMappingItem[], countryName?: string, regionId?: string): Promise<number> {
  if (!rows.length) return 0;

  const payload = rows.map((row) => ({
    tj_hotel_id: row.tjHotelId,
    unica_id: row.unicaId,
    country_name: countryName ?? null,
    region_id: regionId && /^-?\d+$/.test(regionId) ? Number(regionId) : null,
  }));

  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schemaName}".tripjack_hotel_mappings
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
           country_name = EXCLUDED.country_name,
           region_id = EXCLUDED.region_id,
           source = EXCLUDED.source,
           synced_at = EXCLUDED.synced_at`,
    JSON.stringify(payload)
  );

  return rows.length;
}

async function fetchAllHotelMappings(params: {
  countryName?: string;
  regionIds?: string[];
}) : Promise<HotelMappingItem[]> {
  const hotelMappings: HotelMappingItem[] = [];
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

    if (!response.hotels?.length) {
      break;
    }
  }

  return hotelMappings;
}

async function upsertHotelContent(schemaName: string, rows: HotelContentItem[]): Promise<number> {
  if (!rows.length) return 0;

  const payload = rows.map((row) => ({
    tj_hotel_id: row.tjHotelId,
    unica_id: row.unicaId,
    name: row.name,
    is_active: row.is_active ?? null,
    star_rating: row.star_rating ?? null,
    property_type: row.property_type ?? null,
    locale: row.locale ?? null,
    policies: (row as any).policies ?? null,
    amenities: (row as any).amenities ?? null,
    images: (row as any).images ?? null,
    descriptions: (row as any).descriptions ?? null,
    raw_response: row,
  }));

  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schemaName}".tripjack_hotel_static_content
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

export async function syncHotelStaticContentForTenant(tenantSlug: string): Promise<HotelStaticSyncResult> {
  const schemaName = toSchemaName(tenantSlug);
  await enableTripJackHotelStaticContentForTenant(tenantSlug);

  const result: HotelStaticSyncResult = {
    countriesSynced: 0,
    cityRegionsSynced: 0,
    hotelMappingsSynced: 0,
    hotelContentSynced: 0,
    deletedMappingsSynced: 0,
    pagesProcessed: 0,
  };

  const countries = await hotelService.hotelCountries();
  result.countriesSynced = await upsertCountries(schemaName, countries.hotelCountries || []);

  let cursor: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const page = await hotelService.cityRegionIds(2000, cursor);
    const rows = page.hotelCityRegionIds || [];
    result.cityRegionsSynced += await upsertCityRegions(schemaName, rows);
    result.pagesProcessed += 1;
    cursor = page.nextCursor;
    hasMore = Boolean(cursor) && rows.length > 0;
  }

  const cityRegions = await prisma.$queryRaw<Array<{ city_region_id: string }>>`
    SELECT city_region_id::text AS city_region_id
    FROM "${schemaName}".tripjack_city_region_ids
  `;

  const regionIds = cityRegions.map((row) => row.city_region_id);
  const hotelIds = new Set<string>();

  for (const regionChunk of chunk(regionIds, 2000)) {
    const mappingRows = await fetchAllHotelMappings({ regionIds: regionChunk });
    result.hotelMappingsSynced += await upsertHotelMappings(
      schemaName,
      mappingRows,
      undefined,
      regionChunk.length === 1 ? regionChunk[0] : undefined
    );
    mappingRows.forEach((item) => hotelIds.add(item.tjHotelId));
  }

  for (const country of countries.hotelCountries || []) {
    const mappingRows = await fetchAllHotelMappings({ countryName: country });
    result.hotelMappingsSynced += await upsertHotelMappings(schemaName, mappingRows, country);
    mappingRows.forEach((item) => hotelIds.add(item.tjHotelId));
  }

  for (const hotelChunk of chunk(Array.from(hotelIds), 100)) {
    const content = await hotelService.hotelContent({ hotelIds: hotelChunk });
    result.hotelContentSynced += await upsertHotelContent(schemaName, content.hotels || []);
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schemaName}".tripjack_hotel_sync_state (sync_key, last_sync_at, last_cursor, last_page, last_mode, updated_at)
     VALUES ('static-full', NOW(), NULL, $1, 'FULL', NOW())
     ON CONFLICT (sync_key) DO UPDATE
       SET last_sync_at = EXCLUDED.last_sync_at,
           last_cursor = EXCLUDED.last_cursor,
           last_page = EXCLUDED.last_page,
           last_mode = EXCLUDED.last_mode,
           updated_at = EXCLUDED.updated_at`,
    result.pagesProcessed
  );

  return result;
}

export default {
  syncHotelStaticContentForTenant,
};
