import { formatCalendarMonth } from '../common/calendar-date.js';
import { fromMoney } from '../common/money.js';
import type { Installment } from '../generated/prisma/client.js';
import type { TransactionResponse } from '../transactions/transaction.mapper.js';
import { InstallmentProgress, InstallmentStatus, progressOf } from './installment-progress.js';

export interface InstallmentResponse {
  id: string;
  name: string;
  monthlyAmount: string;
  startMonth: string;
  endMonth: string;
  months: number;
  paid: number;
  due: number;
  behindMonths: number;
  status: InstallmentStatus;
  /** Nominal per bulan × jumlah bulan. */
  totalAmount: string;
  /** Jumlah sebenarnya dari pembayaran yang tidak VOID; tiap pembayaran boleh berbeda dari nominal per bulan. */
  paidAmount: string;
  /** Bulan yang belum dibayar × nominal per bulan. */
  remainingAmount: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UnpaidInstallment {
  id: string;
  name: string;
  /** Bulan yang tertinggal. */
  months: number;
  amount: string;
}

export interface InstallmentSummary {
  /** Bulan berjalan di Jakarta, `YYYY-MM`. */
  month: string;
  /** Jumlah nominal per bulan cicilan yang periodenya mencakup bulan berjalan. */
  activeMonthlyTotal: string;
  unpaid: UnpaidInstallment[];
  unpaidTotal: string;
  /** Jumlah sisa semua cicilan yang belum lunas. */
  remainingTotal: string;
}

export interface InstallmentListResponse {
  items: InstallmentResponse[];
  summary: InstallmentSummary;
}

export type InstallmentDetailResponse = InstallmentResponse & { transactions: TransactionResponse[] };

export function progressFor(installment: Installment, paid: number, currentMonth: string): InstallmentProgress {
  return progressOf(
    { startMonth: formatCalendarMonth(installment.start_month), months: installment.months, paid },
    currentMonth,
  );
}

/** Pembayaran yang dihitung untuk satu cicilan: berapa bulan, dan berapa rupiah. */
export interface Payments {
  count: number;
  amount: bigint;
}

export function toInstallmentResponse(
  installment: Installment,
  progress: InstallmentProgress,
  paidAmount: bigint,
): InstallmentResponse {
  const remainingMonths = BigInt(Math.max(installment.months - progress.paid, 0));
  return {
    id: installment.id,
    name: installment.name,
    monthlyAmount: fromMoney(installment.monthly_amount),
    startMonth: formatCalendarMonth(installment.start_month),
    endMonth: progress.endMonth,
    months: installment.months,
    paid: progress.paid,
    due: progress.due,
    behindMonths: progress.behindMonths,
    status: progress.status,
    totalAmount: fromMoney(installment.monthly_amount * BigInt(installment.months)),
    paidAmount: fromMoney(paidAmount),
    remainingAmount: fromMoney(installment.monthly_amount * remainingMonths),
    notes: installment.notes,
    createdAt: installment.created_at.toISOString(),
    updatedAt: installment.updated_at.toISOString(),
  };
}

/** Isi cicilan untuk catatan audit: kolomnya sendiri. */
export function toInstallmentSnapshot(installment: Installment): Record<string, unknown> {
  return {
    name: installment.name,
    monthly_amount: installment.monthly_amount,
    start_month: formatCalendarMonth(installment.start_month),
    months: installment.months,
    notes: installment.notes,
  };
}
