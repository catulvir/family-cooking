import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, Pencil, Plus } from 'lucide-react'
import { recipesApi, type Recipe, type RecipePage } from './api/recipes'
import RecipeForm from './RecipeForm'
import { messageFrom } from './errors'

type View =
  | { kind: 'list' }
  | { kind: 'detail'; id: string; recipe?: Recipe }
  | { kind: 'form'; recipe?: Recipe }

export default function Recipes({ active }: { active: boolean }) {
  const [view, setView] = useState<View>({ kind: 'list' })
  const [listRequest, setListRequest] = useState({ page: 0, revision: 0 })
  const page = listRequest.page
  const [results, setResults] = useState<RecipePage | null>(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [notice, setNotice] = useState('')
  const region = useRef<HTMLElement>(null)
  const returnTarget = useRef<string | null>(null)

  useEffect(() => {
    const requestedPage = listRequest.page
    let cancelled = false
    recipesApi
      .list(requestedPage)
      .then((data) => {
        if (cancelled) return
        if (requestedPage > 0 && requestedPage >= data.totalPages) {
          setListRequest((current) => ({ ...current, page: Math.max(0, data.totalPages - 1) }))
          return
        }
        setResults(data)
        setLoading(false)
      })
      .catch((reason) => {
        if (!cancelled) {
          setListError(messageFrom(reason))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [listRequest])

  useEffect(() => {
    if (view.kind !== 'detail' || view.recipe) return
    let cancelled = false
    recipesApi
      .get(view.id)
      .then((recipe) => {
        if (!cancelled) {
          setDetailError('')
          setView({ kind: 'detail', id: recipe.id, recipe })
        }
      })
      .catch((reason) => {
        if (!cancelled) setDetailError(messageFrom(reason))
      })
    return () => {
      cancelled = true
    }
  }, [view])

  useLayoutEffect(() => {
    if (!active) return
    const target = returnTarget.current
      ? region.current?.querySelector<HTMLElement>(`[data-return="${returnTarget.current}"]`)
      : null
    ;(target ?? region.current?.querySelector<HTMLElement>(`#recipes-${view.kind}-title`))?.focus()
    if (target || view.kind !== 'detail' || view.recipe) returnTarget.current = null
  }, [active, view])

  const open = (id: string) => {
    setNotice('')
    setDetailError('')
    setView({ kind: 'detail', id })
  }
  const back = (id: string) => {
    returnTarget.current = id
    setNotice('')
    setView({ kind: 'list' })
  }
  const reloadList = () => {
    setLoading(true)
    setListError('')
    setListRequest((current) => ({ ...current, revision: current.revision + 1 }))
  }
  const changePage = (next: number) => {
    // Move focus to a stable anchor before the paging controls unmount. Loading
    // and request completion can then leave focus alone, even after navigation.
    region.current?.querySelector<HTMLElement>('#recipes-list-title')?.focus()
    setLoading(true)
    setListError('')
    setResults(null)
    setListRequest((current) => ({ ...current, page: next }))
  }
  const saved = (recipe: Recipe) => {
    setNotice('Recipe saved.')
    setDetailError('')
    setView({ kind: 'detail', id: recipe.id, recipe })
    reloadList()
  }

  return (
    <section ref={region} className="journal" aria-labelledby={`recipes-${view.kind}-title`}>
      <output>{notice}</output>
      {view.kind === 'list' && (
        <>
          <div className="section-row">
            <h2 id="recipes-list-title" tabIndex={-1}>
              Recipes
            </h2>
            <button
              data-return="new"
              onClick={() => {
                setNotice('')
                setView({ kind: 'form' })
              }}
            >
              <Plus aria-hidden="true" /> New recipe
            </button>
          </div>
          {loading && <output>Loading recipes…</output>}
          {listError ? (
            <div role="alert">
              <p>{listError}</p>
              <button className="secondary" onClick={reloadList}>
                Try again
              </button>
            </div>
          ) : (
            results && (
              <>
                {results.totalElements === 0 ? (
                  <p>No recipes yet. Add your first family recipe.</p>
                ) : (
                  <>
                    <p>
                      {results.totalElements} {results.totalElements === 1 ? 'recipe' : 'recipes'}
                    </p>
                    <ul className="dish-list">
                      {results.items.map((recipe) => (
                        <li key={recipe.id}>
                          <button
                            className="dish-link"
                            data-return={recipe.id}
                            onClick={() => open(recipe.id)}
                          >
                            {recipe.name}
                          </button>
                          {recipe.servings !== null && (
                            <span className="recipe-servings">Serves {recipe.servings}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <nav className="form-actions" aria-label="Recipe pages">
                      <button
                        className="secondary"
                        disabled={loading || page === 0}
                        onClick={() => changePage(page - 1)}
                      >
                        Previous
                      </button>
                      <output>
                        Page {page + 1} of {results.totalPages}
                      </output>
                      <button
                        className="secondary"
                        disabled={loading || page + 1 >= results.totalPages}
                        onClick={() => changePage(page + 1)}
                      >
                        Next
                      </button>
                    </nav>
                  </>
                )}
              </>
            )
          )}
        </>
      )}
      {view.kind === 'detail' && (
        <article className="dish-detail">
          <button className="secondary" onClick={() => back(view.id)}>
            <ArrowLeft aria-hidden="true" /> Back to recipes
          </button>
          <h2 id="recipes-detail-title" tabIndex={-1}>
            {view.recipe?.name ?? 'Recipe'}
          </h2>
          {detailError ? (
            <div role="alert">
              <p>{detailError}</p>
              <button
                onClick={() => {
                  setDetailError('')
                  setView({ kind: 'detail', id: view.id })
                }}
              >
                Try again
              </button>
            </div>
          ) : (
            !view.recipe && <output>Loading recipe…</output>
          )}
          {view.recipe && (
            <>
              {view.recipe.servings !== null && <p>Servings: {view.recipe.servings}</p>}
              <div className="recipe-content">
                <section aria-label="Ingredients">
                  <h3>Ingredients</h3>
                  <ul>
                    {view.recipe.ingredients.map((item, index) => (
                      <li key={index}>
                        {[item.quantity, item.unit, item.name].filter(Boolean).join(' ')}
                      </li>
                    ))}
                  </ul>
                </section>
                <section aria-label="Instructions">
                  <h3>Instructions</h3>
                  <ol>
                    {view.recipe.instructions.map((step, index) => (
                      <li className="notes" key={index}>
                        {step.text}
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
              {view.recipe.notes && <p className="notes">{view.recipe.notes}</p>}
              {view.recipe.canEdit && (
                <button
                  data-return="edit"
                  onClick={() => {
                    setNotice('')
                    setView({ kind: 'form', recipe: view.recipe })
                  }}
                >
                  <Pencil aria-hidden="true" /> Edit recipe
                </button>
              )}
            </>
          )}
        </article>
      )}
      {view.kind === 'form' && (
        <RecipeForm
          recipe={view.recipe}
          active={active}
          onSaved={saved}
          onReloaded={(recipe) => {
            setNotice('Latest recipe loaded.')
            setDetailError('')
            setView({ kind: 'detail', id: recipe.id, recipe })
            reloadList()
          }}
          onCancel={() => {
            returnTarget.current = view.recipe ? 'edit' : 'new'
            // Fetch again after leaving an editor, so a conflicting draft can be discarded
            // and reopened against the latest server version.
            if (view.recipe) open(view.recipe.id)
            else setView({ kind: 'list' })
          }}
        />
      )}
    </section>
  )
}
