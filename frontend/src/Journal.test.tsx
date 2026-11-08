import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const member = {
  email: 'member@example.com',
  role: 'MEMBER',
  status: 'ACTIVE',
  mustChangePassword: false,
}
const soup = {
  id: 'dish-1',
  name: 'Pumpkin soup',
  preparedOn: '2026-10-23',
  location: null,
  notes: 'Roasted first',
  createdBy: 'member-1',
  createdAt: '2026-10-23T10:00:00Z',
  updatedAt: '2026-10-23T10:00:00Z',
  canEdit: true,
}
let records: (typeof soup)[]
let account: typeof member
let saveFailure: number | undefined
let listFailure: number | undefined
let logoutFailure: boolean
let requests: { path: string; init: RequestInit }[]

beforeEach(() => {
  records = []
  account = { ...member }
  saveFailure = undefined
  listFailure = undefined
  logoutFailure = false
  requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = new URL(url, 'http://localhost').pathname
      requests.push({ path, init })
      const respond = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status })
      if (path === '/api/v1/auth/me') return respond(account)
      if (path === '/api/v1/auth/csrf') return respond({ token: 'test-csrf' })
      if (path === '/api/v1/auth/logout')
        return logoutFailure ? respond({}, 500) : new Response(null, { status: 204 })
      if (path === '/api/v1/auth/login') return respond(account)
      if (path === '/api/v1/admin/users') return respond([])
      if (path === '/api/v1/dishes' && !init.method) {
        return listFailure ? respond({}, listFailure) : respond(records)
      }
      if (path.startsWith('/api/v1/dishes') && (init.method === 'POST' || init.method === 'PUT')) {
        if (saveFailure)
          return respond(
            { message: 'Request validation failed', fieldErrors: { name: 'Name is invalid' } },
            saveFailure,
          )
        const body = JSON.parse(init.body as string)
        const existing =
          init.method === 'PUT'
            ? records.find((dish) => dish.id === path.split('/').at(-1))
            : undefined
        const saved = { ...(existing ?? soup), ...body }
        records = existing
          ? records.map((dish) => (dish.id === saved.id ? saved : dish))
          : [saved, ...records]
        return respond(saved, init.method === 'POST' ? 201 : 200)
      }
      if (path.startsWith('/api/v1/dishes/')) return respond(records[0])
      throw new Error(`Unexpected request: ${path}`)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('family cooking journal', () => {
  it('preserves both drafts after failed logout', async () => {
    account.role = 'ADMIN'
    logoutFailure = true
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Draft soup' } })
    fireEvent.click(screen.getByRole('button', { name: 'Family accounts' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'draft@example.com' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'ADMIN' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByLabelText('Email')).toHaveValue('draft@example.com')
    expect(screen.getByLabelText('Role')).toHaveValue('ADMIN')
    fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
    expect(screen.getByLabelText('Meal name')).toHaveValue('Draft soup')
  })

  it('clears both drafts after successful logout and login', async () => {
    account.role = 'ADMIN'
    logoutFailure = false
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Draft soup' } })
    fireEvent.click(screen.getByRole('button', { name: 'Family accounts' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'draft@example.com' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'ADMIN' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await screen.findByRole('button', { name: 'Sign in' })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: account.email } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    expect(screen.getByLabelText('Meal name')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Family accounts' }))
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Role')).toHaveValue('MEMBER')
  })

  it('focuses the safe choice and returns focus on Escape', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Soup' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Keep editing' }), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(screen.getByLabelText('Meal name')).toHaveValue('Soup')
    expect(screen.queryByRole('button', { name: 'Discard changes' })).not.toBeInTheDocument()
  })

  it.each(['Meal name', 'Meal date', 'Location (optional)', 'Notes (optional)'])(
    'protects a new draft when %s changes',
    async (field) => {
      render(<App />)
      fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
      const value = field === 'Meal date' ? '2025-01-01' : 'Draft value'
      fireEvent.change(screen.getByLabelText(field), { target: { value } })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
      expect(screen.getByLabelText(field)).toHaveValue(value)
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
      expect(screen.getByRole('heading', { name: 'Meal journal' })).toBeInTheDocument()
      expect(requests.some(({ init }) => init.method === 'POST')).toBe(false)
      fireEvent.click(screen.getByRole('button', { name: 'Add meal' }))
      expect(screen.getByLabelText('Meal name')).toHaveValue('')
    },
  )

  it('cancels pristine and reverted forms without confirmation', async () => {
    records = [{ ...soup }]
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pumpkin soup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Changed' } })
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: soup.name } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: soup.name })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discard changes' })).not.toBeInTheDocument()
  })

  it('discards edits without changing the saved meal', async () => {
    records = [{ ...soup }]
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: soup.name }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit meal' }))
    fireEvent.change(screen.getByLabelText('Notes (optional)'), { target: { value: 'Changed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.getByText('Roasted first')).toBeInTheDocument()
    expect(requests.some(({ init }) => init.method === 'PUT')).toBe(false)
  })

  it('records an optional location for a meal', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Risotto' } })
    fireEvent.change(screen.getByLabelText('Location (optional)'), {
      target: { value: 'Cafe Noir' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))

    expect(await screen.findByRole('heading', { name: 'Risotto' })).toBeInTheDocument()
    const creation = requests.find(({ init }) => init.method === 'POST')!
    expect(JSON.parse(creation.init.body as string)).toMatchObject({ location: 'Cafe Noir' })
  })

  it('creates a minimal dish with today as default and keeps it after remount', async () => {
    const { unmount } = render(<App />)
    expect(await screen.findByText('No meals yet. Record your first meal.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add meal' }))
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(screen.getByLabelText('Meal date')).toHaveValue(today)
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: '  Pasta  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    expect(await screen.findByRole('heading', { name: 'Pasta' })).toBeInTheDocument()
    const creation = requests.find(({ init }) => init.method === 'POST')!
    expect(JSON.parse(creation.init.body as string)).toEqual({
      name: 'Pasta',
      preparedOn: today,
      location: null,
      notes: null,
    })
    expect(creation.init.credentials).toBe('include')
    expect(creation.init.headers).toMatchObject({ 'X-CSRF-TOKEN': 'test-csrf' })
    unmount()
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Pasta' })).toBeInTheDocument()
  })

  it('opens details and edits a dish including clearing notes', async () => {
    records = [{ ...soup }]
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pumpkin soup' }))
    expect(await screen.findByText('Roasted first')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Carrot soup' } })
    fireEvent.change(screen.getByLabelText('Meal date'), { target: { value: '2026-10-22' } })
    fireEvent.change(screen.getByLabelText('Notes (optional)'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    expect(await screen.findByRole('heading', { name: 'Carrot soup' })).toBeInTheDocument()
    expect(requests.find(({ init }) => init.method === 'PUT')?.path).toBe('/api/v1/dishes/dish-1')
    fireEvent.click(screen.getByRole('button', { name: 'Back to meals' }))
    expect(await screen.findByRole('button', { name: 'Carrot soup' })).toBeInTheDocument()
    expect(records[0].notes).toBeNull()
  })

  it('keeps the server ordering after saving an older dish', async () => {
    records = [
      { ...soup, id: 'newer-dish', name: 'Today soup', preparedOn: '2026-10-24' },
      { ...soup, id: 'older-dish', name: 'Yesterday soup', preparedOn: '2026-10-23' },
    ]
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Yesterday soup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), {
      target: { value: 'Updated yesterday soup' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Back to meals' }))

    expect(
      screen
        .getAllByRole('button')
        .filter((button) =>
          ['Today soup', 'Updated yesterday soup'].includes(button.textContent ?? ''),
        )
        .map((button) => button.textContent),
    ).toEqual(['Today soup', 'Updated yesterday soup'])
  })

  it('hides editing when the server denies permission', async () => {
    records = [{ ...soup, canEdit: false }]
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pumpkin soup' }))
    expect(await screen.findByRole('heading', { name: 'Pumpkin soup' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit meal' })).not.toBeInTheDocument()
  })

  it('rejects blank names before sending a save request', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    expect(await screen.findByText('Enter a meal name.')).toBeInTheDocument()
    expect(requests.some(({ init }) => init.method === 'POST')).toBe(false)
  })

  it('preserves entered values and displays field errors after failed saves', async () => {
    saveFailure = 400
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Pasta' } })
    fireEvent.change(screen.getByLabelText('Notes (optional)'), {
      target: { value: 'Family notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    expect(await screen.findByText('Name is invalid')).toBeInTheDocument()
    expect(screen.getByLabelText('Meal name')).toHaveValue('Pasta')
    expect(screen.getByLabelText('Notes (optional)')).toHaveValue('Family notes')
    saveFailure = undefined
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    expect(await screen.findByRole('heading', { name: 'Pasta' })).toBeInTheDocument()
  })

  it('explains expired sessions while preserving an unsaved dish', async () => {
    saveFailure = 401
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Pasta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    expect(
      await screen.findByText('Your session has expired. Please sign in again.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Meal name')).toHaveValue('Pasta')
  })

  it('can retry a failed list request', async () => {
    listFailure = 500
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    listFailure = undefined
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No meals yet. Record your first meal.')).toBeInTheDocument()
  })

  it('opens administration separately and preserves the journal draft on return', async () => {
    account.role = 'ADMIN'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Meal journal' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Family accounts' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Draft soup' } })
    fireEvent.click(screen.getByRole('button', { name: 'Family accounts' }))
    expect(screen.getByRole('heading', { name: 'Family accounts' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Meal name' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
    expect(screen.getByLabelText('Meal name')).toHaveValue('Draft soup')
    await waitFor(() =>
      expect(requests.some(({ path }) => path === '/api/v1/admin/users')).toBe(true),
    )
  })

  it('preserves the account email and administrator role across navigation', async () => {
    account.role = 'ADMIN'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Family accounts' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'new-admin@example.com' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), {
      target: { value: 'ADMIN' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Journal' }))
    expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Role' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Family accounts' }))
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('new-admin@example.com')
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue('ADMIN')
    expect(requests.some(({ init }) => init.method === 'POST')).toBe(false)
  })

  it('does not fetch dishes before the forced password change', async () => {
    account.status = 'PENDING'
    account.mustChangePassword = true
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Save new password' })).toBeInTheDocument()
    expect(requests.some(({ path }) => path === '/api/v1/dishes')).toBe(false)
  })
})
