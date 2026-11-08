import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
import { authApi } from './api/auth'
import { dishesApi, DishApiError } from './api/dishes'

afterEach(() => vi.restoreAllMocks())

it('rejects invalid login values with accessible errors before contacting the API', async () => {
  vi.spyOn(authApi, 'currentUser').mockRejectedValue(new Error('Signed out'))
  const login = vi.spyOn(authApi, 'login')
  render(<App />)
  const submit = await screen.findByRole('button', { name: 'Sign in' })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'invalid' } })
  fireEvent.submit(submit.closest('form')!)
  expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email address.')
  expect(screen.getByLabelText('Email')).toHaveFocus()
  expect(login).not.toHaveBeenCalled()
})

const admin = {
  id: 'admin',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
  mustChangePassword: false,
}

it('preserves the account draft on failure and shows the password on successful retry', async () => {
  vi.spyOn(authApi, 'currentUser').mockResolvedValue(admin)
  vi.spyOn(authApi, 'users').mockResolvedValue([])
  vi.spyOn(dishesApi, 'list').mockResolvedValue([])
  const create = vi
    .spyOn(authApi, 'createUser')
    .mockRejectedValueOnce(new Error('Try again'))
    .mockResolvedValueOnce({
      ...admin,
      id: 'new',
      email: 'new@example.com',
      temporaryPassword: 'temporary-secret',
    })
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Family accounts' }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'ADMIN' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Email')).toHaveValue('new@example.com')
  expect(screen.getByLabelText('Role')).toHaveValue('ADMIN')
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  expect(await screen.findByText('temporary-secret')).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toHaveValue('')
  expect(create).toHaveBeenCalledTimes(2)
})

it.each([
  ['name', 'Meal name'],
  ['preparedOn', 'Meal date'],
  ['location', 'Location (optional)'],
  ['notes', 'Notes (optional)'],
])('associates server validation for %s with its input', async (field, label) => {
  vi.spyOn(authApi, 'currentUser').mockResolvedValue(admin)
  vi.spyOn(authApi, 'users').mockResolvedValue([])
  vi.spyOn(dishesApi, 'list').mockResolvedValue([])
  vi.spyOn(dishesApi, 'create').mockRejectedValue(
    new DishApiError('Validation failed', { [field]: 'Please correct this field.' }),
  )
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
  fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Soup' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }))
  await screen.findByText('Please correct this field.')
  expect(screen.getByLabelText(label)).toHaveAccessibleDescription('Please correct this field.')
  expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText(label)).toHaveFocus()
})

it.each(['login', 'password', 'account', 'meal'] as const)(
  'prevents duplicate %s submissions and permits retry after failure',
  async (kind) => {
    const user = {
      id: 'admin',
      email: 'admin@example.com',
      role: 'ADMIN' as const,
      status: 'ACTIVE' as const,
      mustChangePassword: kind === 'password',
    }
    vi.spyOn(authApi, 'currentUser').mockImplementation(async () => {
      if (kind === 'login') throw new Error('Signed out')
      return user
    })
    vi.spyOn(authApi, 'users').mockResolvedValue([])
    vi.spyOn(dishesApi, 'list').mockResolvedValue([])
    let rejectRequest!: (reason: Error) => void
    const pending = new Promise<never>((_, reject) => {
      rejectRequest = reject
    })
    const mutation =
      kind === 'meal'
        ? vi.spyOn(dishesApi, 'create')
        : vi.spyOn(
            authApi,
            kind === 'login' ? 'login' : kind === 'password' ? 'changePassword' : 'createUser',
          )
    mutation.mockImplementation(() => pending)
    render(<App />)
    const labels = {
      login: 'Sign in',
      password: 'Save new password',
      account: 'Create account',
      meal: 'Save meal',
    }
    if (kind === 'account')
      fireEvent.click(await screen.findByRole('button', { name: 'Family accounts' }))
    if (kind === 'meal') fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    const button = await screen.findByRole('button', { name: labels[kind] })
    const form = button.closest('form')!
    if (kind === 'meal')
      fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Soup' } })
    if (kind === 'account' || kind === 'login')
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    if (kind === 'login')
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'existing-password' },
      })
    if (kind === 'password') {
      fireEvent.change(screen.getByLabelText('Temporary password'), {
        target: { value: 'temporary-password' },
      })
      fireEvent.change(screen.getByLabelText(/New password/), {
        target: { value: 'replacement-password' },
      })
    }
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() => expect(mutation).toHaveBeenCalledTimes(1))
    expect(button).toBeDisabled()
    await act(async () => rejectRequest(new Error('Please retry')))
    expect(await screen.findByRole('alert')).toHaveTextContent('Please retry')
    expect(button).toBeEnabled()
    fireEvent.submit(form)
    await waitFor(() => expect(mutation).toHaveBeenCalledTimes(2))
  },
)
