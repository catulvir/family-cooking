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
  tagIds?: string[]
}
export const tagGroups = { MEAL_TYPE: 'Meal type', CUISINE: 'Cuisine', STYLE: 'Style' } as const
export type TagGroup = keyof typeof tagGroups
export interface RecipeTag {
  id: string
  name: string
  group: TagGroup
}
export type TagCatalogue = Record<TagGroup, RecipeTag[]>
export interface RecipeSummary {
  id: string
  name: string
  servings: number | null
  canEdit: boolean
  tags?: RecipeTag[]
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
export const recipeSorts = {
  name_asc: 'Name A–Z',
  name_desc: 'Name Z–A',
  newest: 'Newest added',
} as const
export type RecipeSort = keyof typeof recipeSorts
export interface RecipeQuery {
  q: string
  tagIds: string[]
  sort: RecipeSort
  page: number
  size: number
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
async function save<T>(path: string, method: string, input: unknown): Promise<T> {
  const { token } = await request<{ token: string }>('/api/v1/auth/csrf')
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
    body: JSON.stringify(input),
  })
}
export const recipesApi = {
  list: (query: Partial<RecipeQuery> = {}) => {
    const params = new URLSearchParams({
      page: String(query.page ?? 0),
      size: String(query.size ?? 20),
      q: query.q ?? '',
      sort: query.sort ?? 'name_asc',
    })
    for (const id of query.tagIds ?? []) params.append('tagId', id)
    return request<RecipePage>(`/api/v1/recipes?${params}`)
  },
  get: (id: string) => request<Recipe>(`/api/v1/recipes/${id}`),
  create: (input: RecipeInput) => save<Recipe>('/api/v1/recipes', 'POST', input),
  update: (id: string, input: RecipeInput) => save<Recipe>(`/api/v1/recipes/${id}`, 'PUT', input),
}
export const recipeTagsApi = {
  list: () => request<TagCatalogue>('/api/v1/recipe-tags'),
  create: (name: string, group: TagGroup) =>
    save<RecipeTag>('/api/v1/recipe-tags', 'POST', { name, group }),
  rename: (id: string, name: string) =>
    save<RecipeTag>(`/api/v1/recipe-tags/${id}`, 'PUT', { name }),
}
