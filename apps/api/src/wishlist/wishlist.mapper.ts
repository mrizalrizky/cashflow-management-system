import { fromMoney } from '../common/money.js';
import type { AiVerdict, WishlistItem, WishlistStatus } from '../generated/prisma/client.js';
import type { FinanceSummary } from './finance-summary.js';

export interface WishlistReview {
  verdict: AiVerdict;
  reasons: string[];
  suggestion: string;
  /** Ringkasan yang dikirim bersama penilaian itu; null bila tidak dikirim. */
  financeSnapshot: FinanceSummary | null;
  reviewedAt: string;
  model: string;
  /** Jawaban atau harga diubah setelah penilaian ini dibuat. */
  answersChanged: boolean;
}

export interface WishlistItemResponse {
  id: string;
  name: string;
  price: string;
  reason: string;
  similarOwned: string;
  valueAdded: string;
  usageDuration: string;
  includeFinance: boolean;
  status: WishlistStatus;
  review: WishlistReview | null;
  createdAt: string;
  updatedAt: string;
}

/** Jawaban dengan nama yang sama seperti di JSON, untuk dibandingkan dengan perubahan. */
export interface WishlistAnswers {
  name: string;
  price: string;
  reason: string;
  similarOwned: string;
  valueAdded: string;
  usageDuration: string;
}

export function toWishlistAnswers(item: WishlistItem): WishlistAnswers {
  return {
    name: item.name,
    price: fromMoney(item.price),
    reason: item.reason,
    similarOwned: item.similar_owned,
    valueAdded: item.value_added,
    usageDuration: item.usage_duration,
  };
}

function toReview(item: WishlistItem): WishlistReview | null {
  if (item.ai_verdict === null || item.ai_reviewed_at === null) return null;
  return {
    verdict: item.ai_verdict,
    reasons: (item.ai_reasons as string[] | null) ?? [],
    suggestion: item.ai_suggestion ?? '',
    financeSnapshot: (item.ai_finance_snapshot as FinanceSummary | null) ?? null,
    reviewedAt: item.ai_reviewed_at.toISOString(),
    model: item.ai_model ?? '',
    answersChanged: item.answers_changed_at !== null && item.answers_changed_at > item.ai_reviewed_at,
  };
}

export function toWishlistItemResponse(item: WishlistItem): WishlistItemResponse {
  return {
    id: item.id,
    ...toWishlistAnswers(item),
    includeFinance: item.include_finance,
    status: item.status,
    review: toReview(item),
    createdAt: item.created_at.toISOString(),
    updatedAt: item.updated_at.toISOString(),
  };
}

/** Isi barang untuk catatan audit: jawaban, status, dan ringkas penilaiannya. */
export function toWishlistSnapshot(item: WishlistItem): Record<string, unknown> {
  return {
    name: item.name,
    price: item.price,
    reason: item.reason,
    similar_owned: item.similar_owned,
    value_added: item.value_added,
    usage_duration: item.usage_duration,
    include_finance: item.include_finance,
    status: item.status,
    ai_verdict: item.ai_verdict,
    ai_reviewed_at: item.ai_reviewed_at,
  };
}
