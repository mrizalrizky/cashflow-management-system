import type { Period } from '@/api/types'

export interface PeriodPreset {
  id: 'last12' | 'thisMonth' | 'thisYear'
  label: string
  /** Periode untuk hari ini (`YYYY-MM-DD`); bagian yang kosong diisi bawaan API. */
  range(today: string): Partial<Period>
}

/** Pilihan cepat periode laporan. Yang pertama adalah bawaan API, jadi tidak mengirim tanggal. */
export const PERIOD_PRESETS: PeriodPreset[] = [
  { id: 'last12', label: '12 bulan terakhir', range: () => ({}) },
  {
    id: 'thisMonth',
    label: 'Bulan ini',
    range: (today) => ({ from: `${today.slice(0, 7)}-01`, to: today }),
  },
  {
    id: 'thisYear',
    label: 'Tahun ini',
    range: (today) => ({ from: `${today.slice(0, 4)}-01-01`, to: today }),
  },
]

export function samePeriod(a: Partial<Period>, b: Partial<Period>): boolean {
  return a.from === b.from && a.to === b.to
}
