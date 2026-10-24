import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('identifies the application and reports a successful health check', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'UP' }) }),
    )

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Family Cooking Tracker' })).toBeInTheDocument()
    expect(await screen.findByText('Service connection is ready.')).toBeInTheDocument()
  })
})
