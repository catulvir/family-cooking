import { useEffect, useState } from 'react'
import { dishesApi, type Dish, type RecipeLink, type CookRequest } from './api/dishes'
import { ArrowLeft, Pencil, Plus } from 'lucide-react'
import MealForm from './MealForm'

type JournalView =
  | { kind: 'list' }
  | { kind: 'detail'; dish: Dish }
  | { kind: 'form'; dish?: Dish; sourceRecipe?: RecipeLink; draftId?: string }

export default function Journal({
  active = true,
  cookRequest,
  mealReturn,
  onOpenRecipe,
  onReturnToRecipe,
}: {
  active?: boolean
  cookRequest?: CookRequest | null
  mealReturn?: { token: string; dish: Dish } | null
  onOpenRecipe?: (recipe: RecipeLink, dish: Dish) => void
  onReturnToRecipe?: (recipe: RecipeLink) => void
}) {
  const [dishes, setDishes] = useState<Dish[]>([])
  const [view, setView] = useState<JournalView>({ kind: 'list' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [lastMealReturn, setLastMealReturn] = useState<string | null>(null)
  const [lastCookRequest, setLastCookRequest] = useState<string | null>(null)
  const [pendingRecipe, setPendingRecipe] = useState<CookRequest | null>(null)
  const startRecipeMeal = (recipe: RecipeLink) => {
    setPendingRecipe(null)
    setNotice('')
    setView({ kind: 'form', sourceRecipe: recipe, draftId: crypto.randomUUID() })
  }
  // Consume each navigation request once, preserving an already-mounted editor.
  if (cookRequest && lastCookRequest !== cookRequest.token) {
    setLastCookRequest(cookRequest.token)
    if (view.kind === 'form') setPendingRecipe(cookRequest)
    else {
      setPendingRecipe(null)
      setNotice('')
      setView({ kind: 'form', sourceRecipe: cookRequest.recipe, draftId: cookRequest.token })
    }
  }
  const returningMeal = mealReturn && mealReturn.token !== lastMealReturn ? mealReturn.dish : null
  // A recipe visit owns its return destination, independently of later cooking.
  // If another draft is open, retain it until the member saves or cancels it.
  if (returningMeal && view.kind !== 'form') {
    setLastMealReturn(mealReturn!.token)
    setPendingRecipe(null)
    setNotice('')
    setView({
      kind: 'detail',
      dish: dishes.find((dish) => dish.id === returningMeal.id) ?? returningMeal,
    })
  }

  const load = () => {
    setLoading(true)
    setError('')
    dishesApi
      .list()
      .then(setDishes)
      .catch((reason) => setError(messageFrom(reason)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    dishesApi
      .list()
      .then(setDishes)
      .catch((reason) => setError(messageFrom(reason)))
      .finally(() => setLoading(false))
  }, [])

  const showDetail = (dish: Dish) => {
    setNotice('')
    setView({ kind: 'detail', dish })
    setError('')
  }
  const saved = (dish: Dish) => {
    setNotice('Meal saved.')
    setDishes((current) =>
      [...current.filter((entry) => entry.id !== dish.id), dish].sort(compareDishes),
    )
    setView({ kind: 'detail', dish })
  }

  return (
    <section className="journal" aria-labelledby={`journal-${view.kind}-title`}>
      <output>{view.kind === 'list' && loading ? 'Loading meals…' : notice}</output>
      {returningMeal && view.kind === 'form' && (
        <output>Save or cancel your current meal draft to return to {returningMeal.name}.</output>
      )}
      {pendingRecipe && view.kind !== 'form' && (
        <section aria-label="Requested new meal">
          <p>Your previous meal is saved. Start a new meal from {pendingRecipe.recipe.name}?</p>
          <div className="form-actions">
            <button className="secondary" onClick={() => setPendingRecipe(null)}>
              Continue existing meal
            </button>
            <button onClick={() => startRecipeMeal(pendingRecipe.recipe)}>Start a new meal</button>
          </div>
        </section>
      )}
      {view.kind === 'list' && (
        <>
          <div className="section-row">
            <h2 id="journal-list-title" tabIndex={-1}>
              Meal journal
            </h2>
            <button
              onClick={() => {
                setNotice('')
                setView({ kind: 'form' })
              }}
            >
              <Plus aria-hidden="true" /> Add meal
            </button>
          </div>
          {loading ? null : error ? (
            <div className="journal-error" role="alert">
              <p>{error}</p>
              <button className="secondary" onClick={load}>
                Try again
              </button>
            </div>
          ) : dishes.length === 0 ? (
            <p>No meals yet. Record your first meal.</p>
          ) : (
            <ul className="dish-list">
              {dishes.map((dish) => (
                <li key={dish.id}>
                  <button className="dish-link" onClick={() => showDetail(dish)}>
                    {dish.name}
                  </button>
                  <time dateTime={dish.preparedOn}>{formatDate(dish.preparedOn)}</time>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {view.kind === 'detail' && (
        <MealDetail
          dish={view.dish}
          onOpenRecipe={
            onOpenRecipe
              ? (recipe) => {
                  onOpenRecipe(recipe, view.dish)
                }
              : undefined
          }
          onBack={() => {
            setNotice('')
            setView({ kind: 'list' })
          }}
          onEdit={() => {
            setNotice('')
            setView({ kind: 'form', dish: view.dish })
          }}
        />
      )}
      {view.kind === 'form' && (
        <MealForm
          key={view.draftId ?? view.dish?.id ?? 'new-meal'}
          dish={view.dish}
          sourceRecipe={view.sourceRecipe}
          active={active}
          pendingRecipe={pendingRecipe}
          onContinue={() => setPendingRecipe(null)}
          onReplace={startRecipeMeal}
          onCancel={() => {
            setPendingRecipe(null)
            setView(view.dish ? { kind: 'detail', dish: view.dish } : { kind: 'list' })
            if (view.sourceRecipe && !returningMeal) onReturnToRecipe?.(view.sourceRecipe)
          }}
          onSaved={saved}
        />
      )}
    </section>
  )
}

function compareDishes(left: Dish, right: Dish) {
  const preparedOnComparison = right.preparedOn.localeCompare(left.preparedOn)
  if (preparedOnComparison !== 0) return preparedOnComparison

  const createdAtComparison =
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  if (createdAtComparison !== 0) return createdAtComparison

  return right.id.localeCompare(left.id)
}

function MealDetail({
  dish,
  onBack,
  onEdit,
  onOpenRecipe,
}: {
  dish: Dish
  onBack: () => void
  onEdit: () => void
  onOpenRecipe?: (recipe: RecipeLink) => void
}) {
  return (
    <article className="dish-detail">
      <button className="secondary" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Back to meals
      </button>
      <p className="eyebrow">{formatDate(dish.preparedOn)}</p>
      <h2 id="journal-detail-title" tabIndex={-1}>
        {dish.name}
      </h2>
      {dish.location && <p>{dish.location}</p>}
      {dish.notes && <p className="notes">{dish.notes}</p>}
      {dish.recipe && onOpenRecipe && (
        <button className="secondary" onClick={() => onOpenRecipe(dish.recipe!)}>
          View recipe: {dish.recipe.name}
        </button>
      )}
      {dish.canEdit && (
        <button onClick={onEdit}>
          <Pencil aria-hidden="true" /> Edit meal
        </button>
      )}
    </article>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`),
  )
}

function messageFrom(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Something went wrong. Please try again.'
}
