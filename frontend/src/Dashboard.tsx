import { useLayoutEffect, useRef, useState } from 'react'
import { authApi, type CurrentUser } from './api/auth'
import AccountNavigation, { type DashboardView } from './AccountNavigation'
import Journal from './Journal'
import UserManagement from './UserManagement'
import { messageFrom } from './errors'

export default function Dashboard({
  user,
  onLogout,
  setError,
}: {
  user: CurrentUser
  onLogout: () => void
  setError: (message: string) => void
}) {
  const [view, setView] = useState<DashboardView>('journal')
  const accountHeading = useRef<HTMLHeadingElement>(null)
  const journalPanel = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (view === 'accounts') accountHeading.current?.focus()
  }, [view])
  const navigate = (nextView: DashboardView) => {
    setView(nextView)
    if (view === nextView) {
      if (nextView === 'accounts') accountHeading.current?.focus()
      else journalPanel.current?.querySelector('h2')?.focus()
    }
  }
  const logout = async () => {
    setError('')
    try {
      await authApi.logout()
      onLogout()
    } catch (reason) {
      setError(messageFrom(reason))
    }
  }
  return (
    <div className="dashboard">
      <AccountNavigation user={user} view={view} onNavigate={navigate} onLogout={logout} />
      <div ref={journalPanel} hidden={view !== 'journal'}>
        <Journal active={view === 'journal'} />
      </div>
      {user.role === 'ADMIN' && (
        <div hidden={view !== 'accounts'}>
          <UserManagement headingRef={accountHeading} setError={setError} />
        </div>
      )}
    </div>
  )
}
