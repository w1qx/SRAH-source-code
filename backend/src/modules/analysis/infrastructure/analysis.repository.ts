import type { Prisma } from '@prisma/client';
import type { AnalysisResult, UserFinancialData } from '@shared/types';
import type { Db } from '@/db/prisma';

/**
 * The mapping layer between DB shape and API shape (Scope v2 §11).
 *
 * Money lives in Postgres as Decimal(12,2) — a financial record is not a float. It crosses
 * into the domain as a number, because the engine's formulas are floating-point maths and
 * pretending otherwise would be theatre. The conversion happens HERE, in one place, and
 * nowhere else.
 */

export interface PersistedAnalysis {
  id: string;
  createdAt: string;
  input: UserFinancialData;
  result: AnalysisResult;
}

export interface SaveAnalysisParams {
  userId: string;
  financialInputId: string;
  result: AnalysisResult;
  /** The indicative (or supplied) APR the instalment was amortized at. */
  apr: number;
}

export interface AnalysisRepository {
  createFinancialInput(
    userId: string,
    input: UserFinancialData,
    source: 'chatbot' | 'form',
  ): Promise<{ id: string }>;
  findFinancialInput(userId: string, id: string): Promise<UserFinancialData | undefined>;
  saveAnalysis(params: SaveAnalysisParams): Promise<{ id: string; createdAt: string }>;
  findAnalysis(userId: string, id: string): Promise<PersistedAnalysis | undefined>;
  listAnalyses(userId: string, limit?: number): Promise<PersistedAnalysis[]>;
}

export class PrismaAnalysisRepository implements AnalysisRepository {
  constructor(private readonly db: Db) {}

  async createFinancialInput(
    userId: string,
    input: UserFinancialData,
    source: 'chatbot' | 'form',
  ): Promise<{ id: string }> {
    const row = await this.db.financialInput.create({
      data: { userId, source, ...toFinancialInputRow(input) },
      select: { id: true },
    });
    return row;
  }

  async findFinancialInput(userId: string, id: string): Promise<UserFinancialData | undefined> {
    const row = await this.db.financialInput.findFirst({ where: { id, userId } });
    return row ? toUserFinancialData(row) : undefined;
  }

  /**
   * Persists the analysis AND its normalized per-year rows in ONE transaction.
   *
   * The two must never disagree: `result_json` is the audit record and `analysis_years` is
   * the queryable view of the same run. A half-written analysis is a corrupt audit trail,
   * which for a regulated product is worse than no analysis at all.
   */
  async saveAnalysis(params: SaveAnalysisParams): Promise<{ id: string; createdAt: string }> {
    const { userId, financialInputId, result, apr } = params;
    const { provenance } = result;

    const analysis = await this.db.$transaction(async (tx) => {
      const created = await tx.analysis.create({
        data: {
          userId,
          financialInputId,
          ruleVersion: provenance.ruleVersion,
          inflationValue: provenance.inflationValue,
          inflationSource: provenance.inflationSource,
          inflationAsOf: provenance.inflationAsOf,
          salaryGrowthAssumption: provenance.assumptions.salaryGrowth,
          aprAssumption: apr,
          // Normalized data-source provenance — queryable without opening result_json.
          commitmentsSource: provenance.dataSources.existingCommitments,
          salarySource: provenance.dataSources.grossSalary,
          simahReferenceId: provenance.dataSources.simah?.referenceId ?? null,
          creditScore: provenance.dataSources.simah?.creditScore ?? null,
          requestedDbr: result.requestedDbr,
          overallRisk: result.overallRisk,
          resultJson: result as unknown as Prisma.InputJsonValue,
        },
        select: { id: true, createdAt: true },
      });

      await tx.analysisYear.createMany({
        data: result.scenarios.flatMap((scenario) =>
          scenario.years.map((year) => ({
            analysisId: created.id,
            scenario: scenario.type,
            year: year.year,
            installment: year.installment,
            remainingMonthly: year.remainingMonthly,
            remainingDebt: year.remainingDebt,
            dbr: year.dbr,
            riskTier: year.riskTier,
          })),
        ),
      });

      return created;
    });

    return { id: analysis.id, createdAt: analysis.createdAt.toISOString() };
  }

  async findAnalysis(userId: string, id: string): Promise<PersistedAnalysis | undefined> {
    const row = await this.db.analysis.findFirst({
      where: { id, userId },
      include: { financialInput: true },
    });
    if (!row) return undefined;

    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      input: toUserFinancialData(row.financialInput),
      // The stored result_json IS the answer we gave. We replay it verbatim rather than
      // recomputing: a recomputation under today's rules would not be the same analysis.
      result: row.resultJson as unknown as AnalysisResult,
    };
  }

  async listAnalyses(userId: string, limit = 20): Promise<PersistedAnalysis[]> {
    const rows = await this.db.analysis.findMany({
      where: { userId },
      include: { financialInput: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      input: toUserFinancialData(row.financialInput),
      result: row.resultJson as unknown as AnalysisResult,
    }));
  }
}

type FinancialInputRow = {
  goal: string;
  financingAmount: Prisma.Decimal | number;
  termYears: number;
  grossSalary: Prisma.Decimal | number;
  additionalIncome: Prisma.Decimal | number;
  existingCommitments: Prisma.Decimal | number;
  monthlyExpenses: Prisma.Decimal | number;
  familyStatus: string;
  savings: Prisma.Decimal | number;
  employmentSector: string;
  tenureYears: number;
};

function toFinancialInputRow(input: UserFinancialData) {
  return {
    goal: input.goal,
    financingAmount: input.financingAmount,
    termYears: input.termYears,
    grossSalary: input.grossSalary,
    additionalIncome: input.additionalIncome,
    existingCommitments: input.existingCommitments,
    monthlyExpenses: input.monthlyExpenses,
    familyStatus: input.familyStatus,
    savings: input.savings,
    employmentSector: input.employmentSector,
    tenureYears: input.tenureYears,
  };
}

export function toUserFinancialData(row: FinancialInputRow): UserFinancialData {
  return {
    goal: row.goal as UserFinancialData['goal'],
    financingAmount: Number(row.financingAmount),
    termYears: row.termYears,
    grossSalary: Number(row.grossSalary),
    additionalIncome: Number(row.additionalIncome),
    existingCommitments: Number(row.existingCommitments),
    monthlyExpenses: Number(row.monthlyExpenses),
    familyStatus: row.familyStatus as UserFinancialData['familyStatus'],
    savings: Number(row.savings),
    employmentSector: row.employmentSector as UserFinancialData['employmentSector'],
    tenureYears: row.tenureYears,
  };
}
