import { Plus } from 'lucide-react'
import type { RecipePage } from './api/recipes'
import { TagLabels } from './RecipeTags'

export default function RecipeLibrary({
  page,
  results,
  loading,
  error,
  onNew,
  onRetry,
  onOpen,
  onPageChange,
}: {
  page: number
  results: RecipePage | null
  loading: boolean
  error: string
  onNew: () => void
  onRetry: () => void
  onOpen: (id: string) => void
  onPageChange: (page: number) => void
}) {
  return (
    <>
      <div className="section-row">
        <h2 id="recipes-list-title" tabIndex={-1}>
          Recipes
        </h2>
        <button data-return="new" onClick={onNew}>
          <Plus aria-hidden="true" /> New recipe
        </button>
      </div>
      {loading && <output>Loading recipes…</output>}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button className="secondary" onClick={onRetry}>
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
                        onClick={() => onOpen(recipe.id)}
                      >
                        {recipe.name}
                      </button>
                      {recipe.servings !== null && (
                        <span className="recipe-servings">Serves {recipe.servings}</span>
                      )}
                      <TagLabels tags={recipe.tags} />
                    </li>
                  ))}
                </ul>
                <nav className="form-actions" aria-label="Recipe pages">
                  <button
                    className="secondary"
                    disabled={loading || page === 0}
                    onClick={() => onPageChange(page - 1)}
                  >
                    Previous
                  </button>
                  <output>
                    Page {page + 1} of {results.totalPages}
                  </output>
                  <button
                    className="secondary"
                    disabled={loading || page + 1 >= results.totalPages}
                    onClick={() => onPageChange(page + 1)}
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
  )
}
