const DATE_PARTS = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

/** Tanggal sebagai `dd MMM yyyy` menurut waktu Jakarta; `-` bila kosong atau tidak sah. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  const parts = Object.fromEntries(DATE_PARTS.formatToParts(date).map((p) => [p.type, p.value]))
  return `${parts.day} ${parts.month} ${parts.year}`
}
