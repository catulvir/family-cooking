import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FormikProvider, useFormik } from 'formik'
import { AppForm, FormField, FormError } from './forms'
import { mealSchema, type MealValues } from './formSchemas'
import { dishesApi, DishApiError, type Dish, type DishInput } from './api/dishes'

type JournalView = { kind: 'list' } | { kind: 'detail'; dish: Dish } | { kind: 'form'; dish?: Dish }

export default function Journal({ active = true }: { active?: boolean }) {
  const [dishes, setDishes] = useState<Dish[]>([])
  const [view, setView] = useState<JournalView>({ kind: 'list' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const region = useRef<HTMLElement>(null)
  const returnFocus = useRef<(() => HTMLElement | null | undefined) | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const mealButtons = useRef(new Map<string, HTMLButtonElement>())
  useLayoutEffect(() => {
    if (active) {
      const target =
        returnFocus.current?.() ??
        region.current?.querySelector<HTMLElement>(`#journal-${view.kind}-title`)
      target?.focus()
    }
    returnFocus.current = null
  }, [active, view])

  const load = () => {
    setLoading(true)
    setError('')
    dishesApi
      .list()
      .then(setDishes)
      .catch((reason) => setError(messageFrom(reason)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    dishesApi
      .list()
      .then(setDishes)
      .catch((reason) => setError(messageFrom(reason)))
      .finally(() => setLoading(false))
  }, [])

  const showDetail = (dish: Dish) => {
    setNotice('')
    setView({ kind: 'detail', dish })
    setError('')
  }
  const saved = (dish: Dish) => {
    setNotice('Meal saved.')
    setDishes((current) =>
      [...current.filter((entry) => entry.id !== dish.id), dish].sort(compareDishes),
    )
    setView({ kind: 'detail', dish })
  }

  return (
    <section ref={region} className="journal" aria-labelledby={`journal-${view.kind}-title`}>
      <output>{view.kind === 'list' && loading ? 'Loading meals…' : notice}</output>
      {view.kind === 'list' && (
        <>
          <div className="section-row">
            <h2 id="journal-list-title" tabIndex={-1}>
              Meal journal
            </h2>
            <button
              ref={addButton}
              onClick={() => {
                setNotice('')
                setView({ kind: 'form' })
              }}
            >
              Add meal
            </button>
          </div>
          {loading ? null : error ? (
            <div className="journal-error" role="alert">
              <p>{error}</p>
              <button className="secondary" onClick={load}>
                Try again
              </button>
            </div>
          ) : dishes.length === 0 ? (
            <p>No meals yet. Record your first meal.</p>
          ) : (
            <ul className="dish-list">
              {dishes.map((dish) => (
                <li key={dish.id}>
                  <button
                    ref={(button) => {
                      if (button) mealButtons.current.set(dish.id, button)
                      else mealButtons.current.delete(dish.id)
                    }}
                    className="dish-link"
                    onClick={() => showDetail(dish)}
                  >
                    {dish.name}
                  </button>
                  <time dateTime={dish.preparedOn}>{formatDate(dish.preparedOn)}</time>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {view.kind === 'detail' && (
        <MealDetail
          editRef={editButton}
          dish={view.dish}
          onBack={() => {
            setNotice('')
            returnFocus.current = () => mealButtons.current.get(view.dish.id)
            setView({ kind: 'list' })
          }}
          onEdit={() => {
            setNotice('')
            setView({ kind: 'form', dish: view.dish })
          }}
        />
      )}
      {view.kind === 'form' && (
        <MealForm
          dish={view.dish}
          onCancel={() => {
            returnFocus.current = () => (view.dish ? editButton.current : addButton.current)
            setView(view.dish ? { kind: 'detail', dish: view.dish } : { kind: 'list' })
          }}
          onSaved={saved}
        />
      )}
    </section>
  )
}

function compareDishes(left: Dish, right: Dish) {
  const preparedOnComparison = right.preparedOn.localeCompare(left.preparedOn)
  if (preparedOnComparison !== 0) return preparedOnComparison

  const createdAtComparison =
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  if (createdAtComparison !== 0) return createdAtComparison

  return right.id.localeCompare(left.id)
}

function MealDetail({
  editRef,
  dish,
  onBack,
  onEdit,
}: {
  editRef: React.Ref<HTMLButtonElement>
  dish: Dish
  onBack: () => void
  onEdit: () => void
}) {
  return (
    <article className="dish-detail">
      <button className="secondary" onClick={onBack}>
        Back to meals
      </button>
      <p className="eyebrow">{formatDate(dish.preparedOn)}</p>
      <h2 id="journal-detail-title" tabIndex={-1}>
        {dish.name}
      </h2>
      {dish.location && <p>{dish.location}</p>}
      {dish.notes && <p className="notes">{dish.notes}</p>}
      {dish.canEdit && (
        <button ref={editRef} onClick={onEdit}>
          Edit meal
        </button>
      )}
    </article>
  )
}

function MealForm({
  dish,
  onCancel,
  onSaved,
}: {
  dish?: Dish
  onCancel: () => void
  onSaved: (dish: Dish) => void
}) {
  const [initialValues] = useState<MealValues>(() => ({
    name: dish?.name ?? '',
    preparedOn: dish?.preparedOn ?? localToday(),
    location: dish?.location ?? '',
    notes: dish?.notes ?? '',
  }))
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
      }
      try {
        onSaved(dish ? await dishesApi.update(dish.id, input) : await dishesApi.create(input))
      } catch (reason) {
        helpers.setStatus(messageFrom(reason))
        if (reason instanceof DishApiError) helpers.setErrors(reason.fieldErrors)
      }
    },
  })
  const { dirty, isSubmitting: saving } = formik
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const keepEditingButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (confirmDiscard) keepEditingButton.current?.focus()
  }, [confirmDiscard])
  const keepEditing = () => {
    setConfirmDiscard(false)
    cancelButton.current?.focus()
  }
  return (
    <FormikProvider value={formik}>
      <AppForm className="form dish-form">
        <h2 id="journal-form-title" tabIndex={-1}>
          {dish ? 'Edit meal' : 'Record a meal'}
        </h2>
        <FormField name="name" label="Meal name" />
        <FormField name="preparedOn" label="Meal date" type="date" />
        <FormField name="location" label="Location (optional)" maxLength={200} />
        <FormField name="notes" label="Notes (optional)" as="textarea" maxLength={5000} />
        <FormError />
        <div className="form-actions">
          <button disabled={saving}>{saving ? 'Saving…' : 'Save meal'}</button>
          <button
            ref={cancelButton}
            type="button"
            className="secondary"
            onClick={() => (dirty ? setConfirmDiscard(true) : onCancel())}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
        {confirmDiscard && (
          <section aria-label="Unsaved changes">
            <output>Discard your unsaved changes?</output>
            <div className="form-actions">
              <button
                ref={keepEditingButton}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') keepEditing()
                }}
                type="button"
                onClick={keepEditing}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="secondary"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') keepEditing()
                }}
                disabled={saving}
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

function localToday() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`),
  )
}

function messageFrom(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Something went wrong. Please try again.'
}
