import { useEffect, useRef, useState } from 'react'
import { recipesApi, type Recipe } from './api/recipes'
import type { RecipeLink } from './api/dishes'
import RecipeDetail from './RecipeDetail'
import { messageFrom } from './errors'

// A separate read view lets meals open current recipe content without replacing
// a library editor, its draft, or its discovery state.
export default function LinkedRecipe({
  id,
  backLabel,
  onBack,
  onRecord,
}: {
  id: string
  backLabel: string
  onBack: () => void
  onRecord: (recipe: RecipeLink) => void
}) {
  const [recipe, setRecipe] = useState<Recipe>()
  const [error, setError] = useState('')
  const [request, setRequest] = useState({ id })
  const region = useRef<HTMLElement>(null)
  useEffect(() => {
    let cancelled = false
    recipesApi
      .get(request.id)
      .then((value) => {
        if (!cancelled) setRecipe(value)
      })
      .catch((reason) => {
        if (!cancelled) setError(messageFrom(reason))
      })
    return () => {
      cancelled = true
    }
  }, [request])
  return (
    <section ref={region} className="journal" aria-label="Linked recipe">
      <RecipeDetail
        titleId="linked-recipe-title"
        recipe={recipe}
        error={error}
        backLabel={backLabel}
        onBack={onBack}
        onRecord={onRecord}
        onRetry={() => {
          region.current?.querySelector('h2')?.focus()
          setError('')
          setRequest({ id })
        }}
      />
    </section>
  )
}
