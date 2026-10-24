export type HealthStatus = 'UP'

export interface HealthResponse {
  status: HealthStatus
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health', {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`)
  }

  return response.json() as Promise<HealthResponse>
}
