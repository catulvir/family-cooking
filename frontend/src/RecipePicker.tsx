import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { RecipeLink } from './api/dishes'
import useRecipeDiscovery from './useRecipeDiscovery'

export default function RecipePicker({
  selected,
  onSelect,
  error,
  active,
}: {
  selected: RecipeLink | null
  onSelect: (recipe: RecipeLink | null) => void
  error?: string
  active: boolean
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  useLayoutEffect(() => {
    if (!open && restoreFocus.current) {
      restoreFocus.current = false
      if (active) trigger.current?.focus()
    }
  }, [open, active])
  const close = () => {
    restoreFocus.current = true
    setOpen(false)
  }
  return (
    <section aria-label="Recipe (optional)">
      <h3>Recipe (optional)</h3>
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
        <p>
          {selected
            ? `Selected recipe: ${selected.name}`
            : 'No recipe selected. You can save this meal without one.'}
        </p>
        <div className="form-actions">
          <button
            ref={trigger}
            type="button"
            className="secondary"
            aria-expanded={open}
            aria-controls={`${id}-picker`}
            onClick={() => {
              if (open) close()
              else setOpen(true)
            }}
          >
            {selected ? 'Change recipe' : 'Choose recipe'}
          </button>
          {selected && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                onSelect(null)
                trigger.current?.focus()
              }}
            >
              Clear recipe
            </button>
          )}
        </div>
      </div>
      <div id={`${id}-picker`}>
        {open && (
          <RecipePickerSearch
            active={active}
            onClose={close}
            onSelect={(recipe) => {
              onSelect(recipe)
              close()
            }}
          />
        )}
      </div>
    </section>
  )
}

function RecipePickerSearch({
  active,
  onClose,
  onSelect,
}: {
  active: boolean
  onClose: () => void
  onSelect: (recipe: RecipeLink) => void
}) {
  const discovery = useRecipeDiscovery()
  const input = useRef<HTMLInputElement>(null)
  const opened = useRef(false)
  const id = useId()
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    if (active) input.current?.focus()
  }, [active])
  const changePage = (page: number) => {
    discovery.changePage(page)
  }
  return (
    <section className="recipe-picker" aria-label="Choose a recipe">
      <h4>Find a family recipe</h4>
      <div className="form-field">
        <label htmlFor={`${id}-query`}>Find a recipe</label>
        <input
          ref={input}
          id={`${id}-query`}
          type="search"
          maxLength={200}
          value={discovery.searchText}
          onChange={(event) => discovery.setSearchText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              discovery.search()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
          }}
        />
      </div>
      <div className="form-actions">
        <button type="button" onClick={discovery.search}>
          Search recipes
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          Close recipe search
        </button>
      </div>
      {discovery.loading && <output>Loading recipes…</output>}
      {discovery.error && (
        <div role="alert">
          <p>{discovery.error}</p>
          <button type="button" onClick={discovery.reload}>
            Retry recipe search
          </button>
        </div>
      )}
      {discovery.results && (
        <>
          {discovery.results.totalElements === 0 ? (
            <output>No recipes match. Try another name.</output>
          ) : (
            <>
              <output>{discovery.results.totalElements} recipes</output>
              <ul className="dish-list">
                {discovery.results.items.map((recipe) => (
                  <li key={recipe.id}>
                    <span>{recipe.name}</span>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => onSelect({ id: recipe.id, name: recipe.name })}
                    >
                      Select {recipe.name}
                    </button>
                  </li>
                ))}
              </ul>
              <nav className="form-actions" aria-label="Recipe search pages">
                <button
                  type="button"
                  className="secondary"
                  disabled={discovery.query.page === 0}
                  onClick={() => changePage(discovery.query.page - 1)}
                >
                  Previous recipes
                </button>
                <output>
                  Page {discovery.query.page + 1} of {discovery.results.totalPages}
                </output>
                <button
                  type="button"
                  className="secondary"
                  disabled={discovery.query.page + 1 >= discovery.results.totalPages}
                  onClick={() => changePage(discovery.query.page + 1)}
                >
                  Next recipes
                </button>
              </nav>
            </>
          )}
        </>
      )}
    </section>
  )
}
