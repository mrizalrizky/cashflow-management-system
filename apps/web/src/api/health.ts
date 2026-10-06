export type HealthState = 'up' | 'down'

export async function fetchHealth(fetchFn: typeof fetch = fetch): Promise<HealthState> {
  try {
    const res = await fetchFn('/api/v1/health')
    return res.ok ? 'up' : 'down'
  } catch {
    return 'down'
  }
}
