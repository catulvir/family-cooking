import { useId, useLayoutEffect, useRef } from 'react'
import { recipeSorts, tagGroups, type RecipeSort, type TagGroup } from './api/recipes'
import { CatalogueFeedback, type CatalogueState } from './RecipeTags'
import type { RecipeDiscoveryState } from './useRecipeDiscovery'

export default function RecipeDiscoveryControls({
  discovery,
  tagState,
}: {
  discovery: RecipeDiscoveryState
  tagState: CatalogueState
}) {
  const { query, searchText, setSearchText, filtersOpen, setFiltersOpen, setCriteria } = discovery
  const id = useId()
  const region = useRef<HTMLElement>(null)
  const filterToggle = useRef<HTMLButtonElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const focusAfterChange = useRef<'chip' | 'search' | null>(null)
  const tags = tagState.catalogue ? Object.values(tagState.catalogue).flat() : []
  useLayoutEffect(() => {
    if (!focusAfterChange.current) return
    const target =
      focusAfterChange.current === 'search'
        ? searchInput.current
        : (region.current?.querySelector<HTMLButtonElement>('.filter-chip') ?? filterToggle.current)
    focusAfterChange.current = null
    if (!region.current?.closest('[hidden]')) target?.focus()
  })
  const remove = (tagId: string) => {
    focusAfterChange.current = 'chip'
    setCriteria({ tagIds: query.tagIds.filter((selected) => selected !== tagId) })
  }
  const closeWithEscape = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    setFiltersOpen(false)
    filterToggle.current?.focus()
  }
  return (
    <section ref={region} className="recipe-discovery" aria-label="Find recipes">
      <div className="recipe-search-row">
        <form
          className="recipe-search"
          onSubmit={(event) => {
            event.preventDefault()
            discovery.search()
          }}
        >
          <div className="form-field">
            <label htmlFor={`${id}-search`}>Search recipes by name</label>
            <input
              ref={searchInput}
              id={`${id}-search`}
              type="search"
              maxLength={200}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>
          <button>Search</button>
        </form>
        <div className="form-field">
          <label htmlFor={`${id}-sort`}>Sort recipes</label>
          <select
            id={`${id}-sort`}
            value={query.sort}
            onChange={(event) => setCriteria({ sort: event.target.value as RecipeSort })}
          >
            {Object.entries(recipeSorts).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button
          ref={filterToggle}
          type="button"
          className="secondary"
          aria-expanded={filtersOpen}
          aria-controls={`${id}-filters`}
          onClick={() => setFiltersOpen(!filtersOpen)}
          onKeyDown={closeWithEscape}
        >
          Filters ({query.tagIds.length})
        </button>
        {query.tagIds.length > 0 && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              focusAfterChange.current = 'chip'
              setCriteria({ tagIds: [] })
            }}
          >
            Clear tags
          </button>
        )}
        {(query.q || query.tagIds.length > 0 || searchText) && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              focusAfterChange.current = 'search'
              discovery.clearAll()
            }}
          >
            Clear all
          </button>
        )}
      </div>
      {query.tagIds.length > 0 && (
        <ul className="tag-labels selected-filters" aria-label="Selected tag filters">
          {query.tagIds.map((selected, index) => {
            const tag = tags.find((candidate) => candidate.id === selected)
            const name = tag?.name ?? `Unavailable tag ${index + 1}`
            return (
              <li key={selected}>
                <button
                  type="button"
                  className="secondary filter-chip"
                  aria-label={`Remove ${name} filter`}
                  onClick={() => remove(selected)}
                >
                  {tag ? `${tagGroups[tag.group]}: ` : ''}
                  {name} <span aria-hidden="true">×</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div id={`${id}-filters`} hidden={!filtersOpen}>
        <p id={`${id}-help`}>
          Match any selected tag within a group and every selected group. Name search narrows the
          results further.
        </p>
        <CatalogueFeedback {...tagState} />
        <p>Select up to 30 filter tags.</p>
        <div className="recipe-filter-groups">
          {(Object.keys(tagGroups) as TagGroup[]).map((group) => (
            <fieldset className="tag-options" key={group} aria-describedby={`${id}-help`}>
              <legend>{tagGroups[group]}</legend>
              {tags
                .filter((tag) => tag.group === group)
                .map((tag) => (
                  <label key={tag.id}>
                    <input
                      type="checkbox"
                      checked={query.tagIds.includes(tag.id)}
                      disabled={query.tagIds.length >= 30 && !query.tagIds.includes(tag.id)}
                      onKeyDown={closeWithEscape}
                      onChange={(event) =>
                        setCriteria({
                          tagIds: event.target.checked
                            ? [...query.tagIds, tag.id]
                            : query.tagIds.filter((selected) => selected !== tag.id),
                        })
                      }
                    />
                    <span>{tag.name}</span>
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
      </div>
    </section>
  )
}
