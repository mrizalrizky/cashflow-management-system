/** Pemilik yang sedang masuk. */
export interface AuthUser {
  id: string
  name: string
}

export interface Paginated<T> {
  data: T[]
  meta: { page: number; pageSize: number; total: number }
}

export interface PageParams {
  page: number
  pageSize: number
}

export interface FieldError {
  field: string
  messages: string[]
}

export interface SessionResponse {
  accessToken: string
  user: AuthUser
}

export type AccountType = 'CASH' | 'BANK'
export type TxType = 'IN' | 'OUT'
export type TxStatus = 'APPROVED' | 'VOID'

/** Nominal (`openingBalance`, `balance`, `contractValue`, `contractValueWithPpn`) selalu string digit. */
export interface Account {
  id: string
  name: string
  type: AccountType
  openingBalance: string
  balance: string
  isActive: boolean
  createdAt: string
}

export interface Category {
  id: string
  name: string
  type: TxType
  isSystem: boolean
  isActive: boolean
  /** Transaksi pengeluaran berkategori ini wajib memilih cicilan yang dibayar. */
  isInstallment: boolean
}

/** Pilihan akun untuk input transaksi; sengaja tanpa saldo. */
export interface AccountOption {
  id: string
  name: string
  type: AccountType
}

export interface NamedRef {
  id: string
  name: string
}

export interface Attachment {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

/** Yang boleh dilakukan pengguna saat ini pada sebuah transaksi; ditentukan oleh API. */
export interface TransactionPermissions {
  canEdit: boolean
  canVoid: boolean
  /** Menambah atau menghapus bukti. */
  canAttach: boolean
}

/** `amount` string digit; `transactionDate` tanggal kalender `YYYY-MM-DD`. */
export interface Transaction {
  id: string
  type: TxType
  amount: string
  transactionDate: string
  description: string
  status: TxStatus
  account: NamedRef
  category: NamedRef
  /** Cicilan yang dibayar transaksi ini. */
  installment: NamedRef | null
  isTransfer: boolean
  transferGroupId: string | null
  createdBy: NamedRef
  voidedBy: NamedRef | null
  voidedAt: string | null
  voidReason: string | null
  attachments: Attachment[]
  permissions: TransactionPermissions
  createdAt: string
  updatedAt: string
}

export type InstallmentStatus = 'NOT_STARTED' | 'ON_TRACK' | 'BEHIND' | 'PAID_OFF'

/** Bulan `YYYY-MM`; nominal string digit. Kemajuan, bulan selesai dan status dihitung API. */
export interface Installment {
  id: string
  name: string
  monthlyAmount: string
  startMonth: string
  endMonth: string
  months: number
  paid: number
  due: number
  behindMonths: number
  status: InstallmentStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface InstallmentList {
  items: Installment[]
  summary: {
    month: string
    activeMonthlyTotal: string
    unpaid: { id: string; name: string; months: number; amount: string }[]
    unpaidTotal: string
  }
}

export type InstallmentDetail = Installment & { transactions: Transaction[] }

export type WishlistStatus = 'WAITING' | 'BOUGHT' | 'CANCELLED'
export type AiVerdict = 'IMPULSIVE' | 'NEEDS_THOUGHT' | 'PLANNED'

/** Ringkasan keuangan yang dikirim ke AI: hanya total. */
export interface FinanceSummary {
  totalBalance: string
  months: string[]
  averageMonthlyIncome: string
  averageMonthlyExpense: string
  unpaidInstallments: { count: number; monthlyTotal: string; lastEndMonth: string | null }
}

export interface WishlistReview {
  verdict: AiVerdict
  reasons: string[]
  suggestion: string
  financeSnapshot: FinanceSummary | null
  reviewedAt: string
  model: string
  /** Jawaban atau harga diubah setelah penilaian ini. */
  answersChanged: boolean
}

export interface WishlistItem {
  id: string
  name: string
  price: string
  reason: string
  similarOwned: string
  valueAdded: string
  usageDuration: string
  includeFinance: boolean
  status: WishlistStatus
  review: WishlistReview | null
  createdAt: string
  updatedAt: string
}

/** Rentang tanggal kalender `YYYY-MM-DD`; kedua ujungnya ikut dihitung. */
export interface Period {
  from: string
  to: string
}

/** Nominal laporan berupa string digit; `net` (masuk dikurangi keluar) bisa diawali `-`. */
export interface Cashflow {
  income: string
  expense: string
  net: string
}

export interface CategoryAmount {
  categoryId: string
  name: string
  amount: string
}

export interface AccountBalance {
  id: string
  name: string
  type: AccountType
  isActive: boolean
  /** Saldo saat ini, bukan saldo pada akhir periode. */
  balance: string
}

export interface CompanyDashboard {
  period: Period
  accounts: AccountBalance[]
  totalBalance: string
  totals: Cashflow
  /** Satu entri per bulan (`YYYY-MM`) dalam periode, berurutan. */
  monthly: (Cashflow & { month: string })[]
  expenseByCategory: CategoryAmount[]
  recentTransactions: Transaction[]
}

/** Satu catatan log audit. `before` dan `after` adalah keadaan data seperti disimpan API. */
export interface AuditLog {
  id: string
  /** Mis. `LOGIN`, `APPROVE`. */
  action: string
  /** Mis. `transaction`, `account`. */
  entityType: string
  entityId: string
  /** null bila pelakunya tidak dikenal, mis. login gagal dengan email tak terdaftar. */
  user: NamedRef | null
  before: unknown
  after: unknown
  ip: string | null
  createdAt: string
}
