import { Plus } from 'lucide-react'
import { TagLabels, type CatalogueState } from './RecipeTags'
import RecipeDiscoveryControls from './RecipeDiscoveryControls'
import type { RecipeDiscoveryState } from './useRecipeDiscovery'

export default function RecipeLibrary({
  discovery,
  tagState,
  onNew,
  onRetry,
  onOpen,
  onPageChange,
}: {
  discovery: RecipeDiscoveryState
  tagState: CatalogueState
  onNew: () => void
  onRetry: () => void
  onOpen: (id: string) => void
  onPageChange: (page: number) => void
}) {
  const {
    results,
    loading,
    error,
    query: { page, q, tagIds },
  } = discovery
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
      <RecipeDiscoveryControls discovery={discovery} tagState={tagState} />
      {q && <p>Search: “{q}”</p>}
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
              <output>
                {q || tagIds.length
                  ? 'No recipes match. Try a different name or clear filters.'
                  : 'No recipes yet. Add your first family recipe.'}
              </output>
            ) : (
              <>
                <output>
                  {results.totalElements} {results.totalElements === 1 ? 'recipe' : 'recipes'}
                </output>
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
