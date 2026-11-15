import { useState } from 'react'
import { authApi, type CurrentUser } from './api/auth'
import AccountNavigation, { type DashboardView } from './AccountNavigation'
import Journal from './Journal'
import Recipes from './Recipes'
import LinkedRecipe from './LinkedRecipe'
import type { CookRequest, RecipeLink, Dish } from './api/dishes'
import UserManagement from './UserManagement'
import Profile from './Profile'
import { messageFrom } from './errors'

export default function Dashboard({
  user,
  onLogout,
  setError,
  onProfileChanged,
}: {
  user: CurrentUser
  onLogout: () => void
  setError: (message: string) => void
  onProfileChanged: (displayName: string | null) => void
}) {
  const [view, setView] = useState<DashboardView>('journal')
  const [mealReturn, setMealReturn] = useState<{ token: string; dish: Dish } | null>(null)
  const [recipesVisited, setRecipesVisited] = useState(false)
  const [profileVisited, setProfileVisited] = useState(false)
  const [cookRequest, setCookRequest] = useState<CookRequest | null>(null)
  const [recipeVisit, setRecipeVisit] = useState<{
    id: string
    token: string
    returnTo: 'journal' | 'recipes'
    originatingMeal?: Dish
  } | null>(null)
  const recordRecipe = (recipe: RecipeLink) => {
    setMealReturn(null)
    setCookRequest({ token: crypto.randomUUID(), recipe })
    setView('journal')
  }
  const navigate = (nextView: DashboardView) => {
    if (nextView === 'recipes') setRecipesVisited(true)
    if (nextView === 'profile') setProfileVisited(true)
    setView(nextView)
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
      <div hidden={view !== 'journal'}>
        <Journal
          active={view === 'journal'}
          cookRequest={cookRequest}
          mealReturn={mealReturn}
          onOpenRecipe={(recipe, dish) => {
            setRecipeVisit({
              id: recipe.id,
              token: crypto.randomUUID(),
              returnTo: 'journal',
              originatingMeal: dish,
            })
            setRecipesVisited(true)
            setView('recipes')
          }}
          onReturnToRecipe={(recipe) => {
            setRecipeVisit((current) => ({
              id: recipe.id,
              token: crypto.randomUUID(),
              returnTo: current?.id === recipe.id ? current.returnTo : 'recipes',
              originatingMeal: current?.id === recipe.id ? current.originatingMeal : undefined,
            }))
            setRecipesVisited(true)
            setView('recipes')
          }}
        />
      </div>
      {recipesVisited && (
        <div hidden={view !== 'recipes'}>
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
              backLabel={recipeVisit.returnTo === 'journal' ? 'Back to meal' : 'Back to recipes'}
              onRecord={recordRecipe}
              onBack={() => {
                if (recipeVisit.originatingMeal) {
                  setMealReturn({ token: crypto.randomUUID(), dish: recipeVisit.originatingMeal })
                }
                setView(recipeVisit.returnTo)
                setRecipeVisit(null)
              }}
            />
          )}
        </div>
      )}
      {user.role === 'ADMIN' && (
        <div hidden={view !== 'accounts'}>
          <UserManagement setError={setError} />
        </div>
      )}
      {profileVisited && (
        <div hidden={view !== 'profile'}>
          <Profile active={view === 'profile'} onChanged={onProfileChanged} />
        </div>
      )}
    </div>
  )
}
