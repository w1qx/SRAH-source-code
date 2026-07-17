/**
 * Pure helpers for accumulating what the chat has collected. No LLM, no I/O.
 */
import type { PartialUserFinancialData } from '@shared/types';
import { REQUIRED_FIELDS, SCOPED_QUESTIONS } from './questions';
import type { ScopedQuestion } from './questions';

/**
 * Fold a new partial over what we already had.
 *
 * `undefined` NEVER erases a collected value — a model that simply forgets to repeat a field it
 * told us about three turns ago must not silently un-collect it. An explicit new value does
 * overwrite, because that is the user correcting themselves.
 */
export function mergeExtracted(
  accumulated: PartialUserFinancialData,
  incoming: PartialUserFinancialData,
): PartialUserFinancialData {
  const merged: PartialUserFinancialData = { ...accumulated };

  for (const [key, value] of Object.entries(incoming) as [
    keyof PartialUserFinancialData,
    unknown,
  ][]) {
    if (value !== undefined && value !== null) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  return merged;
}

/**
 * The `asked` parameter is the set of fields the chat is actually collecting this run. It
 * defaults to the full REQUIRED_FIELDS, so every existing caller (and the legacy, all-flags-off
 * flow) behaves exactly as before. When GOSI/SIMAH auto-pull is on, the caller passes the
 * reduced asked set and the pulled fields no longer count toward "missing".
 */
export function missingRequiredFields(
  extracted: PartialUserFinancialData,
  asked: readonly (keyof PartialUserFinancialData)[] = REQUIRED_FIELDS,
): (keyof PartialUserFinancialData)[] {
  return asked.filter((field) => extracted[field] === undefined);
}

/** Everything collected? (Whether the values are VALID is Zod's call, not this function's.) */
export function isCollectionComplete(
  extracted: PartialUserFinancialData,
  asked: readonly (keyof PartialUserFinancialData)[] = REQUIRED_FIELDS,
): boolean {
  return missingRequiredFields(extracted, asked).length === 0;
}

/** The next thing to ask about — drives quick-reply buttons in the UI. */
export function nextQuestion(
  extracted: PartialUserFinancialData,
  asked: readonly (keyof PartialUserFinancialData)[] = REQUIRED_FIELDS,
): ScopedQuestion | undefined {
  const missing = missingRequiredFields(extracted, asked);
  if (missing.length === 0) return undefined;
  return SCOPED_QUESTIONS.find((q) => q.field === missing[0]);
}

export function progress(
  extracted: PartialUserFinancialData,
  asked: readonly (keyof PartialUserFinancialData)[] = REQUIRED_FIELDS,
): {
  collected: number;
  total: number;
} {
  return {
    collected: asked.length - missingRequiredFields(extracted, asked).length,
    total: asked.length,
  };
}
