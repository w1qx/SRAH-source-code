"use client";

import type { FinancingOffer, UserFinancialData } from "@shared/types";
import { request } from "./client";

export interface OffersResult {
  offers: FinancingOffer[];
  /** True while the backend is serving sample lenders rather than real ones. */
  illustrative: boolean;
  disclaimer: string;
}

export function getOffers(input: UserFinancialData, signal?: AbortSignal): Promise<OffersResult> {
  return request<OffersResult>("/offers", {
    method: "POST",
    body: { input },
    auth: true,
    signal,
  });
}
