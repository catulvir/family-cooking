const apiOrigin = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

export interface Ingredient {
  name: string
  quantity: string | null
  unit: string | null
}
export interface RecipeInput {
  name: string
  servings: number | null
  notes: string | null
  ingredients: Ingredient[]
  instructions: { text: string }[]
  version?: number
}
export interface RecipeSummary {
  id: string
  name: string
  servings: number | null
  canEdit: boolean
}
export interface Recipe extends RecipeInput, RecipeSummary {
  createdBy: string
  createdAt: string
  updatedAt: string
  version: number
}
export interface RecipePage {
  items: RecipeSummary[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export class RecipeApiError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
    readonly status?: number,
  ) {
    super(message)
  }
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, { credentials: 'include', ...init })
  if (!response.ok) {
    if (response.status === 401)
      throw new RecipeApiError('Your session has expired. Please sign in again.', {}, 401)
    if (response.status === 403)
      throw new RecipeApiError('You do not have access to that action.', {}, 403)
    let body: { message?: string; fieldErrors?: Record<string, string> } = {}
    try {
      body = await response.json()
    } catch {
      /* Keep a useful message for non-JSON failures. */
    }
    throw new RecipeApiError(
      body.message ?? 'Something went wrong. Please try again.',
      body.fieldErrors,
      response.status,
    )
  }
  return response.json() as Promise<T>
}
async function save(path: string, method: string, input: RecipeInput) {
  const { token } = await request<{ token: string }>('/api/v1/auth/csrf')
  return request<Recipe>(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
    body: JSON.stringify(input),
  })
}
export const recipesApi = {
  list: (page = 0) => request<RecipePage>(`/api/v1/recipes?page=${page}&size=20`),
  get: (id: string) => request<Recipe>(`/api/v1/recipes/${id}`),
  create: (input: RecipeInput) => save('/api/v1/recipes', 'POST', input),
  update: (id: string, input: RecipeInput) => save(`/api/v1/recipes/${id}`, 'PUT', input),
}
