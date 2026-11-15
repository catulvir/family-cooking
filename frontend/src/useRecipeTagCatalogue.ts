import { useEffect, useState } from 'react'
import { recipeTagsApi, type RecipeTag, type TagCatalogue } from './api/recipes'
import { messageFrom } from './errors'

export default function useRecipeTagCatalogue() {
  const [catalogue, setCatalogue] = useState<TagCatalogue | null>(null)
  const [tagLoading, setTagLoading] = useState(true)
  const [tagError, setTagError] = useState('')
  const [tagRevision, setTagRevision] = useState(0)
  useEffect(() => {
    let cancelled = false
    recipeTagsApi
      .list()
      .then((data) => {
        if (!cancelled) {
          setCatalogue(data)
          setTagLoading(false)
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setTagError(messageFrom(reason))
          setTagLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Revision explicitly retries the catalogue request.
  }, [tagRevision])
  const tagState = {
    catalogue,
    loading: tagLoading,
    error: tagError,
    retry: () => {
      setTagLoading(true)
      setTagError('')
      setTagRevision((revision) => revision + 1)
    },
  }
  const refreshAfterSave = (tag: RecipeTag) => {
    // Cancel any older catalogue response before applying the mutation result.
    tagState.retry()
    setCatalogue((current) =>
      current
        ? {
            ...current,
            [tag.group]: [...current[tag.group].filter((item) => item.id !== tag.id), tag].sort(
              (a, b) => a.name.localeCompare(b.name),
            ),
          }
        : current,
    )
  }
  return { tagState, refreshAfterSave }
}
