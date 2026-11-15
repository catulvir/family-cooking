import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { authApi } from './api/auth'
import { dishesApi } from './api/dishes'

const profile = { email: 'cook@example.com', displayName: null, version: 0 }
let saved = { ...profile } as { email: string; displayName: string | null; version: number }
let requests: { path: string; init?: RequestInit }[]
let failSave: number | null
let failRead: boolean
let pendingSave: Promise<Response> | null
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  saved = { ...profile }
  requests = []
  failSave = null
  failRead = false
  pendingSave = null
  vi.spyOn(authApi, 'currentUser').mockResolvedValue({
    email: profile.email,
    role: 'MEMBER',
    status: 'ACTIVE',
    mustChangePassword: false,
  })
  vi.spyOn(dishesApi, 'list').mockResolvedValue([])
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ path, init })
      if (path.endsWith('/auth/csrf')) return response({ token: 'csrf-token' })
      if (path.endsWith('/profile')) {
        if (init?.method === 'PUT') {
          if (pendingSave) return pendingSave
          if (failSave)
            return response(
              { message: failSave === 409 ? 'Profile changed elsewhere.' : 'Please try again.' },
              failSave,
            )
          const input = JSON.parse(init.body as string)
          saved = { ...saved, displayName: input.displayName, version: saved.version + 1 }
          return response(saved)
        }
        return failRead ? response({ message: 'Could not load profile.' }, 503) : response(saved)
      }
      throw new Error(`Unexpected request: ${path}`)
    }),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function openProfile() {
  fireEvent.click(await screen.findByRole('button', { name: 'Account' }))
  fireEvent.click(screen.getByRole('button', { name: 'Profile' }))
  return screen.findByLabelText('Display name (optional)')
}
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

it('opens self profile without arrival focus, saves a trimmed Unicode name and refreshes identity', async () => {
  render(<App />)
  const field = await openProfile()
  expect(field).toHaveValue('')
  expect(field).not.toHaveFocus()
  expect(screen.getByRole('heading', { name: 'Profile' })).not.toHaveFocus()
  expect(screen.getByLabelText('Email')).toHaveAttribute('readonly')
  expect(screen.queryByText(/upload/i)).not.toBeInTheDocument()
  fireEvent.change(field, { target: { value: '  Ēriks 李  ' } })
  save()
  expect(await screen.findByText('Signed in as Ēriks 李')).toBeInTheDocument()
  expect(field).toHaveValue('Ēriks 李')
  const request = requests.find(({ init }) => init?.method === 'PUT')!
  expect(JSON.parse(request.init!.body as string)).toEqual({ displayName: 'Ēriks 李', version: 0 })
  expect(request.init!.credentials).toBe('include')
  expect(new Headers(request.init!.headers).get('X-CSRF-TOKEN')).toBe('csrf-token')
  fireEvent.change(field, { target: { value: '   ' } })
  save()
  expect(await screen.findByText(`Signed in as ${profile.email}`)).toBeInTheDocument()
  expect(saved.displayName).toBeNull()
})

it('retains failed profile edits across navigation and retries without losing a meal draft', async () => {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
  fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Meal draft' } })
  const field = await openProfile()
  failSave = 503
  fireEvent.change(field, { target: { value: 'Draft name' } })
  save()
  expect(await screen.findByRole('alert')).toHaveTextContent('Please try again.')
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
  expect(screen.getByLabelText('Meal name')).toHaveValue('Meal draft')
  expect(await openProfile()).toHaveValue('Draft name')
  failSave = null
  save()
  expect(await screen.findByText('Profile saved.')).toBeInTheDocument()
})

it('keeps conflicting drafts until explicit discard and retains them when reload fails', async () => {
  render(<App />)
  const field = await openProfile()
  fireEvent.change(field, { target: { value: 'My draft' } })
  failSave = 409
  save()
  fireEvent.click(await screen.findByRole('button', { name: 'Reload latest profile' }))
  expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Keep editing' }), { key: 'Escape' })
  expect(screen.getByRole('button', { name: 'Reload latest profile' })).toHaveFocus()
  expect(field).toHaveValue('My draft')
  fireEvent.click(screen.getByRole('button', { name: 'Reload latest profile' }))
  failRead = true
  fireEvent.click(screen.getByRole('button', { name: 'Discard and reload' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load profile.')
  expect(field).toHaveValue('My draft')
  failRead = false
  saved = { ...saved, displayName: 'Latest', version: 3 }
  fireEvent.click(screen.getByRole('button', { name: 'Reload latest profile' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard and reload' }))
  await waitFor(() => expect(field).toHaveValue('Latest'))
  failSave = null
  fireEvent.change(field, { target: { value: 'New draft' } })
  save()
  await screen.findByText('Profile saved.')
  const puts = requests.filter(({ init }) => init?.method === 'PUT')
  expect(JSON.parse(puts.at(-1)!.init!.body as string).version).toBe(3)
})

it('retries initial loading without automatic focus', async () => {
  failRead = true
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Account' }))
  fireEvent.click(screen.getByRole('button', { name: 'Profile' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Retry profile' }))
  await screen.findByRole('button', { name: 'Retry profile' })
  failRead = false
  fireEvent.click(screen.getByRole('button', { name: 'Retry profile' }))
  expect(await screen.findByLabelText('Display name (optional)')).not.toHaveFocus()
})

it('validates length without sending a save and focuses the invalid field', async () => {
  render(<App />)
  const field = await openProfile()
  fireEvent.change(field, { target: { value: 'x'.repeat(81) } })
  save()
  expect(await screen.findByText('Use at most 80 characters.')).toBeInTheDocument()
  await waitFor(() => expect(field).toHaveFocus())
  expect(requests.filter(({ init }) => init?.method === 'PUT')).toHaveLength(0)
})

it('locks duplicate saves and finishes hidden saves without moving focus', async () => {
  render(<App />)
  const field = await openProfile()
  let finish!: (response: Response) => void
  pendingSave = new Promise((resolve) => {
    finish = resolve
  })
  fireEvent.change(field, { target: { value: 'Pending' } })
  fireEvent.submit(field.closest('form')!)
  fireEvent.submit(field.closest('form')!)
  await waitFor(() => expect(requests.filter(({ init }) => init?.method === 'PUT')).toHaveLength(1))
  const journal = screen.getByRole('button', { name: 'Journal' })
  fireEvent.click(journal)
  journal.focus()
  await act(async () => finish(response({ ...saved, displayName: 'Pending', version: 1 })))
  expect(journal).toHaveFocus()
  expect(await openProfile()).toHaveValue('Pending')
})

it('discards drafts on logout and does not let a late save update another session', async () => {
  render(<App />)
  const field = await openProfile()
  let finish!: (response: Response) => void
  pendingSave = new Promise((resolve) => {
    finish = resolve
  })
  fireEvent.change(field, { target: { value: 'Old session draft' } })
  save()
  await waitFor(() => expect(requests.some(({ init }) => init?.method === 'PUT')).toBe(true))
  vi.spyOn(authApi, 'logout').mockResolvedValue(undefined)
  vi.spyOn(authApi, 'login').mockResolvedValue({
    email: 'next@example.com',
    role: 'MEMBER',
    status: 'ACTIVE',
    mustChangePassword: false,
  })
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await screen.findByRole('button', { name: 'Sign in' })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'next@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Signed in as next@example.com')
  await act(async () =>
    finish(response({ ...saved, displayName: 'Old session draft', version: 1 })),
  )
  expect(screen.getByText('Signed in as next@example.com')).toBeInTheDocument()
  saved = { ...profile, email: 'next@example.com' }
  expect(await openProfile()).toHaveValue('')
})

it('requires confirmation to reset a changed name and restores the saved value without a request', async () => {
  saved = { ...profile, displayName: 'Saved name', version: 2 }
  render(<App />)
  const field = await openProfile()
  fireEvent.change(field, { target: { value: 'Unsaved' } })
  fireEvent.click(screen.getByRole('button', { name: 'Reset changes' }))
  expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(field).toHaveValue('Saved name')
  expect(screen.getByRole('button', { name: 'Reset changes' })).toHaveFocus()
  expect(requests.filter(({ init }) => init?.method === 'PUT')).toHaveLength(0)
})

it('preserves a draft when logout fails and when a save reports an expired session', async () => {
  render(<App />)
  const field = await openProfile()
  fireEvent.change(field, { target: { value: 'Recoverable' } })
  vi.spyOn(authApi, 'logout').mockRejectedValue(new Error('Could not sign out.'))
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await screen.findByText('Could not sign out.')
  expect(field).toHaveValue('Recoverable')
  failSave = 401
  save()
  expect(
    await screen.findByText('Your session has expired. Please sign in again.'),
  ).toBeInTheDocument()
  expect(field).toHaveValue('Recoverable')
})
