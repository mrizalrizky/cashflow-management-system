import type { Role } from '@/api/types'
import { isRoleAllowed } from './guards'
import { landingPath, PATHS } from './paths'
import { routes } from './routes'

export interface MenuItem {
  label: string
  icon: string
  to: string
}

interface MenuDefinition extends MenuItem {
  /** Nama lain untuk peran tertentu. */
  labelFor?: Partial<Record<Role, string>>
}

// Siapa yang boleh melihat tiap item mengikuti `meta.roles` rutenya,
// supaya menu dan guard tidak pernah berbeda.
const MENU: MenuDefinition[] = [
  { label: 'Dashboard', icon: 'pi pi-chart-bar', to: PATHS.dashboard },
  { label: 'Transaksi', icon: 'pi pi-receipt', to: PATHS.transactions },
  {
    label: 'Proyek',
    icon: 'pi pi-briefcase',
    to: PATHS.projects,
    labelFor: { PROJECT_MANAGER: 'Proyek Saya' },
  },
  { label: 'Master data', icon: 'pi pi-database', to: PATHS.masterData },
  { label: 'Pengguna', icon: 'pi pi-users', to: PATHS.users },
  { label: 'Audit log', icon: 'pi pi-history', to: PATHS.auditLog },
]

function isVisible(item: MenuDefinition, role: Role): boolean {
  const route = routes.find((r) => r.path === item.to)
  return route !== undefined && isRoleAllowed(route.meta ?? {}, role)
}

/** Menu untuk sebuah peran, dengan halaman awalnya selalu di urutan pertama. */
export function menuFor(role: Role): MenuItem[] {
  const landing = landingPath(role)
  return MENU.filter((item) => isVisible(item, role))
    .sort((a, b) => Number(b.to === landing) - Number(a.to === landing))
    .map((item) => ({ label: item.labelFor?.[role] ?? item.label, icon: item.icon, to: item.to }))
}
