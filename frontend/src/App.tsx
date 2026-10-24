import { useEffect, useState } from 'react'
import { getHealth } from './api/health'
import './App.css'

type ConnectionState = 'loading' | 'connected' | 'unavailable'

export default function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading')

  useEffect(() => {
    let active = true

    getHealth()
      .then(() => {
        if (active) setConnectionState('connected')
      })
      .catch(() => {
        if (active) setConnectionState('unavailable')
      })

    return () => {
      active = false
    }
  }, [])

  const statusText = {
    loading: 'Checking service connection…',
    connected: 'Service connection is ready.',
    unavailable: 'Service connection is unavailable. Start the backend to continue.',
  }[connectionState]

  return (
    <main className="app-shell">
      <section aria-labelledby="page-title" className="welcome-card">
        <p className="eyebrow">Private family space</p>
        <h1 id="page-title">Family Cooking Tracker</h1>
        <p className="intro">
          Keep the meals your family cooks, the recipes behind them, and the ingredients that made them yours.
        </p>
        <p aria-live="polite" className={`connection connection--${connectionState}`}>
          {statusText}
        </p>
      </section>
    </main>
  )
}
