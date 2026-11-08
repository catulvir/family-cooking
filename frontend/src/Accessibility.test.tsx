import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { authApi, type CurrentUser } from './api/auth'
import { dishesApi, DishApiError, type Dish } from './api/dishes'

const admin: CurrentUser = {
  email: 'admin@example.com',
  role: 'ADMIN',
  status: 'ACTIVE',
  mustChangePassword: false,
}
const soup: Dish = {
  id: 'soup',
  name: 'Soup',
  preparedOn: '2026-11-08',
  location: null,
  notes: null,
  createdBy: 'admin',
  createdAt: '2026-11-08T12:00:00Z',
  updatedAt: '2026-11-08T12:00:00Z',
  canEdit: true,
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.spyOn(authApi, 'currentUser').mockResolvedValue(admin)
  vi.spyOn(authApi, 'users').mockResolvedValue([])
  vi.spyOn(dishesApi, 'list').mockResolvedValue([soup])
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('exposes a labelled account disclosure and closes it with Escape and focus return', async () => {
  render(<App />)
  const account = await screen.findByRole('button', { name: 'Account' })
  expect(account).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  expect(
    within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', {
      name: 'Journal',
    }),
  ).toBeInTheDocument()
  fireEvent.click(account)
  expect(account).toHaveAttribute('aria-expanded', 'true')
  const actions = document.getElementById(account.getAttribute('aria-controls')!)!
  expect(actions).toHaveAccessibleName('Account')
  const family = within(actions).getByRole('button', { name: 'Family accounts' })
  family.focus()
  fireEvent.keyDown(family, { key: 'Escape' })
  expect(account).toHaveFocus()
  expect(account).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: 'Family accounts' })).not.toBeInTheDocument()
})

it('only offers sign out to members and no protected navigation before password change', async () => {
  vi.mocked(authApi.currentUser).mockResolvedValue({ ...admin, role: 'MEMBER' })
  const { unmount } = render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Account' }))
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Family accounts' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Profile' })).not.toBeInTheDocument()
  expect(authApi.users).not.toHaveBeenCalled()
  unmount()
  vi.mocked(authApi.currentUser).mockResolvedValue({ ...admin, mustChangePassword: true })
  render(<App />)
  await screen.findByRole('button', { name: 'Save new password' })
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument()
})

it('names every journal screen and restores focus through detail, edit, cancel and back', async () => {
  render(<App />)
  await screen.findByRole('button', { name: 'Soup' })
  expect(screen.getByRole('region', { name: 'Meal journal' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Soup' }))
  expect(screen.getByRole('region', { name: 'Soup' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Soup' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Edit meal' }))
  expect(screen.getByRole('region', { name: 'Edit meal' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Edit meal' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Edit meal' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Back to meals' }))
  expect(screen.getByRole('button', { name: 'Soup' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Add meal' }))
  expect(screen.getByRole('region', { name: 'Record a meal' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Record a meal' })).toHaveFocus()
  fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(screen.getByRole('button', { name: 'Add meal' })).toHaveFocus()
})

it('focuses account and restored draft headings without losing entered values', async () => {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
  fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  fireEvent.click(screen.getByRole('button', { name: 'Family accounts' }))
  expect(screen.getByRole('heading', { name: 'Family accounts' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Account' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('textbox', { name: 'Meal name' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
  expect(screen.getByRole('heading', { name: 'Record a meal' })).toHaveFocus()
  expect(screen.getByLabelText('Meal name')).toHaveValue('Draft')
})

it('announces meal loading and completion without moving focus on background load', async () => {
  const meals = deferred<Dish[]>()
  vi.mocked(dishesApi.list).mockReturnValue(meals.promise)
  vi.spyOn(dishesApi, 'create').mockResolvedValue(soup)
  render(<App />)
  await screen.findByRole('button', { name: 'Add meal' })
  expect(screen.getByRole('status')).toHaveTextContent('Loading meals')
  const account = screen.getByRole('button', { name: 'Account' })
  account.focus()
  await act(async () => meals.resolve([]))
  expect(account).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Add meal' }))
  fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Soup' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))
  expect(await screen.findByRole('heading', { name: 'Soup' })).toHaveFocus()
  expect(screen.getByRole('status')).toHaveTextContent('Meal saved.')
})

it.each(['success', 'validation failure'])(
  'keeps focus in accounts after hidden meal save %s',
  async (outcome) => {
    const saved = deferred<Dish>()
    vi.spyOn(dishesApi, 'create').mockReturnValue(saved.promise)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Soup' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    await screen.findByRole('button', { name: 'Saving…' })
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    fireEvent.click(screen.getByRole('button', { name: 'Family accounts' }))
    screen.getByLabelText('Email').focus()
    await act(async () => {
      if (outcome === 'success') saved.resolve(soup)
      else saved.reject(new DishApiError('Please correct the meal.', { name: 'Name is invalid' }))
    })
    expect(screen.getByLabelText('Email')).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
    expect(
      screen.getByRole('heading', { name: outcome === 'success' ? 'Soup' : 'Record a meal' }),
    ).toHaveFocus()
    expect(screen.queryByRole('alert')?.textContent).toBe(
      outcome === 'success' ? undefined : 'Please correct the meal.',
    )
  },
)

it('announces account loading and creation without reading the temporary password as status', async () => {
  const users = deferred<[]>()
  vi.mocked(authApi.users).mockReturnValue(users.promise)
  vi.spyOn(authApi, 'createUser').mockResolvedValue({
    ...admin,
    id: 'new',
    temporaryPassword: 'secret',
  })
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Account' }))
  fireEvent.click(screen.getByRole('button', { name: 'Family accounts' }))
  expect(screen.getByRole('status')).toHaveTextContent('Loading family accounts')
  screen.getByLabelText('Email').focus()
  await act(async () => users.resolve([]))
  expect(screen.getByLabelText('Email')).toHaveFocus()
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  await screen.findByText('secret')
  expect(screen.getByRole('status')).toHaveTextContent(
    'Account created. Share the temporary password below.',
  )
  expect(screen.getByRole('status')).not.toHaveTextContent('secret')
})

it.each(['network', 'server'] as const)(
  'offers session retry after a %s failure',
  async (failure) => {
    vi.mocked(authApi.currentUser).mockRestore()
    const retry = deferred<Response>()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(() =>
        failure === 'network'
          ? Promise.reject(new TypeError('Failed to fetch'))
          : Promise.resolve(new Response('{}', { status: 500 })),
      )
      .mockReturnValueOnce(retry.promise)
    vi.stubGlobal('fetch', fetch)
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not check your session')
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session')
    await act(async () => retry.resolve(new Response(JSON.stringify(admin))))
    expect(await screen.findByRole('heading', { name: 'Meal journal' })).toHaveFocus()
    expect(fetch).toHaveBeenCalledTimes(2)
  },
)

it('shows login on an actual unauthenticated response', async () => {
  vi.mocked(authApi.currentUser).mockRestore()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
