/** Ringkasan keuangan yang boleh dikirim ke AI: hanya total, tanpa transaksi, nama, atau keterangan. */
export interface FinanceSummary {
  /** Saldo semua akun aktif saat ini. */
  totalBalance: string;
  /** Tiga bulan kalender penuh terakhir, `YYYY-MM`. */
  months: string[];
  averageMonthlyIncome: string;
  averageMonthlyExpense: string;
  unpaidInstallments: {
    count: number;
    monthlyTotal: string;
    /** Bulan selesai paling akhir, `YYYY-MM`; null bila tidak ada. */
    lastEndMonth: string | null;
  };
}
