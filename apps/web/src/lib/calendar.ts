const JAKARTA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Hari ini menurut waktu Jakarta sebagai `YYYY-MM-DD`, sama dengan yang dipakai API. */
export function todayInJakarta(): string {
  const parts = Object.fromEntries(
    JAKARTA_DAY.formatToParts(new Date()).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}
