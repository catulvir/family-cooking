import { ArrowLeft, Pencil } from 'lucide-react'
import type { Recipe } from './api/recipes'
import type { RecipeLink } from './api/dishes'
import { TagLabels } from './RecipeTags'

export default function RecipeDetail({
  recipe,
  error,
  onBack,
  onRetry,
  onEdit,
  onRecord,
  backLabel = 'Back to recipes',
  titleId = 'recipes-detail-title',
}: {
  recipe?: Recipe
  error: string
  onBack: () => void
  onRetry: () => void
  onEdit?: () => void
  onRecord?: (recipe: RecipeLink) => void
  backLabel?: string
  titleId?: string
}) {
  return (
    <article className="dish-detail">
      <button className="secondary" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> {backLabel}
      </button>
      <h2 id={titleId} tabIndex={-1}>
        {recipe?.name ?? 'Recipe'}
      </h2>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button onClick={onRetry}>Try again</button>
        </div>
      ) : (
        !recipe && <output>Loading recipe…</output>
      )}
      {recipe && (
        <>
          {recipe.servings !== null && <p>Servings: {recipe.servings}</p>}
          <TagLabels tags={recipe.tags} />
          <div className="recipe-content">
            <section aria-label="Ingredients">
              <h3>Ingredients</h3>
              <ul>
                {recipe.ingredients.map((item, index) => (
                  <li key={index}>
                    {[item.quantity, item.unit, item.name].filter(Boolean).join(' ')}
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Instructions">
              <h3>Instructions</h3>
              <ol>
                {recipe.instructions.map((step, index) => (
                  <li className="notes" key={index}>
                    {step.text}
                  </li>
                ))}
              </ol>
            </section>
          </div>
          {recipe.notes && <p className="notes">{recipe.notes}</p>}
          {onRecord && (
            <button onClick={() => onRecord({ id: recipe.id, name: recipe.name })}>
              Record cooking this recipe
            </button>
          )}
          {recipe.canEdit && onEdit && (
            <button data-return="edit" onClick={onEdit}>
              <Pencil aria-hidden="true" /> Edit recipe
            </button>
          )}
        </>
      )}
    </article>
  )
}
