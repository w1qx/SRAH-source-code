/**
 * Flip feature flags without a deploy — the operational way (there is no write API by design).
 *
 *   npx tsx scripts/set-flags.ts                          # list all flags and their state
 *   npx tsx scripts/set-flags.ts gosi_income=on simah_credit=on
 *   npx tsx scripts/set-flags.ts gosi_income=off
 *
 * Note: the backend caches flags for ~15s, so a flip takes up to 15 seconds to take effect on a
 * running server (or restart it). The frontend re-reads flags on each visit to the searching
 * screen, so entering the flow after the cache refreshes shows the new behavior.
 */
import { prisma } from '../src/db/prisma';
import { FEATURE_FLAG_DEFAULTS } from '../src/modules/feature-flags/domain/flag-catalog';

function describe(key: string): string {
  return FEATURE_FLAG_DEFAULTS.find((f) => f.key === key)?.description ?? key;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const flags = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    // eslint-disable-next-line no-console
    console.table(flags.map((f) => ({ key: f.key, enabled: f.enabled })));
    return;
  }

  for (const arg of args) {
    const [key, state] = arg.split('=');
    if (!key || state === undefined) {
      throw new Error(`Bad argument "${arg}". Use key=on or key=off.`);
    }
    const enabled = state === 'on' || state === 'true' || state === '1';
    await prisma.featureFlag.upsert({
      where: { key },
      update: { enabled },
      create: { key, enabled, description: describe(key) },
    });
    // eslint-disable-next-line no-console
    console.log(`${key} → ${enabled ? 'ON' : 'OFF'}`);
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
