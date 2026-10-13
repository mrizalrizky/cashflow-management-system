import { PATHS } from './paths'

export interface MenuItem {
  label: string
  icon: string
  to: string
}

const MENU: MenuItem[] = [
  { label: 'Dashboard', icon: 'pi pi-chart-bar', to: PATHS.dashboard },
  { label: 'Transaksi', icon: 'pi pi-receipt', to: PATHS.transactions },
  { label: 'Cicilan', icon: 'pi pi-calendar', to: PATHS.installments },
  { label: 'Wishlist', icon: 'pi pi-heart', to: PATHS.wishlist },
  { label: 'Master data', icon: 'pi pi-database', to: PATHS.masterData },
  { label: 'Pengaturan', icon: 'pi pi-cog', to: PATHS.settings },
]

export function menu(): MenuItem[] {
  return MENU
}
