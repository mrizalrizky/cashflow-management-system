export type Role = 'SUPER_ADMIN' | 'PROJECT_MANAGER' | 'STAFF'

/** User yang sedang login. */
export interface AuthUser {
  id: string
  name: string
  email: string
  role: Role
  mustChangePassword: boolean
}

/** User seperti yang dikembalikan modul pengguna. */
export interface User extends AuthUser {
  isActive: boolean
  createdAt: string
  updatedAt: string
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
export type ProjectStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type TxStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'VOID'

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
}

export interface ProjectMember {
  id: string
  name: string
  email: string
}

/** Tanggal proyek adalah tanggal kalender `YYYY-MM-DD`. */
export interface Project {
  id: string
  code: string
  name: string
  clientName: string
  contractValue: string
  /** Nilai kontrak berikut PPN; `'0'` berarti belum diisi. */
  contractValueWithPpn: string
  status: ProjectStatus
  startDate: string | null
  endDate: string | null
  notes: string | null
  members: ProjectMember[]
  createdAt: string
  updatedAt: string
}

/** Pilihan akun untuk input transaksi; sengaja tanpa saldo. */
export interface AccountOption {
  id: string
  name: string
  type: AccountType
}

/** Proyek aktif yang boleh dipilih pengguna saat mencatat transaksi. */
export interface ProjectOption {
  id: string
  code: string
  name: string
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
  canCancel: boolean
  /** Menyetujui atau menolak. */
  canReview: boolean
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
  /** `null` berarti overhead perusahaan. */
  project: (NamedRef & { code: string }) | null
  isTransfer: boolean
  transferGroupId: string | null
  createdBy: NamedRef
  reviewedBy: NamedRef | null
  reviewedAt: string | null
  rejectReason: string | null
  voidedBy: NamedRef | null
  voidedAt: string | null
  voidReason: string | null
  attachments: Attachment[]
  permissions: TransactionPermissions
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
  expenseByScope: { overhead: string; project: string }
  recentTransactions: Transaction[]
  /** Transaksi yang menunggu ditinjau, tanpa melihat periode. */
  pendingCount: number
}

/** Ringkasan sepanjang umur proyek; hanya transaksi yang disetujui yang dihitung. */
export interface ProjectSummary {
  projectId: string
  contractValue: string
  /** Dasar `outstanding` dan `receivedPercent`; `'0'` berarti belum diisi. */
  contractValueWithPpn: string
  received: string
  /** Nilai kontrak + PPN dikurangi yang diterima; negatif bila yang diterima melebihinya. */
  outstanding: string
  /** Dua desimal; null bila nilai kontrak + PPN belum diisi. */
  receivedPercent: number | null
  cost: string
  /** Yang diterima dikurangi biaya. */
  cashDifference: string
  costByCategory: CategoryAmount[]
  pendingCount: number
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
