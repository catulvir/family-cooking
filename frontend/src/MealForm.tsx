import { useEffect, useRef, useState } from 'react'
import { FormikProvider, useFormik } from 'formik'
import { Save } from 'lucide-react'
import { AppForm, FormField, FormError } from './forms'
import { mealSchema, type MealValues } from './formSchemas'
import {
  dishesApi,
  DishApiError,
  type Dish,
  type DishInput,
  type RecipeLink,
  type CookRequest,
} from './api/dishes'
import RecipePicker from './RecipePicker'
import { messageFrom } from './errors'

export default function MealForm({
  dish,
  sourceRecipe,
  pendingRecipe,
  active,
  onContinue,
  onReplace,
  onCancel,
  onSaved,
}: {
  dish?: Dish
  sourceRecipe?: RecipeLink
  pendingRecipe: CookRequest | null
  active: boolean
  onContinue: () => void
  onReplace: (recipe: RecipeLink) => void
  onCancel: () => void
  onSaved: (dish: Dish) => void
}) {
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeLink | null>(
    dish?.recipe ?? sourceRecipe ?? null,
  )
  const [initialValues] = useState<MealValues>(() => ({
    name: dish?.name ?? sourceRecipe?.name ?? '',
    preparedOn: dish?.preparedOn ?? localToday(),
    location: dish?.location ?? '',
    notes: dish?.notes ?? '',
    recipeId: dish?.recipe?.id ?? sourceRecipe?.id ?? null,
  }))
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const formik = useFormik({
    initialValues,
    validationSchema: mealSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values, helpers) => {
      const input: DishInput = {
        name: values.name.trim(),
        preparedOn: values.preparedOn,
        location: values.location.trim() || null,
        notes: values.notes.trim() || null,
        recipeId: values.recipeId ?? null,
      }
      try {
        const saved = dish ? await dishesApi.update(dish.id, input) : await dishesApi.create(input)
        if (mounted.current) onSaved(saved)
      } catch (reason) {
        if (!mounted.current) return
        helpers.setStatus(messageFrom(reason))
        if (reason instanceof DishApiError) helpers.setErrors(reason.fieldErrors)
      }
    },
  })
  const { dirty, isSubmitting: saving } = formik
  const [discard, setDiscard] = useState<{ recipe?: RecipeLink } | null>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const startButton = useRef<HTMLButtonElement>(null)
  const keepButton = useRef<HTMLButtonElement>(null)
  const continueButton = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<HTMLButtonElement | null>(null)
  const focusedRequest = useRef<string | null>(null)
  useEffect(() => {
    if (!active) return
    if (discard) keepButton.current?.focus()
    else if (returnTo.current) {
      returnTo.current.focus()
      returnTo.current = null
    } else if (pendingRecipe && focusedRequest.current !== pendingRecipe.token) {
      focusedRequest.current = pendingRecipe.token
      continueButton.current?.focus()
    }
  }, [pendingRecipe, active, discard])
  const keepEditing = () => {
    returnTo.current = (discard?.recipe ? startButton : cancelButton).current
    setDiscard(null)
  }
  const requestDiscard = (recipe?: RecipeLink) => {
    if (saving) return
    if (dirty) setDiscard({ recipe })
    else if (recipe) onReplace(recipe)
    else onCancel()
  }
  return (
    <FormikProvider value={formik}>
      <AppForm className="form dish-form" disabled={!!discard}>
        <h2 id="journal-form-title" tabIndex={-1}>
          {dish ? 'Edit meal' : 'Record a meal'}
        </h2>
        {pendingRecipe && (
          <section aria-label="Existing meal draft">
            <p>
              You already have a meal draft. Continue it or start a new meal from{' '}
              {pendingRecipe.recipe.name}.
            </p>
            <div className="form-actions">
              <button
                ref={continueButton}
                type="button"
                className="secondary"
                onClick={() => {
                  continueButton.current?.closest('form')?.querySelector<HTMLElement>('h2')?.focus()
                  onContinue()
                }}
              >
                Continue existing meal
              </button>
              <button
                ref={startButton}
                type="button"
                disabled={saving || !!discard}
                onClick={() => requestDiscard(pendingRecipe.recipe)}
              >
                Start a new meal
              </button>
            </div>
          </section>
        )}
        <fieldset className="recipe-fields" disabled={saving}>
          <legend>Meal details</legend>
          <FormField name="name" label="Meal name" />
          <FormField name="preparedOn" label="Meal date" type="date" />
          <FormField name="location" label="Location (optional)" maxLength={200} />
          <FormField name="notes" label="Notes (optional)" as="textarea" maxLength={5000} />
          <RecipePicker
            active={active}
            selected={selectedRecipe}
            error={formik.submitCount > 0 ? formik.errors.recipeId : undefined}
            onSelect={(recipe) => {
              setSelectedRecipe(recipe)
              void formik.setValues(
                (values) => ({
                  ...values,
                  recipeId: recipe?.id ?? null,
                  name: values.name.trim() ? values.name : (recipe?.name ?? values.name),
                }),
                false,
              )
            }}
          />
        </fieldset>
        <FormError />
        <div className="form-actions">
          <button disabled={saving || !!discard}>
            <Save aria-hidden="true" />
            {saving ? 'Saving…' : 'Save meal'}
          </button>
          <button
            ref={cancelButton}
            type="button"
            className="secondary"
            onClick={() => requestDiscard()}
            disabled={saving || !!discard}
          >
            Cancel
          </button>
        </div>
        {discard && (
          <section aria-label="Unsaved changes">
            <output>Discard your unsaved changes?</output>
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
                disabled={saving}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') keepEditing()
                }}
                onClick={() => {
                  if (!saving) {
                    if (discard.recipe) onReplace(discard.recipe)
                    else onCancel()
                  }
                }}
              >
                Discard changes
              </button>
            </div>
          </section>
        )}
      </AppForm>
    </FormikProvider>
  )
}

function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
