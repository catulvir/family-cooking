const apiOrigin = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

export interface Dish {
  id: string
  name: string
  preparedOn: string
  notes: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  canEdit: boolean
}

export interface DishInput {
  name: string
  preparedOn: string
  notes: string | null
}

export class DishApiError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message)
  }
}

async function csrfHeaders(): Promise<HeadersInit> {
  const response = await fetch(`${apiOrigin}/api/v1/auth/csrf`, { credentials: 'include' })
  if (!response.ok) throw new DishApiError('Could not prepare a secure request.')
  const { token } = (await response.json()) as { token: string }
  return { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, { credentials: 'include', ...init })
  if (!response.ok) {
    if (response.status === 401)
      throw new DishApiError('Your session has expired. Please sign in again.')
    if (response.status === 403) throw new DishApiError('You do not have access to that action.')
    let body: { message?: string; fieldErrors?: Record<string, string> } = {}
    try {
      body = (await response.json()) as typeof body
    } catch {
      // Preserve a useful generic error when an intermediary returns no JSON.
    }
    throw new DishApiError(
      body.message ?? 'Something went wrong. Please try again.',
      body.fieldErrors,
    )
  }
  return response.json() as Promise<T>
}

export const dishesApi = {
  list: () => request<Dish[]>('/api/v1/dishes'),
  get: (id: string) => request<Dish>(`/api/v1/dishes/${id}`),
  create: async (dish: DishInput) =>
    request<Dish>('/api/v1/dishes', {
      method: 'POST',
      headers: await csrfHeaders(),
      body: JSON.stringify(dish),
    }),
  update: async (id: string, dish: DishInput) =>
    request<Dish>(`/api/v1/dishes/${id}`, {
      method: 'PUT',
      headers: await csrfHeaders(),
      body: JSON.stringify(dish),
    }),
}
