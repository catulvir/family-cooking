import { useEffect, useRef, useState } from 'react'
import { FieldArray, FormikProvider, setIn, useFormik } from 'formik'
import * as yup from 'yup'
import { AppForm, FormError, FormField } from './forms'
import { RecipeApiError, recipesApi, type Recipe } from './api/recipes'
import { messageFrom } from './errors'

const schema = yup.object({
  name: yup.string().trim().required('Enter a recipe name.').max(200),
  servings: yup
    .string()
    .test(
      'servings',
      'Enter a whole number from 1 to 999.',
      (value) =>
        !value?.trim() ||
        (/^\d+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 999),
    ),
  notes: yup.string().trim().max(5000),
  ingredients: yup
    .array()
    .of(
      yup.object({
        name: yup.string().trim().required('Enter an ingredient name.').max(200),
        quantity: yup.string().trim().max(50),
        unit: yup.string().trim().max(50),
      }),
    )
    .min(1)
    .max(100),
  instructions: yup
    .array()
    .of(yup.object({ text: yup.string().trim().required('Enter an instruction.').max(2000) }))
    .min(1)
    .max(100),
})
const emptyIngredient = () => ({ name: '', quantity: '', unit: '' })

export default function RecipeForm({
  recipe,
  active,
  onSaved,
  onCancel,
}: {
  recipe?: Recipe
  active: boolean
  onSaved: (recipe: Recipe) => void
  onCancel: () => void
}) {
  const [initialValues] = useState(() => ({
    name: recipe?.name ?? '',
    servings: recipe?.servings?.toString() ?? '',
    notes: recipe?.notes ?? '',
    ingredients: recipe?.ingredients.map((item) => ({
      name: item.name,
      quantity: item.quantity ?? '',
      unit: item.unit ?? '',
    })) ?? [emptyIngredient()],
    instructions: recipe?.instructions.map((step) => ({ text: step.text })) ?? [{ text: '' }],
  }))
  const formik = useFormik({
    initialValues,
    validationSchema: schema,
    validateOnBlur: false,
    validateOnChange: false,
    onSubmit: async (values, helpers) => {
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
        onSaved(recipe ? await recipesApi.update(recipe.id, input) : await recipesApi.create(input))
      } catch (reason) {
        helpers.setStatus(messageFrom(reason))
        if (reason instanceof RecipeApiError) {
          let errors = {}
          for (const [path, message] of Object.entries(reason.fieldErrors))
            errors = setIn(errors, path, message)
          helpers.setErrors(errors)
        }
      }
    },
  })
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const keepButton = useRef<HTMLButtonElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (confirmDiscard && active) keepButton.current?.focus()
  }, [confirmDiscard, active])
  const keepEditing = () => {
    setConfirmDiscard(false)
    cancelButton.current?.focus()
  }
  return (
    <FormikProvider value={formik}>
      <AppForm className="form recipe-form">
        <h2 id="recipes-form-title" tabIndex={-1}>
          {recipe ? 'Edit recipe' : 'New recipe'}
        </h2>
        <fieldset disabled={formik.isSubmitting} className="recipe-fields">
          <legend>Recipe content</legend>
          <FormField name="name" label="Recipe name" maxLength={200} />
          <FormField name="servings" label="Servings (optional)" />
          <FieldArray name="ingredients">
            {({ push, remove }) => (
              <fieldset className="recipe-rows">
                <legend>Ingredients</legend>
                {formik.values.ingredients.map((_, index) => (
                  <div className="recipe-row" key={index}>
                    <FormField
                      name={`ingredients[${index}].name`}
                      label={`Ingredient ${index + 1}`}
                      maxLength={200}
                    />
                    <FormField
                      name={`ingredients[${index}].quantity`}
                      label={`Quantity ${index + 1} (optional)`}
                      maxLength={50}
                    />
                    <FormField
                      name={`ingredients[${index}].unit`}
                      label={`Unit ${index + 1} (optional)`}
                      maxLength={50}
                    />
                    <button
                      type="button"
                      className="secondary"
                      disabled={formik.values.ingredients.length === 1}
                      onClick={() => remove(index)}
                    >
                      Remove ingredient {index + 1}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary"
                  disabled={formik.values.ingredients.length >= 100}
                  onClick={() => push(emptyIngredient())}
                >
                  Add ingredient
                </button>
              </fieldset>
            )}
          </FieldArray>
          <FieldArray name="instructions">
            {({ push, remove }) => (
              <fieldset className="recipe-rows">
                <legend>Instructions</legend>
                {formik.values.instructions.map((_, index) => (
                  <div className="recipe-row" key={index}>
                    <FormField
                      name={`instructions[${index}].text`}
                      label={`Step ${index + 1}`}
                      as="textarea"
                      maxLength={2000}
                    />
                    <button
                      type="button"
                      className="secondary"
                      disabled={formik.values.instructions.length === 1}
                      onClick={() => remove(index)}
                    >
                      Remove step {index + 1}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary"
                  disabled={formik.values.instructions.length >= 100}
                  onClick={() => push({ text: '' })}
                >
                  Add step
                </button>
              </fieldset>
            )}
          </FieldArray>
          <FormField name="notes" label="Recipe notes (optional)" as="textarea" maxLength={5000} />
        </fieldset>
        <FormError />
        <div className="form-actions">
          <button disabled={formik.isSubmitting}>
            {formik.isSubmitting ? 'Saving…' : 'Save recipe'}
          </button>
          <button
            ref={cancelButton}
            type="button"
            className="secondary"
            disabled={formik.isSubmitting}
            onClick={() => (formik.dirty ? setConfirmDiscard(true) : onCancel())}
          >
            Cancel
          </button>
        </div>
        {confirmDiscard && (
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
                disabled={formik.isSubmitting}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') keepEditing()
                }}
                onClick={onCancel}
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
