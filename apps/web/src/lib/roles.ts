import type { Role } from '@/api/types'

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  PROJECT_MANAGER: 'Koordinator Proyek',
  STAFF: 'Staf',
}

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role]
}

/** Pilihan peran untuk dropdown. */
export const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}))
