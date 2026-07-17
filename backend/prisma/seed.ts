/**
 * Seed: the feature-flag catalog + the current GASTAT CPI figure.
 *
 * Idempotent — run it as often as you like. It never overwrites a flag an operator has
 * deliberately flipped, and it never overwrites a CPI figure that was ingested from the real
 * source with the calibrated mock's value.
 */
// The Prisma CLI loads .env for us; `tsx prisma/seed.ts` does not. Without this, the seed cannot
// find DATABASE_URL even though `prisma migrate` just used it.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { FEATURE_FLAG_DEFAULTS } from '../src/modules/feature-flags/domain/flag-catalog';
import {
  CALIBRATED_CPI,
  lastCompletePeriod,
  MOCK_CPI_SOURCE,
} from '../src/modules/analysis/infrastructure/economic/mock-gastat.provider';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const flag of FEATURE_FLAG_DEFAULTS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: { description: flag.description }, // Never touch `enabled` on an existing row.
      create: { key: flag.key, enabled: flag.enabled, description: flag.description },
    });
  }
  console.log(`Seeded ${FEATURE_FLAG_DEFAULTS.length} feature flags (all off).`);

  const period = lastCompletePeriod(new Date());
  const existing = await prisma.economicDataCache.findUnique({
    where: { indicator_period: { indicator: 'cpi', period } },
  });

  if (existing) {
    console.log(`CPI for ${period} already cached (${existing.source}) — left untouched.`);
  } else {
    await prisma.economicDataCache.create({
      data: {
        indicator: 'cpi',
        value: CALIBRATED_CPI,
        period,
        source: MOCK_CPI_SOURCE,
      },
    });
    console.log(`Seeded CPI ${CALIBRATED_CPI * 100}% for ${period} (${MOCK_CPI_SOURCE}).`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
