import { useRef, useState } from 'react'
import { BookOpen, ChevronDown, LogOut, Users } from 'lucide-react'
import type { CurrentUser } from './api/auth'

export type DashboardView = 'journal' | 'recipes' | 'accounts'

export default function AccountNavigation({
  user,
  view,
  onNavigate,
  onLogout,
}: {
  user: CurrentUser
  view: DashboardView
  onNavigate: (view: DashboardView) => void
  onLogout: () => void
}) {
  const [accountOpen, setAccountOpen] = useState(false)
  const accountButton = useRef<HTMLButtonElement>(null)
  const accountDisclosure = useRef<HTMLElement>(null)
  const navigate = (nextView: DashboardView) => {
    setAccountOpen(false)
    onNavigate(nextView)
  }
  const handleAccountKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && accountOpen) {
      event.preventDefault()
      setAccountOpen(false)
      accountButton.current?.focus()
    }
  }
  const handleAccountBlur = (event: React.FocusEvent<HTMLButtonElement>) => {
    if (!accountDisclosure.current?.contains(event.relatedTarget)) setAccountOpen(false)
  }
  return (
    <>
      <div className="account-row">
        <p className="intro">Signed in as {user.email}</p>
        <section
          ref={accountDisclosure}
          className="account-disclosure"
          aria-label="Account navigation"
        >
          <button
            ref={accountButton}
            id="account-button"
            className="secondary"
            aria-expanded={accountOpen}
            aria-controls="account-actions"
            onKeyDown={handleAccountKeyDown}
            onBlur={handleAccountBlur}
            onClick={() => setAccountOpen((open) => !open)}
          >
            Account <ChevronDown size={18} aria-hidden="true" />
          </button>
          <section id="account-actions" aria-labelledby="account-button" hidden={!accountOpen}>
            {user.role === 'ADMIN' && (
              <button
                className="secondary"
                onKeyDown={handleAccountKeyDown}
                onBlur={handleAccountBlur}
                aria-current={view === 'accounts' ? 'page' : undefined}
                onClick={() => navigate('accounts')}
              >
                <Users size={20} aria-hidden="true" /> Family accounts
              </button>
            )}
            <button
              className="secondary"
              onKeyDown={handleAccountKeyDown}
              onBlur={handleAccountBlur}
              onClick={onLogout}
            >
              <LogOut size={18} aria-hidden="true" /> Sign out
            </button>
          </section>
        </section>
      </div>
      <nav className="primary-nav" aria-label="Main navigation">
        <button
          aria-current={view === 'journal' ? 'page' : undefined}
          onClick={() => navigate('journal')}
        >
          <BookOpen size={20} aria-hidden="true" /> Journal
        </button>
        <button
          aria-current={view === 'recipes' ? 'page' : undefined}
          onClick={() => navigate('recipes')}
        >
          <BookOpen size={20} aria-hidden="true" /> Recipes
        </button>
      </nav>
    </>
  )
}
