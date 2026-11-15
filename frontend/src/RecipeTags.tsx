import { useId } from 'react'
import { useFormikContext } from 'formik'
import { tagGroups, type RecipeTag, type TagCatalogue, type TagGroup } from './api/recipes'
import type { RecipeValues } from './recipeFormSchema'

export interface CatalogueState {
  catalogue: TagCatalogue | null
  loading: boolean
  error: string
  retry: () => void
}

export function CatalogueFeedback({ catalogue, loading, error, retry }: CatalogueState) {
  return (
    <>
      {loading && <output>Loading tags…</output>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" className="secondary" onClick={retry}>
            Retry tags
          </button>
        </div>
      )}
      {!loading &&
        !error &&
        catalogue &&
        Object.values(catalogue).every((tags) => !tags.length) && (
          <p>
            No tags yet. Recipes can be saved without tags. An administrator can add tags in Manage
            tags.
          </p>
        )}
    </>
  )
}

export function TagLabels({ tags = [] }: { tags?: RecipeTag[] }) {
  if (!tags.length) return null
  return (
    <ul className="tag-labels" aria-label="Recipe tags">
      {tags.map((tag) => (
        <li key={tag.id}>
          <span className="tag-chip">
            {tagGroups[tag.group]}: <span>{tag.name}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function TagSelection({
  state,
  savedTags = [],
}: {
  state: CatalogueState
  savedTags?: RecipeTag[]
}) {
  const { values, errors, touched, setFieldValue } = useFormikContext<RecipeValues>()
  const id = useId()
  const error = touched.tagIds && typeof errors.tagIds === 'string' ? errors.tagIds : undefined
  // Keep selected IDs visible and removable even when a catalogue request fails.
  const available = state.catalogue ? Object.values(state.catalogue).flat() : savedTags
  const missing = values.tagIds.filter((tagId) => !available.some((tag) => tag.id === tagId))
  return (
    <section aria-label="Recipe classification">
      <h3>Tags (optional)</h3>
      <p>Select up to 30 tags across Meal type, Cuisine, and Style.</p>
      <CatalogueFeedback {...state} />
      <div
        tabIndex={-1}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {error && (
          <p id={`${id}-error`} className="field-error">
            {error}
          </p>
        )}
        {(Object.keys(tagGroups) as TagGroup[]).map((group) => (
          <fieldset className="tag-options" key={group}>
            <legend>{tagGroups[group]}</legend>
            {available
              .filter((tag) => tag.group === group)
              .map((tag) => (
                <label key={tag.id}>
                  <input
                    type="checkbox"
                    checked={values.tagIds.includes(tag.id)}
                    onChange={(event) =>
                      void setFieldValue(
                        'tagIds',
                        event.target.checked
                          ? [...values.tagIds, tag.id]
                          : values.tagIds.filter((tagId) => tagId !== tag.id),
                        false,
                      )
                    }
                  />
                  <span>{tag.name}</span>
                </label>
              ))}
          </fieldset>
        ))}
        {missing.map((tagId, index) => (
          <button
            type="button"
            className="secondary"
            key={tagId}
            onClick={() =>
              void setFieldValue(
                'tagIds',
                values.tagIds.filter((value) => value !== tagId),
                false,
              )
            }
          >
            Remove unavailable tag {index + 1}
          </button>
        ))}
      </div>
    </section>
  )
}
