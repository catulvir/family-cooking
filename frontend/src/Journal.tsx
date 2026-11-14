import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  onOpenRecipe,
  onReturnToRecipe,
}: {
  active?: boolean
  cookRequest?: CookRequest | null
  onOpenRecipe?: (recipe: RecipeLink) => void
  onReturnToRecipe?: (recipe: RecipeLink) => void
}) {
  const [dishes, setDishes] = useState<Dish[]>([])
  const [view, setView] = useState<JournalView>({ kind: 'list' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const region = useRef<HTMLElement>(null)
  const returnFocus = useRef<(() => HTMLElement | null | undefined) | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const mealButtons = useRef(new Map<string, HTMLButtonElement>())
  const recipeButton = useRef<HTMLButtonElement>(null)
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
  useLayoutEffect(() => {
    if (active) {
      const target =
        returnFocus.current?.() ??
        region.current?.querySelector<HTMLElement>(`#journal-${view.kind}-title`)
      target?.focus()
      returnFocus.current = null
    }
  }, [active, view])

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
    <section ref={region} className="journal" aria-labelledby={`journal-${view.kind}-title`}>
      <output>{view.kind === 'list' && loading ? 'Loading meals…' : notice}</output>
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
              ref={addButton}
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
                  <button
                    ref={(button) => {
                      if (button) mealButtons.current.set(dish.id, button)
                      else mealButtons.current.delete(dish.id)
                    }}
                    className="dish-link"
                    onClick={() => showDetail(dish)}
                  >
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
          editRef={editButton}
          recipeRef={recipeButton}
          dish={view.dish}
          onOpenRecipe={
            onOpenRecipe
              ? (recipe) => {
                  returnFocus.current = () => recipeButton.current
                  onOpenRecipe(recipe)
                }
              : undefined
          }
          onBack={() => {
            setNotice('')
            returnFocus.current = () => mealButtons.current.get(view.dish.id)
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
            returnFocus.current = () => (view.dish ? editButton.current : addButton.current)
            setView(view.dish ? { kind: 'detail', dish: view.dish } : { kind: 'list' })
            if (view.sourceRecipe) onReturnToRecipe?.(view.sourceRecipe)
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
  editRef,
  recipeRef,
  dish,
  onBack,
  onEdit,
  onOpenRecipe,
}: {
  editRef: React.Ref<HTMLButtonElement>
  recipeRef: React.Ref<HTMLButtonElement>
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
        <button ref={recipeRef} className="secondary" onClick={() => onOpenRecipe(dish.recipe!)}>
          View recipe: {dish.recipe.name}
        </button>
      )}
      {dish.canEdit && (
        <button ref={editRef} onClick={onEdit}>
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
