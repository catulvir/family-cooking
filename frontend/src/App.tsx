import { FormikProvider, useFormik } from 'formik'
import { AppForm, FormField } from './forms'
import { loginSchema, passwordSchema, accountSchema } from './formSchemas'
import { useEffect, useState } from 'react'
import { authApi, type CreatedUser, type CurrentUser, type ManagedUser } from './api/auth'
import Journal from './Journal'
import { BookOpen, ChefHat, LogOut, Users } from 'lucide-react'
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
    <main className={`app-shell ${user && !user.mustChangePassword ? 'signed-in' : 'welcome'}`}>
      <section aria-labelledby="page-title" className="welcome-card">
        <ChefHat className="brand-icon" aria-hidden="true" />
        <p className="eyebrow">By Rozbergs · Private family space</p>
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
  const formik = useFormik({
    initialValues: { email: '', password: '' },
    validationSchema: loginSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values) => {
      setError('')
      try {
        onLoggedIn(await authApi.login(values.email.trim(), values.password))
      } catch (reason) {
        setError(messageFrom(reason))
      }
    },
  })
  return (
    <FormikProvider value={formik}>
      <AppForm>
        <p className="intro">Sign in to your family's private cooking space.</p>
        <FormField name="email" label="Email" type="email" autoComplete="email" />
        <FormField
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
        />
        <button disabled={formik.isSubmitting}>
          {formik.isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="access-note">Ask the family administrator for an account.</p>
      </AppForm>
    </FormikProvider>
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
  const formik = useFormik({
    initialValues: { currentPassword: '', newPassword: '' },
    validationSchema: passwordSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values) => {
      setError('')
      try {
        onChanged(await authApi.changePassword(values.currentPassword, values.newPassword))
      } catch (reason) {
        setError(messageFrom(reason))
      }
    },
  })
  return (
    <FormikProvider value={formik}>
      <AppForm>
        <p className="intro">Welcome, {user.email}. Set a new password before continuing.</p>
        <FormField
          name="currentPassword"
          label="Temporary password"
          type="password"
          autoComplete="current-password"
        />
        <FormField
          name="newPassword"
          label="New password (at least 12 characters)"
          type="password"
          autoComplete="new-password"
        />
        <button disabled={formik.isSubmitting}>
          {formik.isSubmitting ? 'Saving…' : 'Save new password'}
        </button>
      </AppForm>
    </FormikProvider>
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
  const [view, setView] = useState<'journal' | 'accounts'>('journal')
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
          <LogOut size={18} aria-hidden="true" />
          Sign out
        </button>
      </div>
      <nav className="primary-nav" aria-label="Main navigation">
        <button
          aria-current={view === 'journal' ? 'page' : undefined}
          onClick={() => setView('journal')}
        >
          <BookOpen size={20} aria-hidden="true" /> Journal
        </button>
        {user.role === 'ADMIN' && (
          <button
            aria-current={view === 'accounts' ? 'page' : undefined}
            onClick={() => setView('accounts')}
          >
            <Users size={20} aria-hidden="true" /> Family accounts
          </button>
        )}
      </nav>
      <div hidden={view !== 'journal'}>
        <Journal />
      </div>
      {user.role === 'ADMIN' && (
        <div hidden={view !== 'accounts'}>
          <UserManagement
            users={users}
            setUsers={setUsers}
            createdUser={createdUser}
            setCreatedUser={setCreatedUser}
            setError={setError}
          />
        </div>
      )}
    </div>
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
  const formik = useFormik({
    initialValues: { email: '', role: 'MEMBER' as 'MEMBER' | 'ADMIN' },
    validationSchema: accountSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values, helpers) => {
      setError('')
      setCreatedUser(null)
      try {
        const created = await authApi.createUser(values.email.trim(), values.role)
        setCreatedUser(created)
        setUsers([...users, created].sort((a, b) => a.email.localeCompare(b.email)))
        helpers.resetForm({ values: { email: '', role: values.role } })
      } catch (reason) {
        setError(messageFrom(reason))
      }
    },
  })
  return (
    <section className="management">
      <h2>Family accounts</h2>
      <FormikProvider value={formik}>
        <AppForm className="form compact">
          <FormField name="email" label="Email" type="email" />
          <FormField name="role" label="Role" as="select">
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Administrator</option>
          </FormField>
          <button disabled={formik.isSubmitting}>
            {formik.isSubmitting ? 'Creating…' : 'Create account'}
          </button>
        </AppForm>
      </FormikProvider>
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
