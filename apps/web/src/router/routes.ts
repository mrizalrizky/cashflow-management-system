import type { RouteRecordRaw } from 'vue-router'
import type { Role } from '@/api/types'
import { PATHS, PROJECT_DETAIL_ROUTE, TRANSACTION_DETAIL_ROUTE } from './paths'

declare module 'vue-router' {
  interface RouteMeta {
    /** Boleh dibuka tanpa login. */
    public?: boolean
    /** Peran yang boleh membuka; tanpa ini semua peran boleh. */
    roles?: Role[]
    /** Tetap boleh dibuka selama user masih wajib ganti password. */
    allowPendingPasswordChange?: boolean
    /** Kerangka halaman; bawaan `app`. */
    layout?: 'auth' | 'app'
    title?: string
  }
}

// Halaman yang dibangun pada fase berikutnya memakai tampilan sementara yang sama.
const placeholder = () => import('@/views/PlaceholderView.vue')

const PROJECT_ROLES: Role[] = ['SUPER_ADMIN', 'PROJECT_MANAGER']

export const routes: RouteRecordRaw[] = [
  {
    path: PATHS.login,
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, layout: 'auth', title: 'Masuk' },
  },
  {
    path: PATHS.changePassword,
    component: () => import('@/views/ChangePasswordView.vue'),
    meta: { allowPendingPasswordChange: true, layout: 'auth', title: 'Ganti password' },
  },
  // Guard selalu mengalihkan `/` ke halaman awal sesuai peran.
  { path: PATHS.root, component: placeholder },
  {
    path: PATHS.dashboard,
    component: () => import('@/views/dashboard/DashboardView.vue'),
    meta: { roles: ['SUPER_ADMIN'], title: 'Dashboard' },
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
    path: PATHS.projects,
    component: () => import('@/views/projects/ProjectsView.vue'),
    meta: { roles: PROJECT_ROLES, title: 'Proyek' },
  },
  {
    path: PROJECT_DETAIL_ROUTE,
    component: () => import('@/views/projects/ProjectDetailView.vue'),
    meta: { roles: PROJECT_ROLES, title: 'Proyek' },
  },
  {
    path: PATHS.masterData,
    component: () => import('@/views/master-data/MasterDataView.vue'),
    meta: { roles: ['SUPER_ADMIN'], title: 'Master data' },
  },
  {
    path: PATHS.users,
    component: () => import('@/views/users/UsersView.vue'),
    meta: { roles: ['SUPER_ADMIN'], title: 'Pengguna' },
  },
  {
    path: PATHS.auditLog,
    component: () => import('@/views/audit/AuditLogView.vue'),
    meta: { roles: ['SUPER_ADMIN'], title: 'Audit log' },
  },
  { path: '/:pathMatch(.*)*', redirect: PATHS.root },
]
