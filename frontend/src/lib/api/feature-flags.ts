"use client";

import type { FeatureFlag } from "@shared/types";
import { request } from "./client";

export function getFeatureFlags(signal?: AbortSignal): Promise<FeatureFlag[]> {
  return request<{ flags: FeatureFlag[] }>("/feature-flags", { signal }).then((r) => r.flags);
}
