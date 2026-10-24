const apiOrigin = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

export interface CurrentUser {
  email: string
  role: 'ADMIN' | 'MEMBER'
  status: 'PENDING' | 'ACTIVE' | 'DISABLED'
  mustChangePassword: boolean
}

export interface ManagedUser {
  id: string
  email: string
  role: 'ADMIN' | 'MEMBER'
  status: 'PENDING' | 'ACTIVE' | 'DISABLED'
  mustChangePassword: boolean
}

export interface CreatedUser extends ManagedUser {
  temporaryPassword: string
}

async function csrfHeaders(): Promise<HeadersInit> {
  const response = await fetch(`${apiOrigin}/api/v1/auth/csrf`, { credentials: 'include' })
  if (!response.ok) throw new Error('Could not prepare a secure request.')
  const { token } = (await response.json()) as { token: string }
  return { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, { credentials: 'include', ...init })
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your email or password is incorrect.')
    if (response.status === 403) throw new Error('You do not have access to that action.')
    if (response.status === 409) throw new Error('An account already uses that email address.')
    throw new Error('Something went wrong. Please try again.')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const authApi = {
  currentUser: () => request<CurrentUser>('/api/v1/auth/me'),
  login: async (email: string, password: string) =>
    request<CurrentUser>('/api/v1/auth/login', {
      method: 'POST',
      headers: await csrfHeaders(),
      body: JSON.stringify({ email, password }),
    }),
  changePassword: async (currentPassword: string, newPassword: string) =>
    request<CurrentUser>('/api/v1/auth/change-password', {
      method: 'POST',
      headers: await csrfHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  logout: async () =>
    request<void>('/api/v1/auth/logout', { method: 'POST', headers: await csrfHeaders() }),
  users: () => request<ManagedUser[]>('/api/v1/admin/users'),
  createUser: async (email: string, role: 'ADMIN' | 'MEMBER') =>
    request<CreatedUser>('/api/v1/admin/users', {
      method: 'POST',
      headers: await csrfHeaders(),
      body: JSON.stringify({ email, role }),
    }),
}
