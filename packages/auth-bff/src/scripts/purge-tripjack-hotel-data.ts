import { prisma } from '../db/prisma';
import { toSchemaName } from '../db/tenant-provisioner';

const HOTEL_TABLES = [
  'tripjack_hotel_static_content',
  'tripjack_hotel_mappings',
  'tripjack_city_region_ids',
  'tripjack_hotel_countries',
  'tripjack_hotel_sync_state',
] as const;

async function tableExists(schemaName: string, tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
    ) AS exists`,
    schemaName,
    tableName,
  );

  return Boolean(rows[0]?.exists);
}

async function purgeTenantHotelData(tenantSlug: string): Promise<void> {
  const schemaName = toSchemaName(tenantSlug);
  console.info('[TripJackHotelPurge] tenant purge started', { tenantSlug, schemaName });

  for (const tableName of HOTEL_TABLES) {
    const exists = await tableExists(schemaName, tableName);
    if (!exists) {
      console.info('[TripJackHotelPurge] skipped missing table', { tenantSlug, schemaName, tableName });
      continue;
    }

    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM "${schemaName}".${tableName}`
    );
    console.info('[TripJackHotelPurge] table cleared', {
      tenantSlug,
      schemaName,
      tableName,
      result,
    });
  }

  console.info('[TripJackHotelPurge] tenant purge completed', { tenantSlug, schemaName });
}

async function main() {
  console.info('[TripJackHotelPurge] loading tenant list');
  const tenants = await prisma.tenant.findMany({
    select: { slug: true },
    orderBy: { slug: 'asc' },
  });

  console.info('[TripJackHotelPurge] tenants found', { total: tenants.length });

  for (const tenant of tenants) {
    await purgeTenantHotelData(tenant.slug);
  }

  console.info('[TripJackHotelPurge] all tenant hotel data removed');
}

main()
  .catch((error) => {
    console.error('[TripJackHotelPurge] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
