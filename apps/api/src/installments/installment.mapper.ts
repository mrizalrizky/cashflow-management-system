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

export function toInstallmentResponse(
  installment: Installment,
  progress: InstallmentProgress,
): InstallmentResponse {
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
