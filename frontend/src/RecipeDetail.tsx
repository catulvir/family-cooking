import { ArrowLeft, Pencil } from 'lucide-react'
import type { Recipe } from './api/recipes'
import { TagLabels } from './RecipeTags'

export default function RecipeDetail({
  recipe,
  error,
  onBack,
  onRetry,
  onEdit,
}: {
  recipe?: Recipe
  error: string
  onBack: () => void
  onRetry: () => void
  onEdit: () => void
}) {
  return (
    <article className="dish-detail">
      <button className="secondary" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Back to recipes
      </button>
      <h2 id="recipes-detail-title" tabIndex={-1}>
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
          {recipe.canEdit && (
            <button data-return="edit" onClick={onEdit}>
              <Pencil aria-hidden="true" /> Edit recipe
            </button>
          )}
        </>
      )}
    </article>
  )
}
