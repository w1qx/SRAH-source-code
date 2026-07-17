import type {
  AnalysisResult,
  EconomicDataProvider,
  FinancialDataProvenance,
  SamaRuleSet,
  SimahProvider,
  UserFinancialData,
} from '@shared/types';
import { ApiError } from '@/shared/http/api-error';
import { logger } from '@/shared/logger';
import type { AnalysisRepository, PersistedAnalysis } from '../infrastructure/analysis.repository';
import type { EngineAssumptions } from '../domain/assumptions';
import { DEFAULT_ASSUMPTIONS } from '../domain/assumptions';
import type { MessageLocale } from '../domain/messages';
import { DEFAULT_LOCALE } from '../domain/messages';
import { blockers, preflight, warnings } from '../domain/preflight';
import { getRuleSet, riskThresholdsFor } from '../domain/sama-rules';
import type { SubjectTraits } from '../domain/scenario-builder';
import { analyze } from '../domain/scenario-builder';

/**
 * Orchestration ONLY. Read the body of `run()` and you can see the entire pipeline:
 *
 *   resolve input → preflight → fetch CPI → persist input → RUN THE PURE ENGINE → persist
 *   the result with its provenance.
 *
 * Every genuinely hard thing here — the maths, the rules, the risk tiers, the messages —
 * happens inside `analyze()`, which is pure and has no idea this class exists. This service
 * does the two things the engine deliberately cannot: I/O, and reading the clock.
 */

export interface RunAnalysisParams {
  userId: string;
  /** Inline data from the review screen... */
  input?: UserFinancialData;
  /** ...or an already-persisted input, e.g. what the chatbot extracted. */
  financialInputId?: string;
  apr?: number;
  subject?: SubjectTraits;
  locale?: MessageLocale;
}

export interface RunAnalysisResult {
  analysisId: string;
  result: AnalysisResult;
  /**
   * The EFFECTIVE input the engine actually ran on — the figures behind every number on the
   * page. Identical to the manual declaration unless SIMAH replaced the salary/commitments, in
   * which case this carries the verified values (and `result.provenance.dataSources` says so).
   * The composition views read this so they never disagree with the DBR the engine computed.
   */
  input: UserFinancialData;
  /**
   * Non-blocking caveats (e.g. tenure under a year). They ride ALONGSIDE the result rather
   * than inside it, because AnalysisResult is a fixed contract and a warning is not a
   * finding of the engine — it is a statement about how much to trust the finding.
   */
  warnings: string[];
}

export class AnalysisService {
  constructor(
    private readonly economic: EconomicDataProvider,
    private readonly repository: AnalysisRepository,
    private readonly options: {
      assumptions?: EngineAssumptions;
      locale?: MessageLocale;
      ruleVersion?: string;
      now?: () => Date;
      /**
       * The SIMAH credit-bureau adapter (mock now, real later). Optional: when absent, every
       * figure stays manual. This is the ONLY thing in the service that touches credit data.
       */
      simah?: SimahProvider;
      /**
       * Resolves the `simah_credit` feature flag. When it returns true (and a `simah` provider
       * is wired), SIMAH's verified commitments REPLACE the manual figure — and its salary does
       * too, but ONLY as a fallback when GOSI is unavailable (see `isGosiEnabled`).
       * Off by default, so the manual chatbot values are used unless explicitly enabled.
       */
      isSimahEnabled?: () => Promise<boolean>;
      /**
       * Resolves the `gosi_income` feature flag. GOSI is authoritative for salary (as well as
       * sector and tenure, which it fills upstream at collection time). When on, the salary on
       * the input is GOSI's and is NEVER overwritten by SIMAH — SIMAH's salary is a fallback used
       * solely when GOSI is unavailable.
       */
      isGosiEnabled?: () => Promise<boolean>;
    } = {},
  ) {}

  private get assumptions(): EngineAssumptions {
    return this.options.assumptions ?? DEFAULT_ASSUMPTIONS;
  }

  private get rules(): SamaRuleSet {
    return getRuleSet(this.options.ruleVersion);
  }

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  async run(params: RunAnalysisParams): Promise<RunAnalysisResult> {
    const locale = params.locale ?? this.options.locale ?? DEFAULT_LOCALE;
    const { input: manualInput, financialInputId } = await this.resolveInput(params);

    // The manual declaration is what we persisted above. SIMAH (when enabled) verifies two of
    // its figures — salary and commitments — replacing them for the analysis and recording that
    // it did so. The declaration itself is left intact, so an auditor can see declared vs. verified.
    const { input, dataSources } = await this.applyCreditData(params.userId, manualInput);

    // §10.6: halt before analysing anything that should not be analysed. A five-year
    // projection for someone already spending more than they earn is not a service to them.
    // Run on the EFFECTIVE input — the verified figures are the ones the user will actually face.
    const issues = preflight(input, locale);
    const blocking = blockers(issues);
    if (blocking.length > 0) {
      throw ApiError.analysisBlocked(blocking[0]!.message, {
        issues: blocking.map(({ code, message }) => ({ code, message })),
      });
    }

    // GASTAT CPI. The cache decorator means this is usually a table read, and never fatal
    // when GASTAT itself is down.
    const economic = await this.economic.getLatest('cpi');
    // Pass the caller's rate through as-is (possibly undefined): the engine falls back to its
    // indicative rate AND records which of the two it used. Resolving the default here would
    // erase that distinction, and the UI could no longer say "indicative" versus "your rate".
    const apr = params.apr;

    const result = analyze({
      input,
      economic,
      rules: this.rules,
      assumptions: this.assumptions,
      apr,
      computedAt: this.now().toISOString(),
      // Plain data in, recorded verbatim — the engine never learns SIMAH exists.
      dataSources,
      locale,
      subject: params.subject ?? {},
    });

    const saved = await this.repository.saveAnalysis({
      userId: params.userId,
      financialInputId,
      result,
      // The rate actually used — the engine's indicative one unless the caller supplied theirs.
      apr: result.provenance.apr,
    });

    logger.info('Analysis completed', {
      userId: params.userId,
      analysisId: saved.id,
      ruleVersion: result.provenance.ruleVersion,
      overallRisk: result.overallRisk,
    });

    return {
      analysisId: saved.id,
      result,
      // The effective figures — verified when SIMAH was applied, manual otherwise.
      input,
      warnings: warnings(issues).map((w) => w.message),
    };
  }

  async getById(userId: string, analysisId: string): Promise<PersistedAnalysis> {
    const analysis = await this.repository.findAnalysis(userId, analysisId);
    if (!analysis) throw ApiError.notFound('Analysis not found.');
    return analysis;
  }

  async history(userId: string, limit?: number): Promise<PersistedAnalysis[]> {
    return this.repository.listAnalyses(userId, limit);
  }

  /** The SAMA red lines currently in force — so the UI can show the user the actual limits. */
  currentRules(): { rules: SamaRuleSet; thresholds: ReturnType<typeof riskThresholdsFor> } {
    const rules = this.rules;
    return { rules, thresholds: riskThresholdsFor(rules) };
  }

  /**
   * The single seam where credit-bureau data enters the analysis.
   *
   * Source ownership is locked (see FinancialDataProvenance):
   *   - GOSI is authoritative for salary. When `gosi_income` is on, the salary already on the
   *     input is GOSI's (pulled at collection time) and is kept as-is, labelled 'gosi'.
   *   - SIMAH is authoritative for obligations. When `simah_credit` is on, its total commitments
   *     REPLACE the manual figure.
   *   - SIMAH's salary is a FALLBACK only: it replaces the salary solely when GOSI is unavailable
   *     (the `gosi_income` flag is off).
   *
   * The engine sees only the resulting plain values; it has no idea a bureau was involved.
   */
  private async applyCreditData(
    userId: string,
    manual: UserFinancialData,
  ): Promise<{ input: UserFinancialData; dataSources: FinancialDataProvenance }> {
    const gosiOwnsSalary = this.options.isGosiEnabled
      ? await this.options.isGosiEnabled()
      : false;

    // Base provenance: GOSI owns salary when available; commitments are manual until SIMAH speaks.
    const dataSources: FinancialDataProvenance = {
      existingCommitments: 'manual',
      grossSalary: gosiOwnsSalary ? 'gosi' : 'manual',
    };

    const simahEnabled = this.options.isSimahEnabled ? await this.options.isSimahEnabled() : false;
    if (!simahEnabled || !this.options.simah) {
      return { input: manual, dataSources };
    }

    // Flag is on AND a provider is wired. The mock answers; the real adapter throws until it is
    // authorized — and that throw is correct, not a bug: we never fabricate bureau-verified data.
    const profile = await this.options.simah.getCreditProfile({ userId });

    logger.info('SIMAH data applied to analysis', {
      userId,
      referenceId: profile.referenceId,
      source: profile.source,
      salaryOwner: gosiOwnsSalary ? 'gosi' : 'simah',
    });

    return {
      input: {
        ...manual,
        // SIMAH is authoritative for obligations.
        existingCommitments: profile.totalMonthlyInstallments,
        // SIMAH salary is a fallback ONLY: keep GOSI's salary when GOSI is available.
        grossSalary: gosiOwnsSalary ? manual.grossSalary : profile.verifiedGrossSalary,
      },
      dataSources: {
        existingCommitments: 'simah',
        grossSalary: gosiOwnsSalary ? 'gosi' : 'simah',
        simah: {
          referenceId: profile.referenceId,
          creditScore: profile.creditScore,
          reportGeneratedAt: profile.reportGeneratedAt,
          source: profile.source,
        },
      },
    };
  }

  /**
   * Inline input is persisted before it is analysed. Not an optimisation — an analysis whose
   * inputs were never stored cannot be reproduced, and an irreproducible analysis is not a
   * record, it is an assertion.
   */
  private async resolveInput(
    params: RunAnalysisParams,
  ): Promise<{ input: UserFinancialData; financialInputId: string }> {
    if (params.financialInputId) {
      const input = await this.repository.findFinancialInput(
        params.userId,
        params.financialInputId,
      );
      if (!input) throw ApiError.notFound('Financial input not found.');
      return { input, financialInputId: params.financialInputId };
    }

    if (!params.input) {
      throw ApiError.badRequest('Provide exactly one of "input" or "financialInputId".');
    }

    const created = await this.repository.createFinancialInput(
      params.userId,
      params.input,
      'form',
    );
    return { input: params.input, financialInputId: created.id };
  }
}
