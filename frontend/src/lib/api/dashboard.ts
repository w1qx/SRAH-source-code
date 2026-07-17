"use client";

import type { DashboardData } from "@shared/types";
import { request } from "./client";

/**
 * The dashboard is a read model the backend derives from the analyses the user has actually
 * run: the gauge replays the DBR, tier and message of their latest analysis. A user who has
 * never run one gets `indicator: null` — the UI shows an empty state rather than a made-up score.
 */
export function getDashboard(signal?: AbortSignal): Promise<DashboardData> {
  return request<DashboardData>("/dashboard", { auth: true, signal });
}
