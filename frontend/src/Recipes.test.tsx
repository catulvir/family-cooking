import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'

const recipe = {
  id: 'recipe-1',
  name: 'Pumpkin soup',
  servings: 4,
  notes: 'Family recipe',
  ingredients: [
    { name: 'Pumpkin', quantity: '1/2', unit: 'kg' },
    { name: 'Salt', quantity: 'to taste', unit: null },
  ],
  instructions: [{ text: 'Chop.' }, { text: 'Cook.' }],
  createdBy: 'member-1',
  createdAt: '2026-11-14T10:00:00Z',
  updatedAt: '2026-11-14T10:00:00Z',
  version: 0,
  canEdit: true,
}
let saved: typeof recipe
let entries: (typeof recipe)[]
let failure: number | undefined
let writes: RequestInit[]
let pending: (() => void) | undefined
let deferSave: boolean
let readFailure: 'list' | 'detail' | undefined
beforeEach(() => {
  saved = structuredClone(recipe)
  entries = []
  failure = undefined
  writes = []
  pending = undefined
  deferSave = false
  readFailure = undefined
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
      if (path === '/api/v1/dishes') return respond([])
      if (path.startsWith('/api/v1/recipes') && init.method) {
        writes.push(init)
        if (deferSave)
          await new Promise<void>((resolve) => {
            pending = resolve
          })
        if (failure)
          return respond(
            {
              message:
                failure === 409
                  ? 'This recipe changed. Your changes have not been saved.'
                  : 'Save failed.',
            },
            failure,
          )
        saved = {
          ...saved,
          ...JSON.parse(init.body as string),
          version: init.method === 'PUT' ? saved.version + 1 : 0,
        }
        entries = [saved]
        return respond(saved, init.method === 'POST' ? 201 : 200)
      }
      if (path === '/api/v1/recipes') {
        if (readFailure === 'list') return respond({}, 503)
        const page = Number(parsed.searchParams.get('page') ?? 0)
        return respond({
          items: entries.slice(page * 20, (page + 1) * 20),
          page,
          size: 20,
          totalElements: entries.length,
          totalPages: Math.ceil(entries.length / 20),
        })
      }
      if (path === '/api/v1/recipes/recipe-1')
        return readFailure === 'detail' ? respond({}, 503) : respond(saved)
      throw new Error(`Unexpected request: ${path}`)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())
async function openLibrary() {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Recipes' }))
  await screen.findByRole('button', { name: 'New recipe' })
}
async function fillRecipe() {
  await openLibrary()
  fireEvent.click(screen.getByRole('button', { name: 'New recipe' }))
  fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: '  Pumpkin soup  ' } })
  fireEvent.change(screen.getByLabelText('Ingredient 1'), { target: { value: 'Pumpkin' } })
  fireEvent.change(screen.getByLabelText('Quantity 1 (optional)'), { target: { value: '1/2' } })
  fireEvent.change(screen.getByLabelText('Unit 1 (optional)'), { target: { value: 'kg' } })
  fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: 'Chop.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
  fireEvent.change(screen.getByLabelText('Ingredient 2'), { target: { value: 'Salt' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
  fireEvent.change(screen.getByLabelText('Step 2'), { target: { value: 'Cook.' } })
}

it('creates a recipe with ordered content and opens its detail', async () => {
  await fillRecipe()
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  expect(await screen.findByRole('heading', { name: 'Pumpkin soup' })).toHaveFocus()
  expect(screen.getByText('1/2 kg Pumpkin')).toBeInTheDocument()
  expect(screen.getByText('Cook.')).toBeInTheDocument()
  expect(writes).toHaveLength(1)
  expect(writes[0].headers).toMatchObject({ 'X-CSRF-TOKEN': 'csrf' })
  expect(JSON.parse(writes[0].body as string).ingredients[1].name).toBe('Salt')
})

it('loads detail and saves edits with the version received from the server', async () => {
  entries = [saved]
  await openLibrary()
  fireEvent.click(await screen.findByRole('button', { name: 'Pumpkin soup' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit recipe' }))
  expect(screen.getByLabelText('Ingredient 2')).toHaveValue('Salt')
  fireEvent.change(screen.getByLabelText('Step 2'), { target: { value: 'Simmer.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  await screen.findByRole('heading', { name: 'Pumpkin soup' })
  expect(screen.getByText('Simmer.')).toBeInTheDocument()
  expect(writes[0].method).toBe('PUT')
  expect(JSON.parse(writes[0].body as string).version).toBe(0)
})

it('hides editing when the server denies edit permission', async () => {
  saved.canEdit = false
  entries = [saved]
  await openLibrary()
  fireEvent.click(await screen.findByRole('button', { name: 'Pumpkin soup' }))
  await screen.findByRole('heading', { name: 'Pumpkin soup' })
  expect(screen.queryByRole('button', { name: 'Edit recipe' })).not.toBeInTheDocument()
})

it('retains a conflicting draft and guards a pending submission', async () => {
  failure = 409
  deferSave = true
  await fillRecipe()
  const button = screen.getByRole('button', { name: 'Save recipe' })
  fireEvent.click(button)
  fireEvent.click(button)
  await waitFor(() => expect(pending).toBeDefined())
  expect(writes).toHaveLength(1)
  pending!()
  expect(await screen.findByRole('alert')).toHaveTextContent('This recipe changed')
  expect(screen.getByLabelText('Recipe name')).toHaveValue('  Pumpkin soup  ')
  expect(screen.getByLabelText('Step 2')).toHaveValue('Cook.')
  expect(screen.getByRole('button', { name: 'Save recipe' })).toBeEnabled()
})

it('validates content and preserves a recipe draft across navigation', async () => {
  await openLibrary()
  fireEvent.click(screen.getByRole('button', { name: 'New recipe' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  await waitFor(() => expect(screen.getByLabelText('Recipe name')).toHaveFocus())
  expect(writes).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'Draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
  expect(screen.queryByRole('textbox', { name: 'Recipe name' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Recipes' }))
  expect(screen.getByLabelText('Recipe name')).toHaveValue('Draft')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByLabelText('Recipe name')).toHaveValue('Draft')
})

it('pages the library and keeps the page when returning from detail', async () => {
  entries = Array.from({ length: 21 }, (_, index) => ({
    ...saved,
    id: index === 20 ? saved.id : `item-${index}`,
    name: index === 20 ? saved.name : `Recipe ${index}`,
  }))
  await openLibrary()
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Pumpkin soup' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Back to recipes' }))
  expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pumpkin soup' })).toHaveFocus())
})

it('retries failed library and detail requests', async () => {
  entries = [saved]
  readFailure = 'list'
  await openLibrary()
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  readFailure = undefined
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  readFailure = 'detail'
  fireEvent.click(await screen.findByRole('button', { name: 'Pumpkin soup' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  readFailure = undefined
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { name: 'Pumpkin soup' })).toBeInTheDocument()
})

it('discards an edit only explicitly and reloads the current version', async () => {
  entries = [saved]
  await openLibrary()
  fireEvent.click(await screen.findByRole('button', { name: 'Pumpkin soup' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit recipe' }))
  fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'Unsaved name' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Keep editing' }), { key: 'Escape' })
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  saved = { ...saved, name: 'Updated by administrator', version: 1 }
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  await screen.findByRole('heading', { name: 'Updated by administrator' })
  expect(screen.getByRole('button', { name: 'Edit recipe' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Edit recipe' }))
  expect(screen.getByLabelText('Recipe name')).toHaveValue('Updated by administrator')
  expect(writes).toHaveLength(0)
})
