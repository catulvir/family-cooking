import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'

const tags = [
  { id: 'breakfast', name: 'Breakfast', group: 'MEAL_TYPE' },
  { id: 'dessert', name: 'Dessert', group: 'MEAL_TYPE' },
  { id: 'japanese', name: 'Japanese', group: 'CUISINE' },
  { id: 'quick', name: 'Quick', group: 'STYLE' },
]
let catalogueTags: typeof tags
const recipe = (index: number) => ({
  id: `r-${index}`,
  name: `Soup ${String(index).padStart(2, '0')}`,
  servings: null,
  notes: null,
  ingredients: [{ name: 'Water', quantity: null, unit: null }],
  instructions: [{ text: 'Boil' }],
  tags: [tags[0]],
  version: 0,
  canEdit: true,
})
let entries: ReturnType<typeof recipe>[]
let requests: URLSearchParams[]
let hold: Set<string>
let pending: Map<string, () => void>
let failures: Map<string, number>
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
beforeEach(() => {
  entries = Array.from({ length: 21 }, (_, index) => recipe(index))
  catalogueTags = [...tags]
  requests = []
  hold = new Set()
  pending = new Map()
  failures = new Map()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const parsed = new URL(url, 'http://localhost')
      const path = parsed.pathname
      if (path === '/api/v1/auth/me')
        return response({
          email: 'member@example.com',
          role: 'MEMBER',
          status: 'ACTIVE',
          mustChangePassword: false,
        })
      if (path === '/api/v1/auth/csrf') return response({ token: 'csrf' })
      if (path === '/api/v1/dishes') return response([])
      if (path === '/api/v1/recipe-tags')
        return response(
          Object.fromEntries(
            ['MEAL_TYPE', 'CUISINE', 'STYLE'].map((group) => [
              group,
              catalogueTags.filter((tag) => tag.group === group),
            ]),
          ),
        )
      if (path === '/api/v1/recipes') {
        const params = parsed.searchParams
        requests.push(params)
        const q = params.get('q') ?? ''
        const page = Number(params.get('page') ?? 0)
        let matches = entries.filter((item) => item.name.toLowerCase().includes(q.toLowerCase()))
        const selected = params.getAll('tagId')
        for (const group of ['MEAL_TYPE', 'CUISINE', 'STYLE']) {
          const ids = catalogueTags
            .filter((tag) => tag.group === group && selected.includes(tag.id))
            .map((tag) => tag.id)
          if (ids.length)
            matches = matches.filter((item) => item.tags.some((tag) => ids.includes(tag.id)))
        }
        matches = [...matches].sort((a, b) => a.name.localeCompare(b.name))
        if (params.get('sort') === 'name_desc' || params.get('sort') === 'newest') matches.reverse()
        const failure = failures.get(q)
        const result = failure
          ? response({ message: 'Discovery failed.' }, failure)
          : response({
              items: matches.slice(page * 20, (page + 1) * 20),
              page,
              size: 20,
              totalElements: matches.length,
              totalPages: Math.ceil(matches.length / 20),
            })
        if (hold.has(q)) await new Promise<void>((resolve) => pending.set(q, resolve))
        return result
      }
      const item = entries.find((entry) => path === `/api/v1/recipes/${entry.id}`)
      if (item) {
        if (init.method === 'PUT')
          Object.assign(item, JSON.parse(init.body as string), { version: item.version + 1 })
        return response(item)
      }
      throw new Error(`Unexpected request: ${path}`)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())
async function library() {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Recipes' }))
  await screen.findByRole('heading', { name: 'Recipes' })
  await waitFor(() => expect(requests.length).toBeGreaterThan(0))
}
function search(q: string) {
  fireEvent.change(screen.getByLabelText('Search recipes by name'), { target: { value: q } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
}
const latest = () => requests[requests.length - 1]
async function filters() {
  const button = screen.getByRole('button', { name: /^Filters/ })
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button)
  await screen.findByRole('checkbox', { name: 'Breakfast' })
}

it('submits trimmed literal search explicitly and resets paging for search sort and tag changes', async () => {
  await library()
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
  await screen.findByText('Page 2 of 2')
  const before = requests.length
  fireEvent.change(screen.getByLabelText('Search recipes by name'), {
    target: { value: '  Soup  ' },
  })
  expect(requests).toHaveLength(before)
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  await screen.findByText('Page 1 of 2')
  expect(latest().get('q')).toBe('Soup')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('Page 2 of 2')
  fireEvent.change(screen.getByLabelText('Sort recipes'), { target: { value: 'name_desc' } })
  await screen.findByText('Page 1 of 2')
  expect(latest().get('sort')).toBe('name_desc')
  expect(screen.getAllByRole('button', { name: /^Soup/ })[0]).toHaveTextContent('Soup 20')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('Page 2 of 2')
  await filters()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Breakfast' }))
  await screen.findByText('Page 1 of 2')
  expect(latest().getAll('tagId')).toEqual(['breakfast'])
  search(' %_ & tea ')
  await screen.findByText(/No recipes match/)
  expect(latest().get('q')).toBe('%_ & tea')
})

it('keeps chips visible when filters collapse and clear actions preserve the intended criteria', async () => {
  await library()
  search('Soup')
  await screen.findByText('Page 1 of 2')
  fireEvent.change(screen.getByLabelText('Sort recipes'), { target: { value: 'newest' } })
  await filters()
  for (const name of ['Breakfast', 'Dessert', 'Japanese'])
    fireEvent.click(screen.getByRole('checkbox', { name }))
  await screen.findByText(/No recipes match/)
  expect(latest().getAll('tagId')).toEqual(['breakfast', 'dessert', 'japanese'])
  const toggle = screen.getByRole('button', { name: 'Filters (3)' })
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('checkbox', { name: 'Breakfast' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Remove Japanese filter' }))
  await screen.findByText('Page 1 of 2')
  expect(screen.getByRole('button', { name: 'Remove Breakfast filter' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Clear tags' }))
  await waitFor(() => expect(latest().getAll('tagId')).toEqual([]))
  expect(latest().get('q')).toBe('Soup')
  expect(latest().get('sort')).toBe('newest')
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
  await waitFor(() => expect(latest().get('q')).toBe(''))
  expect(latest().get('sort')).toBe('newest')
  expect(screen.getByLabelText('Search recipes by name')).toHaveValue('')
})

it('preserves discovery state without autofocus through detail editing and main navigation', async () => {
  await library()
  search('Soup')
  await filters()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Breakfast' }))
  fireEvent.change(screen.getByLabelText('Sort recipes'), { target: { value: 'name_desc' } })
  await screen.findByText('Page 1 of 2')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('Page 2 of 2')
  fireEvent.click(screen.getByRole('button', { name: 'Soup 00' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit recipe' }))
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
  fireEvent.click(screen.getByRole('button', { name: 'Recipes' }))
  expect(screen.getByLabelText('Recipe name')).toHaveValue('Soup 00')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Back to recipes' }))
  expect(screen.getByLabelText('Search recipes by name')).toHaveValue('Soup')
  expect(screen.getByLabelText('Sort recipes')).toHaveValue('name_desc')
  expect(screen.getByRole('checkbox', { name: 'Breakfast' })).toBeChecked()
  expect(screen.getByText('Page 2 of 2')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Soup 00' })).not.toHaveFocus()
})

it.each([200, 503])(
  'ignores a delayed older response with status %s after a newer search',
  async (status) => {
    await library()
    await screen.findByRole('button', { name: 'Soup 00' })
    hold.add('Soup 00')
    if (status !== 200) failures.set('Soup 00', status)
    search('Soup 00')
    await waitFor(() => expect(pending.has('Soup 00')).toBe(true))
    expect(screen.queryByRole('button', { name: 'Soup 00' })).not.toBeInTheDocument()
    search('Soup 01')
    await screen.findByRole('button', { name: 'Soup 01' })
    await act(async () => {
      pending.get('Soup 00')!()
    })
    expect(screen.getByRole('button', { name: 'Soup 01' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Soup 00' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  },
)

it.each([401, 503])(
  'hides old results after a current %s error and retries the same criteria',
  async (status) => {
    await library()
    await screen.findByRole('button', { name: 'Soup 00' })
    failures.set('Soup 01', status)
    search('Soup 01')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      status === 401 ? 'session has expired' : 'Discovery failed',
    )
    expect(screen.queryByRole('button', { name: 'Soup 00' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Page /)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search recipes by name')).toHaveValue('Soup 01')
    failures.clear()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('button', { name: 'Soup 01' })
    expect(latest().get('q')).toBe('Soup 01')
  },
)

it('refreshes matching results after an edit and recovers to the last valid page', async () => {
  await library()
  search('Soup')
  await screen.findByText('Page 1 of 2')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('Page 2 of 2')
  fireEvent.click(screen.getByRole('button', { name: 'Soup 20' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit recipe' }))
  fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'Stew' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  await screen.findByRole('heading', { name: 'Stew' })
  fireEvent.click(screen.getByRole('button', { name: 'Back to recipes' }))
  await screen.findByText('Page 1 of 1')
  expect(screen.getByText('20 recipes')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Stew' })).not.toBeInTheDocument()
  expect(latest().get('page')).toBe('0')
  expect(latest().get('q')).toBe('Soup')
})

it('distinguishes an empty library from no matches without a page one of zero', async () => {
  entries = []
  await library()
  await screen.findByText('No recipes yet. Add your first family recipe.')
  expect(screen.queryByText(/Page /)).not.toBeInTheDocument()
  search('Soup')
  await screen.findByText(/No recipes match/)
  expect(
    screen.queryByText('No recipes yet. Add your first family recipe.'),
  ).not.toBeInTheDocument()
  expect(screen.queryByText(/Page /)).not.toBeInTheDocument()
})

it('keeps unsubmitted search text separate from active criteria and preserves it through view switches', async () => {
  await library()
  search('Soup')
  await screen.findByRole('button', { name: 'Soup 00' })
  fireEvent.change(screen.getByLabelText('Search recipes by name'), {
    target: { value: 'Not submitted' },
  })
  await filters()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Breakfast' }))
  await waitFor(() => expect(latest().getAll('tagId')).toEqual(['breakfast']))
  expect(latest().get('q')).toBe('Soup')
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
  fireEvent.click(screen.getByRole('button', { name: 'Recipes' }))
  expect(screen.getByLabelText('Search recipes by name')).toHaveValue('Not submitted')
  expect(screen.getByText('Search: “Soup”')).toBeVisible()
})

it('preserves the library without autofocus after switching main views', async () => {
  await library()
  const row = await screen.findByRole('button', { name: 'Soup 05' })
  row.focus()
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
  const navigation = screen.getByRole('button', { name: 'Recipes' })
  navigation.focus()
  fireEvent.click(navigation)
  expect(navigation).toHaveFocus()
  expect(row).toBeVisible()
})

it('limits filter selection to thirty and Escape collapses the inline panel with focus return', async () => {
  catalogueTags = Array.from({ length: 31 }, (_, index) => ({
    id: `tag-${index}`,
    name: `Tag ${index}`,
    group: 'STYLE',
  }))
  await library()
  fireEvent.click(screen.getByRole('button', { name: 'Filters (0)' }))
  const checkboxes = await screen.findAllByRole('checkbox')
  for (const checkbox of checkboxes.slice(0, 30)) fireEvent.click(checkbox)
  expect(checkboxes[30]).toBeDisabled()
  expect(checkboxes[0]).not.toBeDisabled()
  fireEvent.click(checkboxes[0])
  expect(checkboxes[30]).not.toBeDisabled()
  fireEvent.keyDown(checkboxes[1], { key: 'Escape' })
  const toggle = screen.getByRole('button', { name: 'Filters (29)' })
  expect(toggle).toHaveFocus()
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('button', { name: 'Remove Tag 1 filter' })).toBeVisible()
})
