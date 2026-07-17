import type { FinancingOffer, OffersRepository, UserFinancialData } from '@shared/types';
import { ApiError } from '@/shared/http/api-error';
import type { AnalysisRepository } from '@/modules/analysis/infrastructure/analysis.repository';
import type { FeatureFlagsService } from '@/modules/feature-flags/application/feature-flags.service';

export interface OffersResult {
  offers: FinancingOffer[];
  /** True while the offers are illustrative samples. The UI MUST surface this. */
  illustrative: boolean;
  disclaimer: string;
}

const DISCLAIMER_ILLUSTRATIVE =
  'These are illustrative sample offers, not real offers from any bank, and not a recommendation. They exist to show how term and rate change what you pay.';

export class OffersService {
  constructor(
    private readonly repository: OffersRepository,
    private readonly analysisRepository: AnalysisRepository,
    private readonly flags: FeatureFlagsService,
  ) {}

  async getOffers(params: {
    userId: string;
    input?: UserFinancialData;
    financialInputId?: string;
  }): Promise<OffersResult> {
    const input = await this.resolveInput(params);
    const offers = await this.repository.getOffers(input);
    const real = await this.flags.isEnabled('offers_real_lenders');

    return {
      offers,
      illustrative: !real,
      disclaimer: real ? '' : DISCLAIMER_ILLUSTRATIVE,
    };
  }

  private async resolveInput(params: {
    userId: string;
    input?: UserFinancialData;
    financialInputId?: string;
  }): Promise<UserFinancialData> {
    if (params.input) return params.input;

    if (params.financialInputId) {
      const stored = await this.analysisRepository.findFinancialInput(
        params.userId,
        params.financialInputId,
      );
      if (!stored) throw ApiError.notFound('Financial input not found.');
      return stored;
    }

    throw ApiError.badRequest('Provide exactly one of "input" or "financialInputId".');
  }
}
