import { useLayoutEffect, useRef, useState } from 'react'
import { authApi, type CurrentUser } from './api/auth'
import AccountNavigation, { type DashboardView } from './AccountNavigation'
import Journal from './Journal'
import Recipes from './Recipes'
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
  const recipePanel = useRef<HTMLDivElement>(null)
  const [recipesVisited, setRecipesVisited] = useState(false)
  useLayoutEffect(() => {
    if (view === 'accounts') accountHeading.current?.focus()
  }, [view])
  const navigate = (nextView: DashboardView) => {
    if (nextView === 'recipes') setRecipesVisited(true)
    setView(nextView)
    if (view === nextView) {
      if (nextView === 'accounts') accountHeading.current?.focus()
      else if (nextView === 'recipes')
        Array.from(recipePanel.current?.querySelectorAll('h2') ?? [])
          .find((heading) => !heading.closest('[hidden]'))
          ?.focus()
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
      {recipesVisited && (
        <div ref={recipePanel} hidden={view !== 'recipes'}>
          <Recipes active={view === 'recipes'} isAdmin={user.role === 'ADMIN'} />
        </div>
      )}
      {user.role === 'ADMIN' && (
        <div hidden={view !== 'accounts'}>
          <UserManagement headingRef={accountHeading} setError={setError} />
        </div>
      )}
    </div>
  )
}
