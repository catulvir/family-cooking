import { type FormEvent, useEffect, useState } from 'react'
import { dishesApi, DishApiError, type Dish, type DishInput } from './api/dishes'

type JournalView = { kind: 'list' } | { kind: 'detail'; dish: Dish } | { kind: 'form'; dish?: Dish }

export default function Journal() {
  const [dishes, setDishes] = useState<Dish[]>([])
  const [view, setView] = useState<JournalView>({ kind: 'list' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    setView({ kind: 'detail', dish })
    setError('')
  }
  const saved = (dish: Dish) => {
    setDishes((current) =>
      [...current.filter((entry) => entry.id !== dish.id), dish].sort(compareDishes),
    )
    setView({ kind: 'detail', dish })
  }

  return (
    <section className="journal" aria-labelledby="journal-title">
      {view.kind === 'list' && (
        <>
          <div className="section-row">
            <h2 id="journal-title">Meal journal</h2>
            <button onClick={() => setView({ kind: 'form' })}>Add meal</button>
          </div>
          {loading ? (
            <p>Loading meals…</p>
          ) : error ? (
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
                  <button className="dish-link" onClick={() => showDetail(dish)}>
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
          dish={view.dish}
          onBack={() => setView({ kind: 'list' })}
          onEdit={() => setView({ kind: 'form', dish: view.dish })}
        />
      )}
      {view.kind === 'form' && (
        <MealForm
          dish={view.dish}
          onCancel={() =>
            setView(view.dish ? { kind: 'detail', dish: view.dish } : { kind: 'list' })
          }
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
  dish,
  onBack,
  onEdit,
}: {
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
      <h2>{dish.name}</h2>
      {dish.location && <p>{dish.location}</p>}
      {dish.notes && <p className="notes">{dish.notes}</p>}
      {dish.canEdit && <button onClick={onEdit}>Edit meal</button>}
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
  const [name, setName] = useState(dish?.name ?? '')
  const [preparedOn, setPreparedOn] = useState(dish?.preparedOn ?? localToday())
  const [location, setLocation] = useState(dish?.location ?? '')
  const [notes, setNotes] = useState(dish?.notes ?? '')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setFieldErrors({ name: 'Enter a meal name.' })
      return
    }
    setSaving(true)
    setError('')
    setFieldErrors({})
    const input: DishInput = {
      name: trimmedName,
      preparedOn,
      location: location.trim() || null,
      notes: notes.trim() || null,
    }
    try {
      onSaved(dish ? await dishesApi.update(dish.id, input) : await dishesApi.create(input))
    } catch (reason) {
      if (reason instanceof DishApiError) {
        setError(reason.message)
        setFieldErrors(reason.fieldErrors)
      } else setError(messageFrom(reason))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form className="form dish-form" onSubmit={submit} noValidate>
      <h2>{dish ? 'Edit meal' : 'Record a meal'}</h2>
      <label>
        Meal name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-describedby={fieldErrors.name ? 'meal-name-error' : undefined}
        />
      </label>
      {fieldErrors.name && (
        <p className="field-error" id="meal-name-error">
          {fieldErrors.name}
        </p>
      )}
      <label>
        Meal date
        <input
          type="date"
          value={preparedOn}
          onChange={(event) => setPreparedOn(event.target.value)}
          required
        />
      </label>
      {fieldErrors.preparedOn && <p className="field-error">{fieldErrors.preparedOn}</p>}
      <label>
        Location (optional)
        <input
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          maxLength={200}
        />
      </label>
      {fieldErrors.location && <p className="field-error">{fieldErrors.location}</p>}
      <label>
        Notes (optional)
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={5000}
        />
      </label>
      {fieldErrors.notes && <p className="field-error">{fieldErrors.notes}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button disabled={saving}>{saving ? 'Saving…' : 'Save meal'}</button>
        <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
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
