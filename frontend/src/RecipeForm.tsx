import { useEffect, useRef, useState } from 'react'
import { FormikProvider, setIn, useFormik } from 'formik'
import { AppForm, FormError, FormField } from './forms'
import { RecipeApiError, recipesApi, type Recipe } from './api/recipes'
import { messageFrom } from './errors'
import RecipeRows from './RecipeRows'
import { recipeContent, recipeFormSchema, recipeValues } from './recipeFormSchema'

export default function RecipeForm({
  recipe,
  active,
  onSaved,
  onCancel,
  onReloaded,
}: {
  recipe?: Recipe
  active: boolean
  onSaved: (recipe: Recipe) => void
  onCancel: () => void
  onReloaded: (recipe: Recipe) => void
}) {
  const [initialValues] = useState(() => recipeValues(recipe))
  const [conflict, setConflict] = useState(false)
  const [reloading, setReloading] = useState(false)
  const reloadLock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const formik = useFormik({
    initialValues,
    validationSchema: recipeFormSchema,
    validateOnBlur: false,
    validateOnChange: false,
    onSubmit: async (values, helpers) => {
      if (reloadLock.current) return
      const input = {
        name: values.name.trim(),
        servings: values.servings.trim() ? Number(values.servings) : null,
        notes: values.notes.trim() || null,
        ingredients: values.ingredients.map((item) => ({
          name: item.name.trim(),
          quantity: item.quantity.trim() || null,
          unit: item.unit.trim() || null,
        })),
        instructions: values.instructions.map((step) => ({ text: step.text.trim() })),
        ...(recipe ? { version: recipe.version } : {}),
      }
      try {
        const saved = recipe
          ? await recipesApi.update(recipe.id, input)
          : await recipesApi.create(input)
        if (mounted.current) onSaved(saved)
      } catch (reason) {
        if (!mounted.current) return
        helpers.setStatus(messageFrom(reason))
        if (reason instanceof RecipeApiError) {
          if (reason.status === 409) setConflict(true)
          let errors = {}
          for (const [path, message] of Object.entries(reason.fieldErrors))
            errors = setIn(errors, path, message)
          helpers.setErrors(errors)
        }
      }
    },
  })
  const dirty =
    JSON.stringify(recipeContent(formik.values)) !== JSON.stringify(recipeContent(initialValues))
  const busy = formik.isSubmitting || reloading
  const [discardAction, setDiscardAction] = useState<'cancel' | 'reload' | null>(null)
  const keepButton = useRef<HTMLButtonElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const reloadButton = useRef<HTMLButtonElement>(null)
  const focusReloadAfterFailure = useRef(false)
  useEffect(() => {
    if (reloading || !focusReloadAfterFailure.current) return
    focusReloadAfterFailure.current = false
    if (active) reloadButton.current?.focus()
  }, [active, reloading])
  useEffect(() => {
    if (discardAction && active) keepButton.current?.focus()
  }, [discardAction, active])
  const keepEditing = () => {
    setDiscardAction(null)
    if (active) (discardAction === 'reload' ? reloadButton : cancelButton).current?.focus()
  }
  const reload = async () => {
    if (!recipe || reloadLock.current || formik.isSubmitting) return
    reloadLock.current = true
    setReloading(true)
    setDiscardAction(null)
    formik.setStatus(undefined)
    try {
      const latest = await recipesApi.get(recipe.id)
      if (mounted.current) onReloaded(latest)
    } catch (reason) {
      if (mounted.current) {
        focusReloadAfterFailure.current = true
        formik.setStatus(messageFrom(reason))
      }
    } finally {
      reloadLock.current = false
      if (mounted.current) setReloading(false)
    }
  }
  const confirm = (action: 'cancel' | 'reload') => {
    if (busy || reloadLock.current) return
    if (dirty) setDiscardAction(action)
    else if (action === 'reload') void reload()
    else onCancel()
  }
  return (
    <FormikProvider value={formik}>
      <AppForm className="form recipe-form" disabled={reloading}>
        <h2 id="recipes-form-title" tabIndex={-1}>
          {recipe ? 'Edit recipe' : 'New recipe'}
        </h2>
        <fieldset disabled={busy} className="recipe-fields">
          <legend>Recipe content</legend>
          <FormField name="name" label="Recipe name" maxLength={200} />
          <FormField name="servings" label="Servings (optional)" />
          <RecipeRows name="ingredients" active={active} />
          <RecipeRows name="instructions" active={active} />
          <FormField name="notes" label="Recipe notes (optional)" as="textarea" maxLength={5000} />
        </fieldset>
        <FormError />
        {conflict && recipe && (
          <section aria-label="Recipe changed">
            <p>
              A newer version is available. Your draft is still here. Reload the latest recipe to
              continue from the saved version.
            </p>
            <button
              ref={reloadButton}
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => confirm('reload')}
            >
              Reload latest recipe
            </button>
          </section>
        )}
        {reloading && <output>Loading latest recipe…</output>}
        <div className="form-actions">
          <button disabled={busy}>{formik.isSubmitting ? 'Saving…' : 'Save recipe'}</button>
          <button
            ref={cancelButton}
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => confirm('cancel')}
          >
            Cancel
          </button>
        </div>
        {discardAction && (
          <section aria-label="Unsaved changes">
            <output>
              {discardAction === 'reload'
                ? 'Discard your unsaved changes and open the latest saved recipe?'
                : 'Discard your unsaved changes?'}
            </output>
            <div className="form-actions">
              <button
                ref={keepButton}
                type="button"
                onClick={keepEditing}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') keepEditing()
                }}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') keepEditing()
                }}
                onClick={() => {
                  if (!busy) {
                    if (discardAction === 'reload') void reload()
                    else onCancel()
                  }
                }}
              >
                {discardAction === 'reload' ? 'Discard and reload' : 'Discard changes'}
              </button>
            </div>
          </section>
        )}
      </AppForm>
    </FormikProvider>
  )
}
