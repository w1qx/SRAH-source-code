import { createHash } from 'node:crypto';
import type { DataSource, UserFinancialData } from '@shared/types';
import { ApiError } from '@/shared/http/api-error';
import { simulateLatency } from '@/modules/external-sources/infrastructure/providers/mock/mock.helpers';

/**
 * SIMAH credit-report (PDF) extraction — the backend half of the "رفع تقرير سمة" gateway.
 *
 * Same fidelity level as the rest of the external-sources module: everything there is a
 * deterministic mock behind a stable interface, and so is this. A real report parser (OCR /
 * text extraction over the actual SIMAH layout) replaces ONE function later — the route,
 * the response shape and the frontend flow don't change.
 *
 * What is real already:
 *  - the file must actually be a PDF (magic-byte check, size cap enforced by the route);
 *  - if the PDF carries uncompressed text, labelled salary/obligation figures ARE read out;
 *  - the response is the same `{ pulled, provenance }` shape as /chat/pull, so the frontend
 *    merges it exactly like GOSI/SIMAH auto-pull, badges included.
 *
 * What is mocked: when no readable figures exist (most PDFs compress their text streams),
 * values are derived deterministically from the file's hash — the same document always
 * yields the same numbers, like the other mock providers.
 */

export interface StatementExtraction {
  pulled: Partial<UserFinancialData>;
  provenance: Partial<Record<keyof UserFinancialData, DataSource>>;
}

/** Plausible SIMAH-report ranges for the deterministic fallback. */
const SALARY_MIN = 8000;
const SALARY_MAX = 28000;

export async function extractStatement(file: Buffer): Promise<StatementExtraction> {
  if (!file || file.length === 0) {
    throw new ApiError(400, 'validation_failed', 'Empty upload — attach the PDF as the request body.');
  }
  // %PDF- magic bytes: reject renamed images/docs before pretending to parse them.
  if (file.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new ApiError(400, 'validation_failed', 'The uploaded file is not a PDF.');
  }

  // Feels like a real parse in the demo, same trick as the other mock providers.
  await simulateLatency(1200, 2200);

  const fromText = readLabelledFigures(file);
  const fallback = deterministicFigures(file);

  const grossSalary = fromText.grossSalary ?? fallback.grossSalary;
  const existingCommitments = fromText.existingCommitments ?? fallback.existingCommitments;

  return {
    pulled: { grossSalary, existingCommitments },
    // The whole document IS SIMAH's report, so both figures carry the simah badge —
    // salary-from-SIMAH is the contract's sanctioned fallback when GOSI isn't involved.
    provenance: { grossSalary: 'simah', existingCommitments: 'simah' },
  };
}

/**
 * Best-effort REAL extraction: scan any uncompressed text streams for labelled figures,
 * e.g. "الراتب: ١٨٬٥٠٠" or "Gross Salary 18,500". Compressed PDFs simply yield nothing.
 */
function readLabelledFigures(file: Buffer): Partial<Record<'grossSalary' | 'existingCommitments', number>> {
  const text = file.toString('latin1');
  const out: Partial<Record<'grossSalary' | 'existingCommitments', number>> = {};

  const salary = matchFigure(text, /(?:Gross\s*Salary|Salary|الراتب)[^0-9]{0,40}([0-9][0-9,.]{2,12})/i);
  if (salary !== null) out.grossSalary = salary;

  const commitments = matchFigure(
    text,
    /(?:Total\s*Obligations|Obligations|Commitments|الالتزامات)[^0-9]{0,40}([0-9][0-9,.]{2,12})/i,
  );
  if (commitments !== null) out.existingCommitments = commitments;

  return out;
}

function matchFigure(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m?.[1]) return null;
  const n = Math.round(Number(m[1].replace(/[,.](?=\d{3}\b)/g, '').replace(/,/g, '')));
  // Sanity window — a figure outside it is more likely page geometry than money.
  return Number.isFinite(n) && n >= 500 && n <= 1_000_000 ? n : null;
}

/**
 * Deterministic fallback: hash the document, map the digest onto plausible ranges.
 * Salary lands on a 500-riyal grid between 8k and 28k; obligations are 0–40% of it
 * on a 50-riyal grid. Re-uploading the same file always gives the same reading.
 */
function deterministicFigures(file: Buffer): { grossSalary: number; existingCommitments: number } {
  const digest = createHash('sha256').update(file).digest();
  const pick = (offset: number) => digest.readUInt32BE(offset) / 0xffffffff;

  const salaryRaw = SALARY_MIN + pick(0) * (SALARY_MAX - SALARY_MIN);
  const grossSalary = Math.round(salaryRaw / 500) * 500;

  const commitmentsRaw = pick(4) * 0.4 * grossSalary;
  const existingCommitments = Math.round(commitmentsRaw / 50) * 50;

  return { grossSalary, existingCommitments };
}
