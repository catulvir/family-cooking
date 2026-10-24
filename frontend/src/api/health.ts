export type HealthStatus = 'UP'

export interface HealthResponse {
  status: HealthStatus
}

const apiOrigin = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${apiOrigin}/api/v1/health`, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`)
  }

  return response.json() as Promise<HealthResponse>
}
