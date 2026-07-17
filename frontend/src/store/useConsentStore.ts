"use client";

import { create } from "zustand";
import type { ConsentState } from "@shared/types";

/**
 * Consent state for the /consent screen.
 *
 * `ConsentState` comes from the shared contract (shared/types.ts) and is the
 * exact payload the backend will receive — see lib/api/consent.ts.
 */
interface ConsentStore {
  consent: ConsentState;

  setTermsAccepted: (value: boolean) => void;
  setDataRetrievalAccepted: (value: boolean) => void;
  /** Stamps consentedAt and returns the finalized state (for submission). */
  confirmConsent: () => ConsentState;
  reset: () => void;
}

const emptyConsent: ConsentState = {
  termsAccepted: false,
  dataRetrievalAccepted: false,
  consentedAt: null,
};

export const useConsentStore = create<ConsentStore>((set, get) => ({
  consent: emptyConsent,

  setTermsAccepted: (value) =>
    set((state) => ({ consent: { ...state.consent, termsAccepted: value } })),

  setDataRetrievalAccepted: (value) =>
    set((state) => ({ consent: { ...state.consent, dataRetrievalAccepted: value } })),

  confirmConsent: () => {
    const confirmed: ConsentState = {
      ...get().consent,
      consentedAt: new Date().toISOString(),
    };
    set({ consent: confirmed });
    return confirmed;
  },

  reset: () => set({ consent: emptyConsent }),
}));

/** Both consents are independent, and both are required to continue. */
export const bothConsentsGiven = (consent: ConsentState): boolean =>
  consent.termsAccepted && consent.dataRetrievalAccepted;
