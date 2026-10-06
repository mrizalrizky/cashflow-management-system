import type { AccountType, ProjectStatus, Role, TxType } from '@/api/types'

export interface Option<T> {
  value: T
  label: string
}

/** Nama tampilan untuk nilai enum dari API, beserta pilihannya untuk dropdown. */
function labelSet<T extends string>(labels: Record<T, string>) {
  return {
    label: (value: T): string => labels[value],
    options: (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] })),
  }
}

const roles = labelSet<Role>({
  SUPER_ADMIN: 'Super Admin',
  PROJECT_MANAGER: 'Koordinator Proyek',
  STAFF: 'Staf',
})
export const roleLabel = roles.label
export const ROLE_OPTIONS: Option<Role>[] = roles.options

const accountTypes = labelSet<AccountType>({ CASH: 'Kas', BANK: 'Bank' })
export const accountTypeLabel = accountTypes.label
export const ACCOUNT_TYPE_OPTIONS: Option<AccountType>[] = accountTypes.options

const txTypes = labelSet<TxType>({ IN: 'Pemasukan', OUT: 'Pengeluaran' })
export const txTypeLabel = txTypes.label
export const TX_TYPE_OPTIONS: Option<TxType>[] = txTypes.options

const projectStatuses = labelSet<ProjectStatus>({
  ACTIVE: 'Aktif',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
})
export const projectStatusLabel = projectStatuses.label
export const PROJECT_STATUS_OPTIONS: Option<ProjectStatus>[] = projectStatuses.options

/** Warna tag PrimeVue untuk tiap status proyek. */
export const PROJECT_STATUS_SEVERITY: Record<ProjectStatus, 'success' | 'info' | 'secondary'> = {
  ACTIVE: 'success',
  COMPLETED: 'info',
  CANCELLED: 'secondary',
}

export const ACTIVE_OPTIONS: Option<boolean>[] = [
  { label: 'Aktif', value: true },
  { label: 'Nonaktif', value: false },
]
