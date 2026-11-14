import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'

const baseRecipe = {
  id: 'r1',
  name: 'Family soup',
  servings: 4,
  notes: null,
  ingredients: [{ name: 'Water', quantity: null, unit: null }],
  instructions: [{ text: 'Boil' }],
  tags: [],
  version: 0,
  canEdit: false,
}
const baseMeal = {
  id: 'm1',
  name: 'Sunday lunch',
  preparedOn: '2026-11-08',
  location: 'Home',
  notes: 'Meal notes',
  createdBy: 'member',
  createdAt: '2026-11-08T12:00:00Z',
  updatedAt: '2026-11-08T12:00:00Z',
  canEdit: true,
  recipe: { id: 'r1', name: 'Family soup' } as { id: string; name: string } | null,
}
let recipes: (typeof baseRecipe)[]
let meals: (typeof baseMeal)[]
let writes: { path: string; init: RequestInit }[]
let recipeRequests: URLSearchParams[]
let saveFailure: boolean
let pendingSave: (() => void) | undefined
let delaySave: boolean
let recipeFailure: boolean
beforeEach(() => {
  recipes = [{ ...baseRecipe }, { ...baseRecipe, id: 'r2', name: 'Tea' }]
  meals = []
  writes = []
  recipeRequests = []
  saveFailure = false
  delaySave = false
  pendingSave = undefined
  recipeFailure = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const parsed = new URL(url, 'http://localhost')
      const path = parsed.pathname
      const respond = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status })
      if (path === '/api/v1/auth/me')
        return respond({
          email: 'member@example.com',
          role: 'MEMBER',
          status: 'ACTIVE',
          mustChangePassword: false,
        })
      if (path === '/api/v1/auth/csrf') return respond({ token: 'csrf' })
      if (path === '/api/v1/recipe-tags') return respond({ MEAL_TYPE: [], CUISINE: [], STYLE: [] })
      if (path === '/api/v1/recipes') {
        recipeRequests.push(parsed.searchParams)
        const page = Number(parsed.searchParams.get('page') ?? 0)
        const q = parsed.searchParams.get('q') ?? ''
        const matching = recipes.filter((item) => item.name.toLowerCase().includes(q.toLowerCase()))
        return recipeFailure
          ? respond({}, 503)
          : respond({
              items: matching.slice(page * 20, (page + 1) * 20),
              page,
              size: 20,
              totalElements: matching.length,
              totalPages: Math.ceil(matching.length / 20),
            })
      }
      if (path.startsWith('/api/v1/recipes/'))
        return recipeFailure
          ? respond({}, 503)
          : respond(recipes.find((item) => path.endsWith(item.id)))
      if (path.startsWith('/api/v1/dishes') && init.method) {
        writes.push({ path, init })
        if (delaySave)
          await new Promise<void>((resolve) => {
            pendingSave = resolve
          })
        if (saveFailure)
          return respond(
            {
              message: 'Meal save failed.',
              fieldErrors: { recipeId: 'Select an existing recipe.' },
            },
            400,
          )
        const body = JSON.parse(init.body as string)
        const linked = recipes.find((item) => item.id === body.recipeId)
        const saved = {
          ...baseMeal,
          ...body,
          recipe: linked ? { id: linked.id, name: linked.name } : null,
        }
        meals = [saved]
        return respond(saved, init.method === 'POST' ? 201 : 200)
      }
      if (path === '/api/v1/dishes') return respond(meals)
      if (path.startsWith('/api/v1/dishes/')) return respond(meals[0])
      throw new Error(path)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())
async function openRecipe() {
  fireEvent.click(await screen.findByRole('button', { name: 'Recipes' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Family soup' }))
  await screen.findByRole('heading', { name: 'Family soup' })
}
function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

it('records a readable recipe as one separate meal with local date and retains the link on failed save', async () => {
  render(<App />)
  await openRecipe()
  expect(screen.queryByRole('button', { name: 'Edit recipe' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Record cooking this recipe' }))
  expect(await screen.findByLabelText('Meal name')).toHaveValue('Family soup')
  expect(screen.getByLabelText('Meal date')).toHaveValue(today())
  expect(screen.getByLabelText('Location (optional)')).toHaveValue('')
  expect(screen.getByLabelText('Notes (optional)')).toHaveValue('')
  expect(writes).toHaveLength(0)
  saveFailure = true
  delaySave = true
  const form = screen.getByRole('button', { name: 'Save meal' }).closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  await waitFor(() => expect(writes).toHaveLength(1))
  await act(async () => pendingSave!())
  await screen.findByText('Select an existing recipe.')
  expect(screen.getByLabelText('Meal name')).toHaveValue('Family soup')
  expect(screen.getByText('Selected recipe: Family soup')).toBeVisible()
  saveFailure = false
  delaySave = false
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))
  await screen.findByRole('heading', { name: 'Family soup' })
  expect(writes).toHaveLength(2)
  expect(JSON.parse(writes[1].init.body as string).recipeId).toBe('r1')
  expect(writes.every((write) => write.path === '/api/v1/dishes')).toBe(true)
  expect(screen.getByRole('button', { name: 'View recipe: Family soup' })).toBeVisible()
})

it('cancels an untouched recipe-started meal back to its source without saving', async () => {
  render(<App />)
  await openRecipe()
  fireEvent.click(screen.getByRole('button', { name: 'Record cooking this recipe' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
  await screen.findByRole('heading', { name: 'Family soup' })
  expect(screen.queryByRole('button', { name: 'Discard changes' })).not.toBeInTheDocument()
  expect(writes).toHaveLength(0)
})

it.each(['create', 'edit'])(
  'preserves an existing %s draft until replacement is explicitly confirmed',
  async (kind) => {
    if (kind === 'edit') meals = [{ ...baseMeal }]
    render(<App />)
    if (kind === 'edit') {
      fireEvent.click(await screen.findByRole('button', { name: 'Sunday lunch' }))
      fireEvent.click(screen.getByRole('button', { name: 'Edit meal' }))
    } else fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Existing draft' } })
    await openRecipe()
    fireEvent.click(screen.getByRole('button', { name: 'Record cooking this recipe' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue existing meal' }))
    expect(screen.getByLabelText('Meal name')).toHaveValue('Existing draft')
    fireEvent.click(screen.getByRole('button', { name: 'Recipes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record cooking this recipe' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new meal' }))
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Meal name')).toHaveValue('Existing draft')
    expect(screen.getByRole('button', { name: 'Start a new meal' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Start a new meal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.getByLabelText('Meal name')).toHaveValue('Family soup')
    expect(screen.getByRole('heading', { name: 'Record a meal' })).toBeVisible()
    expect(screen.getByLabelText('Notes (optional)')).toHaveValue('')
    expect(writes).toHaveLength(0)
  },
)

it('does not replace a meal while its save is pending, including a hidden completion', async () => {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
  fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Pending meal' } })
  delaySave = true
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))
  await waitFor(() => expect(pendingSave).toBeDefined())
  await openRecipe()
  fireEvent.click(screen.getByRole('button', { name: 'Record cooking this recipe' }))
  expect(await screen.findByRole('button', { name: 'Start a new meal' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Recipes' }))
  const heading = screen.getByRole('heading', { name: 'Family soup' })
  await act(async () => pendingSave!())
  expect(heading).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
  expect(screen.getByRole('heading', { name: 'Pending meal' })).toBeVisible()
  expect(screen.queryByLabelText('Meal name')).not.toBeInTheDocument()
})

it('selects replaces and clears a recipe without overwriting entered meal fields', async () => {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
  fireEvent.click(screen.getByRole('button', { name: 'Choose recipe' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Select Family soup' }))
  expect(screen.getByLabelText('Meal name')).toHaveValue('Family soup')
  fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'My own name' } })
  fireEvent.change(screen.getByLabelText('Meal date'), { target: { value: '2026-10-20' } })
  fireEvent.change(screen.getByLabelText('Location (optional)'), { target: { value: 'Garden' } })
  fireEvent.change(screen.getByLabelText('Notes (optional)'), { target: { value: 'Keep notes' } })
  fireEvent.click(screen.getByRole('button', { name: 'Change recipe' }))
  fireEvent.change(await screen.findByLabelText('Find a recipe'), { target: { value: 'Tea' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search recipes' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Select Tea' }))
  expect(screen.getByLabelText('Meal name')).toHaveValue('My own name')
  expect(screen.getByLabelText('Meal date')).toHaveValue('2026-10-20')
  expect(screen.getByLabelText('Location (optional)')).toHaveValue('Garden')
  expect(screen.getByLabelText('Notes (optional)')).toHaveValue('Keep notes')
  expect(recipeRequests.some((query) => query.get('q') === 'Tea')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Clear recipe' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))
  await screen.findByRole('heading', { name: 'My own name' })
  expect(JSON.parse(writes[0].init.body as string).recipeId).toBeNull()
})

it('opens the current linked recipe and returns to the same meal without replacing a recipe draft', async () => {
  meals = [{ ...baseMeal }]
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Recipes' }))
  fireEvent.click(screen.getByRole('button', { name: 'New recipe' }))
  fireEvent.change(screen.getByLabelText('Recipe name'), {
    target: { value: 'Unrelated recipe draft' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sunday lunch' }))
  recipes[0].name = 'Renamed soup'
  fireEvent.click(screen.getByRole('button', { name: 'View recipe: Family soup' }))
  await screen.findByRole('heading', { name: 'Renamed soup' })
  fireEvent.click(screen.getByRole('button', { name: 'Back to meal' }))
  expect(screen.getByRole('heading', { name: 'Sunday lunch' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Recipes' }))
  expect(screen.getByLabelText('Recipe name')).toHaveValue('Unrelated recipe draft')
  expect(writes).toHaveLength(0)
})

it('paginates the selector and retries failed searches while keeping meal input', async () => {
  recipes = Array.from({ length: 21 }, (_, index) => ({
    ...baseRecipe,
    id: `r-${index}`,
    name: `Recipe ${index}`,
  }))
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
  fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Still here' } })
  fireEvent.click(screen.getByRole('button', { name: 'Choose recipe' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Next recipes' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Select Recipe 20' }))
  expect(screen.getByLabelText('Meal name')).toHaveValue('Still here')
  expect(recipeRequests.some((query) => query.get('page') === '1')).toBe(true)
  recipeFailure = true
  fireEvent.click(screen.getByRole('button', { name: 'Change recipe' }))
  await screen.findByRole('button', { name: 'Retry recipe search' })
  recipeFailure = false
  fireEvent.click(screen.getByRole('button', { name: 'Retry recipe search' }))
  await screen.findByRole('button', { name: 'Select Recipe 0' })
  expect(screen.getByText('Selected recipe: Recipe 20')).toBeVisible()
  expect(screen.getByLabelText('Meal name')).toHaveValue('Still here')
})

it('refreshes a linked recipe when reopening it after visiting another main view', async () => {
  meals = [{ ...baseMeal }]
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Sunday lunch' }))
  fireEvent.click(screen.getByRole('button', { name: 'View recipe: Family soup' }))
  await screen.findByRole('heading', { name: 'Family soup' })
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
  recipes[0].name = 'Latest soup'
  fireEvent.click(screen.getByRole('button', { name: 'View recipe: Family soup' }))
  expect(await screen.findByRole('heading', { name: 'Latest soup' })).toBeVisible()
})
