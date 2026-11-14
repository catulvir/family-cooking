import { useLayoutEffect, useRef, useState } from 'react'
import { authApi, type CurrentUser } from './api/auth'
import AccountNavigation, { type DashboardView } from './AccountNavigation'
import Journal from './Journal'
import Recipes from './Recipes'
import LinkedRecipe from './LinkedRecipe'
import type { CookRequest, RecipeLink } from './api/dishes'
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
  const [cookRequest, setCookRequest] = useState<CookRequest | null>(null)
  const [recipeVisit, setRecipeVisit] = useState<{
    id: string
    token: string
    returnTo: 'journal' | 'recipes'
  } | null>(null)
  const recordRecipe = (recipe: RecipeLink) => {
    setCookRequest({ token: crypto.randomUUID(), recipe })
    setView('journal')
  }
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
        <Journal
          active={view === 'journal'}
          cookRequest={cookRequest}
          onOpenRecipe={(recipe) => {
            setRecipeVisit({ id: recipe.id, token: crypto.randomUUID(), returnTo: 'journal' })
            setRecipesVisited(true)
            setView('recipes')
          }}
          onReturnToRecipe={(recipe) => {
            setRecipeVisit((current) => ({
              id: recipe.id,
              token: crypto.randomUUID(),
              returnTo: current?.id === recipe.id ? current.returnTo : 'recipes',
            }))
            setRecipesVisited(true)
            setView('recipes')
          }}
        />
      </div>
      {recipesVisited && (
        <div ref={recipePanel} hidden={view !== 'recipes'}>
          <div hidden={!!recipeVisit}>
            <Recipes
              active={view === 'recipes' && !recipeVisit}
              isAdmin={user.role === 'ADMIN'}
              onRecord={recordRecipe}
            />
          </div>
          {recipeVisit && (
            <LinkedRecipe
              key={recipeVisit.token}
              id={recipeVisit.id}
              active={view === 'recipes'}
              backLabel={recipeVisit.returnTo === 'journal' ? 'Back to meal' : 'Back to recipes'}
              onRecord={recordRecipe}
              onBack={() => {
                setView(recipeVisit.returnTo)
                setRecipeVisit(null)
              }}
            />
          )}
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
