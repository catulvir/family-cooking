import { useId, useLayoutEffect, useRef, useState } from 'react'
import { FieldArray, setIn, useFormikContext } from 'formik'
import { FormField } from './forms'
import { newIngredient, newStep, type RecipeValues } from './recipeFormSchema'

export default function RecipeRows({
  name,
  active,
}: {
  name: 'ingredients' | 'instructions'
  active: boolean
}) {
  const { values, errors, touched, submitCount, setFieldError, setFormikState } =
    useFormikContext<RecipeValues>()
  const rows = values[name]
  const label = name === 'ingredients' ? 'ingredient' : 'step'
  const error =
    (touched[name] || submitCount > 0) && typeof errors[name] === 'string'
      ? errors[name]
      : undefined
  const errorId = useId()
  const region = useRef<HTMLFieldSetElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const focusNext = useRef<string | null>(null)
  const [notice, setNotice] = useState('')

  const moveRow = (from: number, to: number) => {
    focusNext.current = rows[from].key
    setFormikState((current) => {
      const order = Array.from({ length: current.values[name].length }, (_, index) => index)
      order.splice(to, 0, order.splice(from, 1)[0])
      // Server errors may be sparse or shorter than the values. Apply the same
      // full-length permutation so an error follows its row in either direction.
      const reorderMetadata = (metadata: unknown) =>
        Array.isArray(metadata) ? order.map((index) => metadata[index]) : metadata
      return {
        ...current,
        values: { ...current.values, [name]: order.map((index) => current.values[name][index]) },
        errors: setIn(current.errors, name, reorderMetadata(current.errors[name])),
        touched: setIn(current.touched, name, reorderMetadata(current.touched[name])),
      }
    })
    setNotice(`${label === 'ingredient' ? 'Ingredient' : 'Step'} moved to position ${to + 1}.`)
  }

  useLayoutEffect(() => {
    const key = focusNext.current
    focusNext.current = null
    if (!key || !active || (key !== 'add' && !rows.some((row) => row.key === key))) return
    if (key === 'add') addButton.current?.focus()
    else
      region.current
        ?.querySelector<HTMLElement>(
          `[data-row-key="${key}"] input, [data-row-key="${key}"] textarea`,
        )
        ?.focus()
  }, [rows, active])

  return (
    <FieldArray name={name} validateOnChange={false}>
      {(helpers) => (
        <fieldset
          ref={region}
          className="recipe-rows"
          aria-describedby={error ? errorId : undefined}
        >
          <legend>{name === 'ingredients' ? 'Ingredients' : 'Instructions'}</legend>
          {rows.map((row, index) => (
            <div className="recipe-row" key={row.key} data-row-key={row.key}>
              {name === 'ingredients' ? (
                <>
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
                </>
              ) : (
                <FormField
                  name={`instructions[${index}].text`}
                  label={`Step ${index + 1}`}
                  as="textarea"
                  maxLength={2000}
                />
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={index === 0}
                  onClick={() => {
                    moveRow(index, index - 1)
                  }}
                >
                  Move {label} {index + 1} up
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={index === rows.length - 1}
                  onClick={() => {
                    moveRow(index, index + 1)
                  }}
                >
                  Move {label} {index + 1} down
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    focusNext.current = rows[index + 1]?.key ?? rows[index - 1]?.key ?? 'add'
                    helpers.remove(index)
                    setNotice(
                      `${label === 'ingredient' ? 'Ingredient' : 'Step'} removed. ${rows.length - 1} remaining.`,
                    )
                  }}
                >
                  Remove {label} {index + 1}
                </button>
              </div>
            </div>
          ))}
          <button
            ref={addButton}
            type="button"
            className="secondary"
            disabled={rows.length >= 100}
            data-error-focus={!!error}
            aria-describedby={error ? errorId : undefined}
            onClick={() => {
              const row = name === 'ingredients' ? newIngredient() : newStep()
              focusNext.current = row.key
              if (typeof errors[name] === 'string') setFieldError(name, undefined)
              helpers.push(row)
              setNotice(
                `${label === 'ingredient' ? 'Ingredient' : 'Step'} ${rows.length + 1} added.`,
              )
            }}
          >
            Add {label}
          </button>
          {error && (
            <p className="field-error" id={errorId}>
              {error}
            </p>
          )}
          <output>{notice}</output>
        </fieldset>
      )}
    </FieldArray>
  )
}
