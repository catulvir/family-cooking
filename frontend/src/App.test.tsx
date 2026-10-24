import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('identifies the application and shows the sign-in form without a session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    )

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Family Cooking Tracker' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('keeps the signed-in view when logout fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ email: 'member@example.com', role: 'MEMBER', status: 'ACTIVE', mustChangePassword: false }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'csrf-token' }) })
        .mockResolvedValueOnce({ ok: false, status: 500 }),
    )

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(screen.getByText('Signed in as member@example.com')).toBeInTheDocument()
  })
})
