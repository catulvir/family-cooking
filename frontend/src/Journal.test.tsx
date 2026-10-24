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
let requests: { path: string; init: RequestInit }[]

beforeEach(() => {
  records = []
  account = { ...member }
  saveFailure = undefined
  listFailure = undefined
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
        const saved = { ...soup, ...body }
        records = [saved]
        return respond(saved, init.method === 'POST' ? 201 : 200)
      }
      if (path.startsWith('/api/v1/dishes/')) return respond(records[0])
      throw new Error(`Unexpected request: ${path}`)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('family cooking journal', () => {
  it('creates a minimal dish with today as default and keeps it after remount', async () => {
    const { unmount } = render(<App />)
    expect(
      await screen.findByText('No dishes yet. Record your first family meal.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add dish' }))
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(screen.getByLabelText('Preparation date')).toHaveValue(today)
    fireEvent.change(screen.getByLabelText('Dish name'), { target: { value: '  Pasta  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save dish' }))
    expect(await screen.findByRole('heading', { name: 'Pasta' })).toBeInTheDocument()
    const creation = requests.find(({ init }) => init.method === 'POST')!
    expect(JSON.parse(creation.init.body as string)).toEqual({
      name: 'Pasta',
      preparedOn: today,
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
    fireEvent.click(screen.getByRole('button', { name: 'Edit dish' }))
    fireEvent.change(screen.getByLabelText('Dish name'), { target: { value: 'Carrot soup' } })
    fireEvent.change(screen.getByLabelText('Preparation date'), { target: { value: '2026-10-22' } })
    fireEvent.change(screen.getByLabelText('Preparation notes (optional)'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save dish' }))
    expect(await screen.findByRole('heading', { name: 'Carrot soup' })).toBeInTheDocument()
    expect(requests.find(({ init }) => init.method === 'PUT')?.path).toBe('/api/v1/dishes/dish-1')
    fireEvent.click(screen.getByRole('button', { name: 'Back to dishes' }))
    expect(await screen.findByRole('button', { name: 'Carrot soup' })).toBeInTheDocument()
    expect(records[0].notes).toBeNull()
  })

  it('hides editing when the server denies permission', async () => {
    records = [{ ...soup, canEdit: false }]
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pumpkin soup' }))
    expect(await screen.findByRole('heading', { name: 'Pumpkin soup' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit dish' })).not.toBeInTheDocument()
  })

  it('rejects blank names before sending a save request', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add dish' }))
    fireEvent.change(screen.getByLabelText('Dish name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save dish' }))
    expect(await screen.findByText('Enter a dish name.')).toBeInTheDocument()
    expect(requests.some(({ init }) => init.method === 'POST')).toBe(false)
  })

  it('preserves entered values and displays field errors after failed saves', async () => {
    saveFailure = 400
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add dish' }))
    fireEvent.change(screen.getByLabelText('Dish name'), { target: { value: 'Pasta' } })
    fireEvent.change(screen.getByLabelText('Preparation notes (optional)'), {
      target: { value: 'Family notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save dish' }))
    expect(await screen.findByText('Name is invalid')).toBeInTheDocument()
    expect(screen.getByLabelText('Dish name')).toHaveValue('Pasta')
    expect(screen.getByLabelText('Preparation notes (optional)')).toHaveValue('Family notes')
    saveFailure = undefined
    fireEvent.click(screen.getByRole('button', { name: 'Save dish' }))
    expect(await screen.findByRole('heading', { name: 'Pasta' })).toBeInTheDocument()
  })

  it('explains expired sessions while preserving an unsaved dish', async () => {
    saveFailure = 401
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add dish' }))
    fireEvent.change(screen.getByLabelText('Dish name'), { target: { value: 'Pasta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save dish' }))
    expect(
      await screen.findByText('Your session has expired. Please sign in again.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Dish name')).toHaveValue('Pasta')
  })

  it('can retry a failed list request', async () => {
    listFailure = 500
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    listFailure = undefined
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByText('No dishes yet. Record your first family meal.'),
    ).toBeInTheDocument()
  })

  it('keeps administration available alongside the journal', async () => {
    account.role = 'ADMIN'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Cooking journal' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Family accounts' })).toBeInTheDocument()
    await waitFor(() =>
      expect(requests.some(({ path }) => path === '/api/v1/admin/users')).toBe(true),
    )
  })

  it('does not fetch dishes before the forced password change', async () => {
    account.status = 'PENDING'
    account.mustChangePassword = true
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Save new password' })).toBeInTheDocument()
    expect(requests.some(({ path }) => path === '/api/v1/dishes')).toBe(false)
  })
})
