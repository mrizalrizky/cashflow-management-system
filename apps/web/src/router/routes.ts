import type { RouteRecordRaw } from 'vue-router'
import { INSTALLMENT_DETAIL_ROUTE, PATHS, TRANSACTION_DETAIL_ROUTE } from './paths'

declare module 'vue-router' {
  interface RouteMeta {
    /** Boleh dibuka tanpa login. */
    public?: boolean
    /** Kerangka halaman; bawaan `app`. */
    layout?: 'auth' | 'app'
    title?: string
  }
}

// Hanya dilewati: guard selalu mengalihkan `/` ke dasbor.
const placeholder = () => import('@/views/PlaceholderView.vue')

export const routes: RouteRecordRaw[] = [
  {
    path: PATHS.login,
    component: () => import('@/views/auth/PinLoginView.vue'),
    meta: { public: true, layout: 'auth', title: 'Masuk' },
  },
  {
    path: PATHS.setupPin,
    component: () => import('@/views/auth/SetupPinView.vue'),
    meta: { public: true, layout: 'auth', title: 'Buat PIN' },
  },
  { path: PATHS.root, component: placeholder },
  {
    path: PATHS.dashboard,
    component: () => import('@/views/dashboard/DashboardView.vue'),
    meta: { title: 'Dashboard' },
  },
  {
    path: PATHS.transactions,
    component: () => import('@/views/transactions/TransactionsView.vue'),
    meta: { title: 'Transaksi' },
  },
  {
    path: TRANSACTION_DETAIL_ROUTE,
    component: () => import('@/views/transactions/TransactionDetailView.vue'),
    meta: { title: 'Transaksi' },
  },
  {
    path: PATHS.installments,
    component: () => import('@/views/installments/InstallmentsView.vue'),
    meta: { title: 'Cicilan' },
  },
  {
    path: INSTALLMENT_DETAIL_ROUTE,
    component: () => import('@/views/installments/InstallmentDetailView.vue'),
    meta: { title: 'Cicilan' },
  },
  {
    path: PATHS.masterData,
    component: () => import('@/views/master-data/MasterDataView.vue'),
    meta: { title: 'Master data' },
  },
  {
    path: PATHS.settings,
    component: () => import('@/views/settings/SettingsView.vue'),
    meta: { title: 'Pengaturan' },
  },
  {
    path: PATHS.auditLog,
    component: () => import('@/views/audit/AuditLogView.vue'),
    meta: { title: 'Audit log' },
  },
  { path: '/:pathMatch(.*)*', redirect: PATHS.root },
]
