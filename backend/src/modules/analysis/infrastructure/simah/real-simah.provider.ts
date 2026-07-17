import type { SimahCreditProfile, SimahProvider, SimahSubjectRef } from '@shared/types';

/**
 * The REAL SIMAH adapter — deliberately inert.
 *
 * Pulling a citizen's credit file is a LICENSED act: it requires SAMA authorization and formal
 * SIMAH membership, plus the user's PDPL consent to retrieve their data (captured at signup —
 * see `ConsentState.dataRetrievalAccepted`). Until that authorization exists, this adapter must
 * not return anything: a plausible-looking fake profile presented as bureau-verified data would
 * be a compliance incident, not a shortcut.
 *
 * So it throws, exactly like `BankApiOffersRepository` and the Nafath mock. It is wired only when
 * SIMAH_PROVIDER=real, and it is CONSULTED only when the `simah_credit` feature flag is on — two
 * separate switches, both off by default. Going live is: obtain authorization → implement the
 * handshake here → flip the flag. Nothing upstream of this file changes.
 */
export class SimahNotAuthorizedError extends Error {
  constructor() {
    super(
      'SIMAH credit data is not yet authorized. It requires SAMA licensing and SIMAH membership; ' +
        'the `simah_credit` feature flag must stay off until this adapter is implemented.',
    );
    this.name = 'SimahNotAuthorizedError';
  }
}

export class RealSimahProvider implements SimahProvider {
  /** Not active: there is no authorization to speak to the bureau yet. */
  readonly isActive = false;

  async getCreditProfile(_subject: SimahSubjectRef): Promise<SimahCreditProfile> {
    throw new SimahNotAuthorizedError();
  }
}
