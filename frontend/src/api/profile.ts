export interface ProfileData {
  email: string
  displayName: string | null
  version: number
}

export class ProfileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message)
  }
}

const apiOrigin = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, { credentials: 'include', ...init })
  if (!response.ok) {
    let body: { message?: string; fieldErrors?: Record<string, string> } = {}
    try {
      body = await response.json()
    } catch {
      // Intermediaries may return a non-JSON failure.
    }
    const message =
      response.status === 401
        ? 'Your session has expired. Please sign in again.'
        : response.status === 403
          ? 'You do not have access to that action.'
          : (body.message ?? 'Could not update your profile. Please try again.')
    throw new ProfileApiError(message, response.status, body.fieldErrors)
  }
  return response.json() as Promise<T>
}

export const profileApi = {
  get: () => request<ProfileData>('/api/v1/profile'),
  save: async (displayName: string | null, version: number) => {
    const { token } = await request<{ token: string }>('/api/v1/auth/csrf')
    return request<ProfileData>('/api/v1/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify({ displayName, version }),
    })
  },
}
