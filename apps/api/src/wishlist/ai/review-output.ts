import type { AiVerdict } from '../../generated/prisma/client.js';

export interface ReviewOutput {
  verdict: AiVerdict;
  reasons: string[];
  suggestion: string;
}

const VERDICTS: readonly string[] = ['IMPULSIVE', 'NEEDS_THOUGHT', 'PLANNED'];
const KEYS = ['reasons', 'suggestion', 'verdict'];
const REASONS_MIN = 2;
const REASONS_MAX = 4;
const REASON_MAX_LENGTH = 500;
const SUGGESTION_MAX_LENGTH = 1000;

/** Teks yang sudah dipangkas bila panjangnya 1 sampai `max`; selain itu null. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : null;
}

/**
 * Memeriksa keluaran Claude. Skema JSON di permintaan tidak bisa menyatakan jumlah alasan atau
 * panjang teks, jadi semuanya dicek di sini. Null berarti keluaran tidak bisa dipakai.
 */
export function parseReviewOutput(text: string | null): ReviewOutput | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const output = value as Record<string, unknown>;
  if (Object.keys(output).sort().join() !== KEYS.join()) return null;

  if (typeof output.verdict !== 'string' || !VERDICTS.includes(output.verdict)) return null;
  if (!Array.isArray(output.reasons)) return null;
  if (output.reasons.length < REASONS_MIN || output.reasons.length > REASONS_MAX) return null;
  const reasons = output.reasons.map((reason) => cleanText(reason, REASON_MAX_LENGTH));
  if (reasons.some((reason) => reason === null)) return null;
  const suggestion = cleanText(output.suggestion, SUGGESTION_MAX_LENGTH);
  if (suggestion === null) return null;

  return { verdict: output.verdict as AiVerdict, reasons: reasons as string[], suggestion };
}
