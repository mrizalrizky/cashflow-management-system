export type HealthState = 'up' | 'down'

const HEALTH_TIMEOUT_MS = 5000

export async function fetchHealth(fetchFn: typeof fetch = fetch): Promise<HealthState> {
  try {
    const res = await fetchFn('/api/v1/health', {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
    if (!res.ok) return 'down'
    // Server statis dengan fallback SPA menjawab 200 berisi HTML; itu bukan API.
    const body = (await res.json()) as { status?: unknown } | null
    return body?.status === 'ok' ? 'up' : 'down'
  } catch {
    return 'down'
  }
}
