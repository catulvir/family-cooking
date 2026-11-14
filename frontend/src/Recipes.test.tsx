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
let serverErrors: Record<string, string>
let logoutFailure: boolean
let role: 'MEMBER' | 'ADMIN'
let deferRead: boolean
let pendingRead: (() => void) | undefined
let detailReads: number
let deferList: boolean
let pendingList: (() => void) | undefined
beforeEach(() => {
  saved = structuredClone(recipe)
  entries = []
  failure = undefined
  writes = []
  pending = undefined
  deferSave = false
  readFailure = undefined
  serverErrors = {}
  logoutFailure = false
  role = 'MEMBER'
  deferRead = false
  pendingRead = undefined
  detailReads = 0
  deferList = false
  pendingList = undefined
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
          role,
          status: 'ACTIVE',
          mustChangePassword: false,
        })
      if (path === '/api/v1/auth/csrf') return respond({ token: 'csrf' })
      if (path === '/api/v1/auth/login')
        return respond({
          email: 'member@example.com',
          role,
          status: 'ACTIVE',
          mustChangePassword: false,
        })
      if (path === '/api/v1/auth/logout')
        return logoutFailure ? respond({}, 503) : new Response(null, { status: 204 })
      if (path === '/api/v1/admin/users') return respond([])
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
              fieldErrors: serverErrors,
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
        if (deferList)
          await new Promise<void>((resolve) => {
            pendingList = resolve
          })
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
      if (path === '/api/v1/recipes/recipe-1') {
        detailReads++
        if (deferRead)
          await new Promise<void>((resolve) => {
            pendingRead = resolve
          })
        return readFailure === 'detail' ? respond({}, 503) : respond(saved)
      }
      throw new Error(`Unexpected request: ${path}`)
    }),
  )
})

async function editRecipe() {
  entries = [saved]
  await openLibrary()
  fireEvent.click(await screen.findByRole('button', { name: 'Pumpkin soup' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit recipe' }))
}

it('moves recipe rows with stable field identity, keeps quantities and reloads saved order', async () => {
  await editRecipe()
  const saltId = screen.getByLabelText('Ingredient 2').id
  fireEvent.click(screen.getByRole('button', { name: 'Move ingredient 2 up' }))
  expect(screen.getByLabelText('Ingredient 1')).toHaveValue('Salt')
  expect(screen.getByLabelText('Ingredient 1').id).toBe(saltId)
  expect(screen.getByLabelText('Ingredient 1')).toHaveFocus()
  expect(screen.getByLabelText('Quantity 2 (optional)')).toHaveValue('1/2')
  expect(screen.getByRole('button', { name: 'Move ingredient 1 up' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Move step 1 down' }))
  expect(screen.getByLabelText('Step 2')).toHaveValue('Chop.')
  expect(screen.getByLabelText('Step 2')).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Move step 2 down' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  await screen.findByRole('heading', { name: 'Pumpkin soup' })
  fireEvent.click(screen.getByRole('button', { name: 'Back to recipes' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Pumpkin soup' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit recipe' }))
  expect(screen.getByLabelText('Ingredient 1')).toHaveValue('Salt')
  expect(screen.getByLabelText('Step 1')).toHaveValue('Cook.')
  expect(JSON.parse(writes[0].body as string).ingredients[0]).toEqual({
    name: 'Salt',
    quantity: 'to taste',
    unit: null,
  })
})

it('focuses added and surviving rows and exposes actionable empty-list errors', async () => {
  await editRecipe()
  fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
  expect(screen.getByLabelText('Ingredient 3')).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Remove ingredient 3' }))
  expect(screen.getByLabelText('Ingredient 2')).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Remove ingredient 1' }))
  expect(screen.getByLabelText('Ingredient 1')).toHaveValue('Salt')
  expect(screen.getByLabelText('Ingredient 1')).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Remove ingredient 1' }))
  expect(screen.getByRole('button', { name: 'Add ingredient' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Remove step 2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove step 1' }))
  expect(screen.getByRole('button', { name: 'Add step' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add ingredient' })).toHaveFocus())
  expect(screen.getByRole('button', { name: 'Add ingredient' })).toHaveAccessibleDescription(
    'Add at least one ingredient.',
  )
  expect(screen.getByRole('button', { name: 'Add step' })).toHaveAccessibleDescription(
    'Add at least one instruction step.',
  )
  expect(writes).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
  expect(screen.getByLabelText('Step 1')).toHaveFocus()
})

it('keeps nested server errors attached to moved rows without stealing the move focus', async () => {
  await editRecipe()
  failure = 400
  serverErrors = {
    'ingredients[1].quantity': 'Check this quantity.',
    'instructions[0].text': 'Check this step.',
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  await waitFor(() => expect(screen.getByLabelText('Quantity 2 (optional)')).toHaveFocus())
  fireEvent.click(screen.getByRole('button', { name: 'Move ingredient 2 up' }))
  expect(screen.getByLabelText('Quantity 1 (optional)')).toHaveAccessibleDescription(
    'Check this quantity.',
  )
  expect(screen.getByLabelText('Ingredient 1')).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Move step 1 down' }))
  expect(screen.getByLabelText('Step 2')).toHaveAccessibleDescription('Check this step.')
  expect(screen.getByLabelText('Step 2')).toHaveFocus()
  fireEvent.change(screen.getByLabelText('Step 2'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  await waitFor(() =>
    expect(screen.getByLabelText('Step 2')).toHaveAccessibleDescription('Enter an instruction.'),
  )
  expect(screen.getByLabelText('Step 2')).toHaveFocus()
  expect(writes).toHaveLength(1)
})

it('reloads a conflicting recipe only after explicit discard and preserves the draft on reload failure', async () => {
  await editRecipe()
  fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'My draft' } })
  failure = 409
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Reload latest recipe' }))
  expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Keep editing' }), { key: 'Escape' })
  expect(screen.getByRole('button', { name: 'Reload latest recipe' })).toHaveFocus()
  expect(screen.getByLabelText('Recipe name')).toHaveValue('My draft')
  readFailure = 'detail'
  fireEvent.click(screen.getByRole('button', { name: 'Reload latest recipe' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard and reload' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  expect(screen.getByLabelText('Recipe name')).toHaveValue('My draft')
  expect(screen.getByRole('button', { name: 'Reload latest recipe' })).toHaveFocus()
  saved = { ...saved, name: 'Updated recipe', version: 3 }
  readFailure = undefined
  fireEvent.click(screen.getByRole('button', { name: 'Reload latest recipe' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard and reload' }))
  await screen.findByRole('heading', { name: 'Updated recipe' })
  fireEvent.click(screen.getByRole('button', { name: 'Edit recipe' }))
  failure = undefined
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  await screen.findByRole('heading', { name: 'Updated recipe' })
  expect(JSON.parse(writes[1].body as string).version).toBe(3)
})

it('locks a pending reload, ignores duplicate actions, and honors refreshed edit permission without stealing hidden focus', async () => {
  await editRecipe()
  fireEvent.change(screen.getByLabelText('Recipe notes (optional)'), {
    target: { value: 'Local notes' },
  })
  failure = 409
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Reload latest recipe' }))
  saved = { ...saved, name: 'Latest recipe', version: 2, canEdit: false }
  deferRead = true
  const discard = screen.getByRole('button', { name: 'Discard and reload' })
  fireEvent.click(discard)
  fireEvent.click(discard)
  await waitFor(() => expect(pendingRead).toBeDefined())
  expect(detailReads).toBe(2)
  expect(screen.getByRole('button', { name: 'Save recipe' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByLabelText('Ingredient 1')).toBeDisabled()
  fireEvent.submit(screen.getByRole('button', { name: 'Save recipe' }).closest('form')!)
  expect(writes).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
  pendingRead!()
  await waitFor(() =>
    expect(screen.queryByLabelText('Recipe notes (optional)')).not.toBeInTheDocument(),
  )
  expect(screen.getByRole('heading', { name: 'Meal journal' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Recipes' }))
  expect(screen.getByRole('heading', { name: 'Latest recipe' })).toHaveFocus()
  expect(screen.queryByRole('button', { name: 'Edit recipe' })).not.toBeInTheDocument()
})

it.each([401, 403, 500])('preserves the recipe draft after a %s save failure', async (status) => {
  await editRecipe()
  fireEvent.change(screen.getByLabelText('Recipe notes (optional)'), {
    target: { value: 'Unsaved notes' },
  })
  failure = status
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  const error = await screen.findByRole('alert')
  expect(error).toHaveTextContent(
    status === 401 ? 'session has expired' : status === 403 ? 'do not have access' : 'Save failed',
  )
  expect(screen.getByLabelText('Recipe notes (optional)')).toHaveValue('Unsaved notes')
  expect(screen.getByRole('button', { name: 'Save recipe' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Reload latest recipe' })).not.toBeInTheDocument()
})

it('cancels pristine and fully reverted row edits without confirmation', async () => {
  await editRecipe()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit recipe' }))
  fireEvent.click(screen.getByRole('button', { name: 'Move ingredient 1 down' }))
  fireEvent.click(screen.getByRole('button', { name: 'Move ingredient 2 up' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove step 3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(await screen.findByRole('heading', { name: 'Pumpkin soup' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Discard changes' })).not.toBeInTheDocument()
  expect(writes).toHaveLength(0)
})

it('preserves ordered recipe and account drafts on navigation and failed logout, then clears them on successful logout', async () => {
  role = 'ADMIN'
  await editRecipe()
  fireEvent.click(screen.getByRole('button', { name: 'Move ingredient 2 up' }))
  fireEvent.change(screen.getByLabelText('Servings (optional)'), { target: { value: '6' } })
  fireEvent.change(screen.getByLabelText('Recipe notes (optional)'), {
    target: { value: 'Draft notes' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  fireEvent.click(screen.getByRole('button', { name: 'Family accounts' }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'draft@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Recipes' }))
  expect(screen.getByLabelText('Ingredient 1')).toHaveValue('Salt')
  expect(screen.getByLabelText('Servings (optional)')).toHaveValue('6')
  logoutFailure = true
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Recipe notes (optional)')).toHaveValue('Draft notes')
  if (screen.getByRole('button', { name: 'Account' }).getAttribute('aria-expanded') === 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  fireEvent.click(screen.getByRole('button', { name: 'Family accounts' }))
  expect(screen.getByLabelText('Email')).toHaveValue('draft@example.com')
  logoutFailure = false
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await screen.findByRole('button', { name: 'Sign in' })
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'member@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Recipes' }))
  fireEvent.click(await screen.findByRole('button', { name: 'New recipe' }))
  expect(screen.getByLabelText('Recipe name')).toHaveValue('')
  expect(screen.getByLabelText('Ingredient 1')).toHaveValue('')
})

it('keeps hidden pending-save errors from stealing journal focus and retries with the complete draft', async () => {
  await editRecipe()
  fireEvent.change(screen.getByLabelText('Recipe notes (optional)'), {
    target: { value: 'Keep these notes' },
  })
  deferSave = true
  failure = 400
  serverErrors = { 'instructions[1].text': 'Check this instruction.' }
  const saveButton = screen.getByRole('button', { name: 'Save recipe' })
  fireEvent.click(saveButton)
  fireEvent.click(saveButton)
  await waitFor(() => expect(pending).toBeDefined())
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Move ingredient 2 up' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
  const journalHeading = screen.getByRole('heading', { name: 'Meal journal' })
  pending!()
  await waitFor(() =>
    expect(screen.getByLabelText('Step 2')).toHaveAttribute('aria-invalid', 'true'),
  )
  expect(journalHeading).toHaveFocus()
  expect(writes).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Recipes' }))
  expect(screen.getByLabelText('Recipe notes (optional)')).toHaveValue('Keep these notes')
  deferSave = false
  failure = undefined
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  await screen.findByRole('heading', { name: 'Pumpkin soup' })
  expect(JSON.parse(writes[1].body as string).notes).toBe('Keep these notes')
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
  const next = await screen.findByRole('button', { name: 'Next' })
  next.focus()
  fireEvent.click(next)
  await screen.findByText('Page 2 of 2')
  expect(screen.getByRole('heading', { name: 'Recipes' })).toHaveFocus()
  fireEvent.click(await screen.findByRole('button', { name: 'Pumpkin soup' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Back to recipes' }))
  expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pumpkin soup' })).toHaveFocus())
  const previous = screen.getByRole('button', { name: 'Previous' })
  previous.focus()
  fireEvent.click(previous)
  await screen.findByText('Page 1 of 2')
  expect(screen.getByRole('heading', { name: 'Recipes' })).toHaveFocus()
})

it.each(['success', 'failure', 'navigation'] as const)(
  'keeps pagination focus predictable during a delayed %s',
  async (outcome) => {
    entries = Array.from({ length: 21 }, (_, index) => ({
      ...saved,
      id: `item-${index}`,
      name: `Recipe ${index}`,
    }))
    await openLibrary()
    const next = await screen.findByRole('button', { name: 'Next' })
    deferList = true
    next.focus()
    fireEvent.click(next)
    await waitFor(() => expect(pendingList).toBeDefined())
    expect(screen.getByRole('heading', { name: 'Recipes' })).toHaveFocus()
    if (outcome === 'failure') readFailure = 'list'
    if (outcome === 'navigation') fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
    pendingList!()
    if (outcome === 'failure') await screen.findByRole('alert')
    else await screen.findByText('Page 2 of 2')
    expect(
      screen.getByRole('heading', { name: outcome === 'navigation' ? 'Meal journal' : 'Recipes' }),
    ).toHaveFocus()
  },
)

it('clears a failed detail error when a newly created recipe opens', async () => {
  entries = [saved]
  readFailure = 'detail'
  await openLibrary()
  fireEvent.click(await screen.findByRole('button', { name: 'Pumpkin soup' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  fireEvent.click(screen.getByRole('button', { name: 'Back to recipes' }))
  fireEvent.click(screen.getByRole('button', { name: 'New recipe' }))
  fireEvent.change(screen.getByLabelText('Recipe name'), {
    target: { value: 'New recipe after failed detail' },
  })
  fireEvent.change(screen.getByLabelText('Ingredient 1'), { target: { value: 'Water' } })
  fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: 'Boil.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  await screen.findByRole('heading', { name: 'New recipe after failed detail' })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  expect(writes).toHaveLength(1)
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
