import type { EconomicDataPoint, EconomicDataProvider } from '@shared/types';
import { AnalysisService } from '@/modules/analysis/application/analysis.service';
import { CachedEconomicDataProvider } from '@/modules/analysis/infrastructure/economic/cached-economic-data.provider';
import { InMemoryEconomicDataCacheRepository } from '@/modules/analysis/infrastructure/economic/economic-data.repository';
import {
  CALIBRATED_CPI,
  lastCompletePeriod,
  MockGastatProvider,
} from '@/modules/analysis/infrastructure/economic/mock-gastat.provider';
import { ApiError } from '@/shared/http/api-error';
import { aUserFinancialData, FakeAnalysisRepository, FakeSimahProvider } from '../fakes';

const GASTAT_CPI: EconomicDataPoint = {
  indicator: 'cpi',
  value: 0.02,
  source: 'GASTAT',
  period: '2026-05',
};

const USER_ID = '11111111-1111-4111-8111-111111111111';

function serviceWith(economic: EconomicDataProvider) {
  const repository = new FakeAnalysisRepository();
  const service = new AnalysisService(economic, repository, {
    locale: 'en',
    now: () => new Date('2026-05-01T00:00:00.000Z'),
  });
  return { service, repository };
}

describe('EconomicDataProvider — the GASTAT mock', () => {
  it('serves the calibrated ~2.0% CPI', async () => {
    const point = await new MockGastatProvider().getLatest('cpi');

    expect(point.value).toBe(0.02);
    expect(CALIBRATED_CPI).toBe(0.02);
    expect(point.indicator).toBe('cpi');
  });

  it('says out loud that it is a mock — a result must never claim official data it does not have', async () => {
    const point = await new MockGastatProvider().getLatest('cpi');
    expect(point.source).toContain('mock');
  });

  it('reports the last COMPLETE month — this month has not been published yet', () => {
    expect(lastCompletePeriod(new Date('2026-06-15T00:00:00Z'))).toBe('2026-05');
    expect(lastCompletePeriod(new Date('2026-01-05T00:00:00Z'))).toBe('2025-12');
  });
});

describe('the economic-data cache', () => {
  it('serves a fresh cached value without calling the source at all', async () => {
    const cache = new InMemoryEconomicDataCacheRepository();
    await cache.save(GASTAT_CPI);

    const source: EconomicDataProvider = {
      getLatest: jest.fn().mockRejectedValue(new Error('must not be called')),
    };

    const provider = new CachedEconomicDataProvider(source, cache);
    expect((await provider.getLatest('cpi')).value).toBe(0.02);
    expect(source.getLatest).not.toHaveBeenCalled();
  });

  it('fetches and writes through when the cache is empty', async () => {
    const cache = new InMemoryEconomicDataCacheRepository();
    const provider = new CachedEconomicDataProvider(new MockGastatProvider(), cache);

    const point = await provider.getLatest('cpi');

    expect(point.value).toBe(0.02);
    expect(await cache.findLatest('cpi')).toBeDefined();
  });

  /**
   * The requirement from Scope §9 and §11.2, stated as a test: GASTAT being down must never stop
   * a user mid-decision. A CPI figure a few weeks stale is a rounding error in a 5-year
   * projection; an error page is a product failure.
   */
  it('serves a STALE value when the source is down, rather than failing the user', async () => {
    const cache = new InMemoryEconomicDataCacheRepository([
      { point: GASTAT_CPI, fetchedAt: new Date('2020-01-01T00:00:00Z') }, // ancient
    ]);

    const brokenGastat: EconomicDataProvider = {
      getLatest: jest.fn().mockRejectedValue(new Error('GASTAT is down')),
    };

    const provider = new CachedEconomicDataProvider(brokenGastat, cache);
    const point = await provider.getLatest('cpi');

    expect(brokenGastat.getLatest).toHaveBeenCalled(); // it tried
    expect(point.value).toBe(0.02); // and fell back rather than throwing
  });

  it('fails honestly when the source is down AND there is nothing cached', async () => {
    const brokenGastat: EconomicDataProvider = {
      getLatest: jest.fn().mockRejectedValue(new Error('GASTAT is down')),
    };

    const provider = new CachedEconomicDataProvider(
      brokenGastat,
      new InMemoryEconomicDataCacheRepository(),
    );

    await expect(provider.getLatest('cpi')).rejects.toThrow('GASTAT is down');
  });
});

describe('AnalysisService', () => {
  it('persists the input, the analysis, and its full provenance', async () => {
    const { service, repository } = serviceWith(new MockGastatProvider());

    const { analysisId, result } = await service.run({
      userId: USER_ID,
      input: aUserFinancialData(),
    });

    expect(analysisId).toBeDefined();
    expect(repository.inputs.size).toBe(1);
    expect(repository.saved).toHaveLength(1);

    const saved = repository.saved[0]!;
    expect(saved.userId).toBe(USER_ID);
    expect(saved.apr).toBe(0.06);
    expect(saved.result.provenance.ruleVersion).toBe('SAMA-2018-05');
    expect(saved.result.provenance.inflationValue).toBe(0.02);
    expect(saved.result.provenance.inflationSource).toContain('GASTAT');
    expect(saved.result.provenance.computedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(result.provenance.assumptions).toEqual({ salaryGrowth: 0.02, inflation: 0.02 });
  });

  it('replays a stored analysis verbatim — never recomputes it under today\'s rules', async () => {
    const { service } = serviceWith(new MockGastatProvider());
    const { analysisId, result } = await service.run({ userId: USER_ID, input: aUserFinancialData() });

    const fetched = await service.getById(USER_ID, analysisId);

    expect(fetched.result).toEqual(result);
  });

  it('refuses to hand one user another user\'s analysis', async () => {
    const { service } = serviceWith(new MockGastatProvider());
    const { analysisId } = await service.run({ userId: USER_ID, input: aUserFinancialData() });

    await expect(service.getById('22222222-2222-4222-8222-222222222222', analysisId)).rejects.toThrow(
      ApiError,
    );
  });

  it('blocks the analysis when expenses already exceed income (§10.6), and explains why', async () => {
    const { service, repository } = serviceWith(new MockGastatProvider());

    const run = service.run({
      userId: USER_ID,
      input: aUserFinancialData({ grossSalary: 5_000, monthlyExpenses: 6_000 }),
    });

    await expect(run).rejects.toMatchObject({ status: 422, code: 'analysis_blocked' });
    // And nothing was written — a blocked analysis leaves no half-record behind.
    expect(repository.saved).toHaveLength(0);
  });

  it('carries non-blocking warnings alongside a real result', async () => {
    const { service } = serviceWith(new MockGastatProvider());

    const { warnings, result } = await service.run({
      userId: USER_ID,
      input: aUserFinancialData({ tenureYears: 0 }),
    });

    expect(result).toBeDefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('tenure');
  });

  it('analyses a previously persisted input by id — the chatbot handoff', async () => {
    const { service, repository } = serviceWith(new MockGastatProvider());
    const { id } = await repository.createFinancialInput(USER_ID, aUserFinancialData(), 'chatbot');

    const { result } = await service.run({ userId: USER_ID, financialInputId: id });

    expect(result.requestedDbr).toBeGreaterThan(0);
    // Reused the existing input rather than duplicating it.
    expect(repository.inputs.size).toBe(1);
  });

  it('honours a real APR when the user has an actual offer in hand', async () => {
    const { service, repository } = serviceWith(new MockGastatProvider());

    await service.run({ userId: USER_ID, input: aUserFinancialData(), apr: 0.035 });

    expect(repository.saved[0]!.apr).toBe(0.035);
  });

  it('exposes the SAMA red lines for the UI to show the user', () => {
    const { service } = serviceWith(new MockGastatProvider());
    const { rules, thresholds } = service.currentRules();

    expect(rules.version).toBe('SAMA-2018-05');
    expect(thresholds).toEqual({ safeMax: 0.25, cautionMax: 0.3333 });
  });
});

describe('AnalysisService — SIMAH data source', () => {
  function serviceWithSimah(opts: { enabled: boolean; gosiEnabled?: boolean }) {
    const repository = new FakeAnalysisRepository();
    const simah = new FakeSimahProvider();
    const service = new AnalysisService(new MockGastatProvider(), repository, {
      locale: 'en',
      now: () => new Date('2026-05-01T00:00:00.000Z'),
      simah,
      isSimahEnabled: async () => opts.enabled,
      isGosiEnabled: async () => opts.gosiEnabled ?? false,
    });
    return { service, repository, simah };
  }

  it('uses the manual figures and marks them "manual" while the flag is OFF', async () => {
    const { service, repository, simah } = serviceWithSimah({ enabled: false });

    const { result, input } = await service.run({
      userId: USER_ID,
      input: aUserFinancialData({ grossSalary: 12_000, existingCommitments: 0 }),
    });

    expect(simah.calls).toHaveLength(0); // the bureau was never consulted
    // The effective input is the manual declaration, untouched.
    expect(input.grossSalary).toBe(12_000);
    expect(input.existingCommitments).toBe(0);
    expect(result.provenance.dataSources).toEqual({
      existingCommitments: 'manual',
      grossSalary: 'manual',
    });
    // Persisted provenance mirrors it.
    expect(repository.saved[0]!.result.provenance.dataSources.grossSalary).toBe('manual');
  });

  it('replaces salary and commitments with the verified figures when the flag is ON', async () => {
    const { service, simah } = serviceWithSimah({ enabled: true });

    const { result, input } = await service.run({
      userId: USER_ID,
      // Manual values the bureau will override: 12,000 salary / 0 commitments.
      input: aUserFinancialData({ grossSalary: 12_000, existingCommitments: 0 }),
    });

    expect(simah.calls).toHaveLength(1);
    expect(simah.calls[0]!.userId).toBe(USER_ID);
    // The EFFECTIVE input returned to the caller carries the verified figures, not the manual ones,
    // so the composition views on the page never disagree with the DBR.
    expect(input.grossSalary).toBe(14_500);
    expect(input.existingCommitments).toBe(1_850);
    expect(result.provenance.dataSources).toEqual({
      existingCommitments: 'simah',
      grossSalary: 'simah',
      simah: {
        referenceId: 'SMH-TEST00000',
        creditScore: 720,
        reportGeneratedAt: '2026-05-01T00:00:00.000Z',
        source: 'SIMAH (mock)',
      },
    });
    // The DBR reflects the VERIFIED salary + commitments (1,850 on 14,500), not the manual zeros.
    expect(result.requestedDbr).toBeGreaterThan(0.1);
  });

  it('stamps the SIMAH reference and score onto the persisted analysis for audit', async () => {
    const { service, repository } = serviceWithSimah({ enabled: true });
    await service.run({ userId: USER_ID, input: aUserFinancialData() });

    const saved = repository.saved[0]!.result.provenance.dataSources.simah;
    expect(saved?.referenceId).toBe('SMH-TEST00000');
    expect(saved?.creditScore).toBe(720);
  });

  // Source ownership (locked): GOSI is authoritative for salary; SIMAH for obligations.
  // SIMAH's salary is a fallback only, used when GOSI is unavailable.
  it('keeps GOSI salary and takes only obligations from SIMAH when both flags are ON', async () => {
    const { service, simah } = serviceWithSimah({ enabled: true, gosiEnabled: true });

    const { result, input } = await service.run({
      userId: USER_ID,
      // grossSalary here stands for GOSI's already-pulled value; SIMAH's 14,500 must NOT win.
      input: aUserFinancialData({ grossSalary: 15_000, existingCommitments: 0 }),
    });

    expect(simah.calls).toHaveLength(1); // still consulted — for obligations
    expect(input.grossSalary).toBe(15_000); // GOSI wins; SIMAH salary ignored
    expect(input.existingCommitments).toBe(1_850); // SIMAH authoritative for obligations
    expect(result.provenance.dataSources.grossSalary).toBe('gosi');
    expect(result.provenance.dataSources.existingCommitments).toBe('simah');
  });

  it('marks salary "gosi" and never consults SIMAH when only gosi_income is on', async () => {
    const { service, simah } = serviceWithSimah({ enabled: false, gosiEnabled: true });

    const { result, input } = await service.run({
      userId: USER_ID,
      input: aUserFinancialData({ grossSalary: 15_000, existingCommitments: 900 }),
    });

    expect(simah.calls).toHaveLength(0);
    expect(input.grossSalary).toBe(15_000);
    expect(result.provenance.dataSources.grossSalary).toBe('gosi');
    expect(result.provenance.dataSources.existingCommitments).toBe('manual');
  });

  it('leaves everything manual when no SIMAH provider is wired at all', async () => {
    const repository = new FakeAnalysisRepository();
    const service = new AnalysisService(new MockGastatProvider(), repository, {
      locale: 'en',
      now: () => new Date('2026-05-01T00:00:00.000Z'),
      isSimahEnabled: async () => true, // flag on, but no provider — must not fabricate data
    });

    const { result } = await service.run({ userId: USER_ID, input: aUserFinancialData() });
    expect(result.provenance.dataSources.grossSalary).toBe('manual');
  });
});
