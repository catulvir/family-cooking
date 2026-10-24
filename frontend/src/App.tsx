import { type FormEvent, useEffect, useState } from 'react'
import { authApi, type CreatedUser, type CurrentUser, type ManagedUser } from './api/auth'
import { dishesApi, DishApiError, type Dish, type DishInput } from './api/dishes'
import './App.css'

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    authApi
      .currentUser()
      .then(setUser)
      .catch(() => undefined)
      .finally(() => setCheckingSession(false))
  }, [])

  return (
    <main className="app-shell">
      <section aria-labelledby="page-title" className="welcome-card">
        <p className="eyebrow">Private family space</p>
        <h1 id="page-title">Family Cooking Tracker</h1>
        {checkingSession ? (
          <p>Checking your session…</p>
        ) : user ? (
          user.mustChangePassword ? (
            <PasswordChange user={user} onChanged={setUser} setError={setError} />
          ) : (
            <Dashboard
              user={user}
              onLogout={() => {
                setUser(null)
                setError('')
              }}
              setError={setError}
            />
          )
        ) : (
          <Login onLoggedIn={setUser} setError={setError} />
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}

function Login({
  onLoggedIn,
  setError,
}: {
  onLoggedIn: (user: CurrentUser) => void
  setError: (message: string) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      onLoggedIn(await authApi.login(email, password))
    } catch (reason) {
      setError(messageFrom(reason))
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      <p className="intro">Sign in to your family’s private cooking space.</p>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <button disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
    </form>
  )
}

function PasswordChange({
  user,
  onChanged,
  setError,
}: {
  user: CurrentUser
  onChanged: (user: CurrentUser) => void
  setError: (message: string) => void
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      onChanged(await authApi.changePassword(currentPassword, newPassword))
    } catch (reason) {
      setError(messageFrom(reason))
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      <p className="intro">Welcome, {user.email}. Set a new password before continuing.</p>
      <label>
        Temporary password
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        New password <small>At least 12 characters</small>
        <input
          type="password"
          minLength={12}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </label>
      <button>Save new password</button>
    </form>
  )
}

function Dashboard({
  user,
  onLogout,
  setError,
}: {
  user: CurrentUser
  onLogout: () => void
  setError: (message: string) => void
}) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null)
  useEffect(() => {
    if (user.role === 'ADMIN')
      authApi
        .users()
        .then(setUsers)
        .catch((reason) => setError(messageFrom(reason)))
  }, [user.role, setError])
  const logout = async () => {
    setError('')
    try {
      await authApi.logout()
      onLogout()
    } catch (reason) {
      setError(messageFrom(reason))
    }
  }
  return (
    <div className="dashboard">
      <div className="account-row">
        <p className="intro">Signed in as {user.email}</p>
        <button className="secondary" onClick={logout}>
          Sign out
        </button>
      </div>
      <Journal />
      {user.role === 'ADMIN' && (
        <UserManagement
          users={users}
          setUsers={setUsers}
          createdUser={createdUser}
          setCreatedUser={setCreatedUser}
          setError={setError}
        />
      )}
    </div>
  )
}

type JournalView = { kind: 'list' } | { kind: 'detail'; dish: Dish } | { kind: 'form'; dish?: Dish }

function Journal() {
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
    setDishes((current) => [dish, ...current.filter((entry) => entry.id !== dish.id)])
    setView({ kind: 'detail', dish })
  }

  return (
    <section className="journal" aria-labelledby="journal-title">
      {view.kind === 'list' && (
        <>
          <div className="section-row">
            <h2 id="journal-title">Cooking journal</h2>
            <button onClick={() => setView({ kind: 'form' })}>Add dish</button>
          </div>
          {loading ? (
            <p>Loading dishes…</p>
          ) : error ? (
            <div className="journal-error" role="alert">
              <p>{error}</p>
              <button className="secondary" onClick={load}>
                Try again
              </button>
            </div>
          ) : dishes.length === 0 ? (
            <p>No dishes yet. Record your first family meal.</p>
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
        <DishDetail
          dish={view.dish}
          onBack={() => setView({ kind: 'list' })}
          onEdit={() => setView({ kind: 'form', dish: view.dish })}
        />
      )}
      {view.kind === 'form' && (
        <DishForm
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

function DishDetail({
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
        Back to dishes
      </button>
      <p className="eyebrow">Prepared {formatDate(dish.preparedOn)}</p>
      <h2>{dish.name}</h2>
      {dish.notes && <p className="notes">{dish.notes}</p>}
      {dish.canEdit && <button onClick={onEdit}>Edit dish</button>}
    </article>
  )
}

function DishForm({
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
  const [notes, setNotes] = useState(dish?.notes ?? '')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setFieldErrors({ name: 'Enter a dish name.' })
      return
    }
    setSaving(true)
    setError('')
    setFieldErrors({})
    const input: DishInput = { name: trimmedName, preparedOn, notes: notes.trim() || null }
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
      <h2>{dish ? 'Edit dish' : 'Record a dish'}</h2>
      <label>
        Dish name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-describedby={fieldErrors.name ? 'dish-name-error' : undefined}
        />
      </label>
      {fieldErrors.name && (
        <p className="field-error" id="dish-name-error">
          {fieldErrors.name}
        </p>
      )}
      <label>
        Preparation date
        <input
          type="date"
          value={preparedOn}
          onChange={(event) => setPreparedOn(event.target.value)}
          required
        />
      </label>
      {fieldErrors.preparedOn && <p className="field-error">{fieldErrors.preparedOn}</p>}
      <label>
        Preparation notes (optional)
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
        <button disabled={saving}>{saving ? 'Saving…' : 'Save dish'}</button>
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

function UserManagement({
  users,
  setUsers,
  createdUser,
  setCreatedUser,
  setError,
}: {
  users: ManagedUser[]
  setUsers: (users: ManagedUser[]) => void
  createdUser: CreatedUser | null
  setCreatedUser: (user: CreatedUser | null) => void
  setError: (message: string) => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setCreatedUser(null)
    try {
      const created = await authApi.createUser(email, role)
      setCreatedUser(created)
      setUsers([...users, created].sort((a, b) => a.email.localeCompare(b.email)))
      setEmail('')
    } catch (reason) {
      setError(messageFrom(reason))
    }
  }
  return (
    <section className="management">
      <h2>Family accounts</h2>
      <form className="form compact" onSubmit={submit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MEMBER')}>
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </label>
        <button>Create account</button>
      </form>
      {createdUser && (
        <aside className="temporary-password">
          <strong>Share this temporary password now:</strong>
          <code>{createdUser.temporaryPassword}</code>
          <span>It is not shown again.</span>
        </aside>
      )}
      <ul className="user-list">
        {users.map((member) => (
          <li key={member.id}>
            <span>{member.email}</span>
            <small>
              {member.role.toLowerCase()} · {member.status.toLowerCase()}
            </small>
          </li>
        ))}
      </ul>
    </section>
  )
}

function messageFrom(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Something went wrong. Please try again.'
}
