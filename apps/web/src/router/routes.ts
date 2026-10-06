import type { RouteRecordRaw } from 'vue-router'
import type { Role } from '@/api/types'
import { PATHS } from './paths'

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
const placeholder = () => import('@/views/HomeView.vue')

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
    component: placeholder,
    meta: { roles: ['SUPER_ADMIN'], title: 'Dashboard' },
  },
  { path: PATHS.transactions, component: placeholder, meta: { title: 'Transaksi' } },
  {
    path: PATHS.projects,
    component: placeholder,
    meta: { roles: ['SUPER_ADMIN', 'PROJECT_MANAGER'], title: 'Proyek' },
  },
  {
    path: PATHS.users,
    component: () => import('@/views/users/UsersView.vue'),
    meta: { roles: ['SUPER_ADMIN'], title: 'Pengguna' },
  },
  { path: '/:pathMatch(.*)*', redirect: PATHS.root },
]
