import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'

let role: string
let tags: { id: string; name: string; group: string }[]
let writes: { path: string; init: RequestInit }[]
let failure: number | undefined
let listFailure: boolean
let pending: (() => void) | undefined
let delay: boolean
let logoutFailure: boolean
let saved: Record<string, unknown>
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
beforeEach(() => {
  role = 'ADMIN'
  tags = [
    { id: 'tag-1', name: 'Dinner', group: 'MEAL_TYPE' },
    { id: 'tag-2', name: 'Latvian', group: 'CUISINE' },
  ]
  writes = []
  failure = undefined
  listFailure = false
  delay = false
  pending = undefined
  logoutFailure = false
  saved = {
    id: 'recipe-1',
    name: 'Soup',
    servings: null,
    notes: null,
    ingredients: [{ name: 'Water', quantity: null, unit: null }],
    instructions: [{ text: 'Boil' }],
    tags: [tags[0]],
    version: 0,
    canEdit: true,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = new URL(url, 'http://localhost').pathname
      if (path === '/api/v1/auth/me' || path === '/api/v1/auth/login')
        return respond({
          email: 'test@example.com',
          role,
          status: 'ACTIVE',
          mustChangePassword: false,
        })
      if (path === '/api/v1/auth/csrf') return respond({ token: 'csrf' })
      if (path === '/api/v1/auth/logout')
        return logoutFailure ? respond({}, 503) : new Response(null, { status: 204 })
      if (path === '/api/v1/dishes' || path === '/api/v1/admin/users') return respond([])
      if (path.startsWith('/api/v1/recipe-tags') && init.method) {
        writes.push({ path, init })
        if (delay)
          await new Promise<void>((resolve) => {
            pending = resolve
          })
        if (failure)
          return respond(
            {
              message: 'Tag name already exists in this group.',
              fieldErrors: { name: 'Choose another name.' },
            },
            failure,
          )
        const body = JSON.parse(init.body as string)
        const tag =
          init.method === 'POST'
            ? { ...body, id: 'tag-new' }
            : { ...tags.find((item) => path.endsWith(item.id)), name: body.name }
        tags = [...tags.filter((item) => item.id !== tag.id), tag]
        saved.tags = (saved.tags as typeof tags).map((item) => (item.id === tag.id ? tag : item))
        return respond(tag, init.method === 'POST' ? 201 : 200)
      }
      if (path === '/api/v1/recipe-tags')
        return listFailure
          ? respond({}, 503)
          : respond(
              Object.fromEntries(
                ['MEAL_TYPE', 'CUISINE', 'STYLE'].map((group) => [
                  group,
                  tags.filter((tag) => tag.group === group),
                ]),
              ),
            )
      if (path.startsWith('/api/v1/recipes') && init.method) {
        writes.push({ path, init })
        const body = JSON.parse(init.body as string)
        saved = { ...saved, ...body, tags: tags.filter((tag) => body.tagIds.includes(tag.id)) }
        return respond(saved)
      }
      if (path === '/api/v1/recipes')
        return respond({ items: [saved], page: 0, size: 20, totalElements: 1, totalPages: 1 })
      if (path === '/api/v1/recipes/recipe-1') return respond(saved)
      throw new Error(path)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())
async function library() {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Recipes' }))
  await screen.findByRole('button', { name: 'Soup' })
}
async function manage() {
  await library()
  fireEvent.click(screen.getByRole('button', { name: 'Manage tags' }))
  await screen.findByRole('heading', { name: 'Manage tags' })
}
async function edit() {
  await library()
  fireEvent.click(screen.getByRole('button', { name: 'Soup' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit recipe' }))
}

it('members select grouped tags and see saved labels in detail and library without management actions', async () => {
  role = 'MEMBER'
  await edit()
  expect(screen.queryByRole('button', { name: 'Manage tags' })).not.toBeInTheDocument()
  const meal = await screen.findByRole('group', { name: 'Meal type' })
  expect(within(meal).getByRole('checkbox', { name: 'Dinner' })).toBeChecked()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Latvian' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  await screen.findByRole('heading', { name: 'Soup' })
  expect(JSON.parse(writes[0].init.body as string).tagIds).toEqual(['tag-1', 'tag-2'])
  expect(screen.getByText('Latvian')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Back to recipes' }))
  expect(await screen.findByText('Latvian')).toBeVisible()
})

it('tag management and main navigation preserve both drafts and refresh selected labels after rename', async () => {
  await edit()
  fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'Draft soup' } })
  fireEvent.click(screen.getByRole('button', { name: 'Manage tags' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Rename Dinner' }))
  fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'Evening meal' } })
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
  fireEvent.click(screen.getByRole('button', { name: 'Recipes' }))
  expect(screen.getByLabelText('Tag name')).toHaveValue('Evening meal')
  fireEvent.click(screen.getByRole('button', { name: 'Back to recipe' }))
  expect(screen.getByLabelText('Recipe name')).toHaveValue('Draft soup')
  expect(screen.getByRole('button', { name: 'Manage tags' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Manage tags' }))
  expect(screen.getByLabelText('Tag name')).toHaveValue('Evening meal')
  fireEvent.click(screen.getByRole('button', { name: 'Save tag' }))
  await screen.findByText('Tag saved.')
  expect(JSON.parse(writes[0].init.body as string)).toEqual({ name: 'Evening meal' })
  fireEvent.click(screen.getByRole('button', { name: 'Back to recipe' }))
  expect(screen.getByRole('checkbox', { name: 'Evening meal' })).toBeChecked()
  expect(screen.getByLabelText('Recipe name')).toHaveValue('Draft soup')
})

it('duplicate failures preserve tag draft focus and allow a single retry while saving', async () => {
  await manage()
  fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'Dinner' } })
  failure = 409
  fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  await screen.findByText('Choose another name.')
  expect(screen.getByLabelText('Tag name')).toHaveFocus()
  expect(screen.getByLabelText('Tag name')).toHaveValue('Dinner')
  failure = undefined
  delay = true
  fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'Breakfast' } })
  const form = screen.getByLabelText('Tag name').closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  await waitFor(() => expect(writes).toHaveLength(2))
  expect(screen.getByRole('button', { name: 'Back to recipe' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
  const journalHeading = screen.getByRole('heading', { name: 'Meal journal' })
  pending!()
  await waitFor(() => expect(tags.some((tag) => tag.name === 'Breakfast')).toBe(true))
  expect(journalHeading).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Recipes' }))
  expect(screen.getByText('Tag saved.')).toBeVisible()
})

it('switching tag editors requires explicit discard and reverted values cancel immediately', async () => {
  await manage()
  fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'Draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rename Dinner' }))
  expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Keep editing' }), { key: 'Escape' })
  expect(screen.getByLabelText('Tag name')).toHaveValue('Draft')
  expect(screen.getByRole('button', { name: 'Rename Dinner' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Rename Dinner' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(screen.getByLabelText('Tag name')).toHaveValue('Dinner')
  fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'Different' } })
  fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'Dinner' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel tag edit' }))
  expect(screen.queryByRole('button', { name: 'Discard changes' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Tag name')).toHaveValue('')
})

it('empty catalogue and failed catalogue retry preserve recipe input', async () => {
  tags = []
  saved.tags = []
  listFailure = true
  await edit()
  fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'Still here' } })
  fireEvent.click(await screen.findByRole('button', { name: 'Retry tags' }))
  listFailure = false
  fireEvent.click(await screen.findByRole('button', { name: 'Retry tags' }))
  await screen.findByText(/No tags yet/)
  expect(screen.getByLabelText('Recipe name')).toHaveValue('Still here')
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  await screen.findByRole('heading', { name: 'Still here' })
  expect(JSON.parse(writes[0].init.body as string).tagIds).toEqual([])
})

it('validates names before requests and sends normalized names with csrf', async () => {
  await manage()
  fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: '#Dinner' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  await screen.findByText('Use a name without hashtag punctuation.')
  expect(writes).toHaveLength(0)
  expect(screen.getByLabelText('Tag name')).toHaveFocus()
  fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: '  Quick   meals  ' } })
  fireEvent.change(screen.getByLabelText('Tag group'), { target: { value: 'STYLE' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  await screen.findByText('Tag saved.')
  expect(JSON.parse(writes[0].init.body as string)).toEqual({ name: 'Quick meals', group: 'STYLE' })
  expect(writes[0].init.headers).toMatchObject({ 'X-CSRF-TOKEN': 'csrf' })
  expect(screen.getByLabelText('Tag name')).toHaveFocus()
})

it('failed logout retains tag draft and successful logout clears it', async () => {
  await manage()
  fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'Private draft' } })
  logoutFailure = true
  fireEvent.click(screen.getByRole('button', { name: /Account/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Tag name')).toHaveValue('Private draft')
  logoutFailure = false
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await screen.findByRole('button', { name: 'Sign in' })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Recipes' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Manage tags' }))
  expect(screen.getByLabelText('Tag name')).toHaveValue('')
})

it('tag selection limits focus the group error and reverted selection cancels without discard', async () => {
  tags = Array.from({ length: 31 }, (_, index) => ({
    id: `tag-${index}`,
    name: `Tag ${index}`,
    group: 'STYLE',
  }))
  saved.tags = []
  await edit()
  for (const checkbox of await screen.findAllByRole('checkbox')) fireEvent.click(checkbox)
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  const error = await screen.findByText('Select at most 30 tags.')
  expect(error.parentElement).toHaveFocus()
  expect(writes).toHaveLength(0)
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('button', { name: 'Discard changes' })).not.toBeInTheDocument()
  await screen.findByRole('heading', { name: 'Soup' })
})

it('rename refreshes labels on the detail and library without changing recipe versions', async () => {
  await library()
  fireEvent.click(screen.getByRole('button', { name: 'Soup' }))
  await screen.findByRole('heading', { name: 'Soup' })
  fireEvent.click(screen.getByRole('button', { name: 'Manage tags' }))
  fireEvent.click(screen.getByRole('button', { name: 'Rename Dinner' }))
  fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'Supper' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save tag' }))
  await screen.findByText('Tag saved.')
  fireEvent.click(screen.getByRole('button', { name: 'Back to recipe' }))
  expect(
    within(screen.getByRole('list', { name: 'Recipe tags' })).getByText('Supper'),
  ).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Back to recipes' }))
  expect(
    within(await screen.findByRole('list', { name: 'Recipe tags' })).getByText('Supper'),
  ).toBeVisible()
  expect(saved.version).toBe(0)
  expect(writes).toHaveLength(1)
})

it('reselecting Recipes focuses the visible tag management heading', async () => {
  await manage()
  screen.getByRole('button', { name: 'Recipes' }).focus()
  fireEvent.click(screen.getByRole('button', { name: 'Recipes' }))
  expect(screen.getByRole('heading', { name: 'Manage tags' })).toHaveFocus()
})

it('fresh recipe responses display names renamed by another administrator', async () => {
  await library()
  saved.tags = [{ ...tags[0], name: 'Renamed elsewhere' }]
  fireEvent.click(screen.getByRole('button', { name: 'Soup' }))
  await screen.findByRole('heading', { name: 'Soup' })
  expect(screen.getByText('Renamed elsewhere')).toBeVisible()
})
