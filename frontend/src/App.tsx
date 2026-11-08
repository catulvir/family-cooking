import { FormikProvider, useFormik } from 'formik'
import { AppForm, FormField } from './forms'
import { loginSchema, passwordSchema, accountSchema } from './formSchemas'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  authApi,
  AuthApiError,
  type CreatedUser,
  type CurrentUser,
  type ManagedUser,
} from './api/auth'
import Journal from './Journal'
import { BookOpen, ChefHat, ChevronDown, LogOut, Users } from 'lucide-react'
import './App.css'

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [error, setError] = useState('')
  const [sessionError, setSessionError] = useState(false)

  useEffect(() => {
    if (!checkingSession) return
    let cancelled = false
    authApi
      .currentUser()
      .then((current) => {
        if (!cancelled) setUser(current)
      })
      .catch((reason) => {
        if (!cancelled && !(reason instanceof AuthApiError && reason.status === 401))
          setSessionError(true)
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false)
      })
    return () => {
      cancelled = true
    }
  }, [checkingSession])

  return (
    <main className={`app-shell ${user && !user.mustChangePassword ? 'signed-in' : 'welcome'}`}>
      <section aria-labelledby="page-title" className="welcome-card">
        <div className="brand-row">
          <ChefHat className="brand-icon" aria-hidden="true" />
          <BotanicalSprig />
        </div>
        <p className="eyebrow">By Rozbergs · Private family space</p>
        <h1 id="page-title">Family Cooking Tracker</h1>
        {checkingSession ? (
          <output>Checking your session…</output>
        ) : sessionError ? (
          <div>
            <p className="error" role="alert">
              Could not check your session. Please try again.
            </p>
            <button
              onClick={() => {
                setSessionError(false)
                setCheckingSession(true)
              }}
            >
              Try again
            </button>
          </div>
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

/** Original rosemary-inspired line drawing; decorative and theme-coloured. */
function BotanicalSprig() {
  return (
    <svg
      className="botanical"
      viewBox="0 0 112 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 57C38 51 61 33 99 8M33 48C39 35 42 23 42 10" />
      <path d="M24 52C14 50 10 44 9 38C19 38 26 43 24 52ZM39 44C28 43 23 37 23 31C34 32 40 37 39 44ZM55 34C43 34 38 28 38 22C49 23 55 27 55 34ZM71 23C60 25 53 20 51 14C62 13 69 17 71 23ZM86 15C77 15 71 10 70 5C79 5 86 9 86 15ZM31 49C32 57 39 60 46 59C44 52 39 47 31 49ZM49 38C52 47 60 48 67 45C62 39 56 35 49 38ZM66 27C70 35 78 36 85 32C79 27 73 24 66 27ZM83 16C88 23 96 22 102 18C96 14 90 12 83 16ZM39 31C31 28 28 21 29 16C38 19 41 24 39 31ZM42 20C49 18 52 12 51 7C44 9 41 14 42 20Z" />
    </svg>
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
  const [accountOpen, setAccountOpen] = useState(false)
  const accountButton = useRef<HTMLButtonElement>(null)
  const accountDisclosure = useRef<HTMLElement>(null)
  const accountHeading = useRef<HTMLHeadingElement>(null)
  const journalPanel = useRef<HTMLDivElement>(null)
  const [usersLoading, setUsersLoading] = useState(user.role === 'ADMIN')
  useLayoutEffect(() => {
    if (view === 'accounts') accountHeading.current?.focus()
  }, [view])
  useEffect(() => {
    if (user.role === 'ADMIN')
      authApi
        .users()
        .then(setUsers)
        .catch((reason) => setError(messageFrom(reason)))
        .finally(() => setUsersLoading(false))
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
  const handleAccountKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && accountOpen) {
      event.preventDefault()
      setAccountOpen(false)
      accountButton.current?.focus()
    }
  }
  const handleAccountBlur = (event: React.FocusEvent<HTMLButtonElement>) => {
    if (!accountDisclosure.current?.contains(event.relatedTarget)) setAccountOpen(false)
  }
  return (
    <div className="dashboard">
      <div className="account-row">
        <p className="intro">Signed in as {user.email}</p>
        <section
          ref={accountDisclosure}
          className="account-disclosure"
          aria-label="Account navigation"
        >
          <button
            ref={accountButton}
            id="account-button"
            className="secondary"
            aria-expanded={accountOpen}
            aria-controls="account-actions"
            onKeyDown={handleAccountKeyDown}
            onBlur={handleAccountBlur}
            onClick={() => setAccountOpen((open) => !open)}
          >
            Account <ChevronDown size={18} aria-hidden="true" />
          </button>
          <section id="account-actions" aria-labelledby="account-button" hidden={!accountOpen}>
            {user.role === 'ADMIN' && (
              <button
                className="secondary"
                onKeyDown={handleAccountKeyDown}
                onBlur={handleAccountBlur}
                aria-current={view === 'accounts' ? 'page' : undefined}
                onClick={() => {
                  setAccountOpen(false)
                  setView('accounts')
                  if (view === 'accounts') accountHeading.current?.focus()
                }}
              >
                <Users size={20} aria-hidden="true" /> Family accounts
              </button>
            )}
            <button
              className="secondary"
              onKeyDown={handleAccountKeyDown}
              onBlur={handleAccountBlur}
              onClick={logout}
            >
              <LogOut size={18} aria-hidden="true" /> Sign out
            </button>
          </section>
        </section>
      </div>
      <nav className="primary-nav" aria-label="Main navigation">
        <button
          aria-current={view === 'journal' ? 'page' : undefined}
          onClick={() => {
            setAccountOpen(false)
            setView('journal')
            if (view === 'journal') journalPanel.current?.querySelector('h2')?.focus()
          }}
        >
          <BookOpen size={20} aria-hidden="true" /> Journal
        </button>
      </nav>
      <div ref={journalPanel} hidden={view !== 'journal'}>
        <Journal active={view === 'journal'} />
      </div>
      {user.role === 'ADMIN' && (
        <div hidden={view !== 'accounts'}>
          <UserManagement
            headingRef={accountHeading}
            loading={usersLoading}
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
  headingRef,
  loading,
  users,
  setUsers,
  createdUser,
  setCreatedUser,
  setError,
}: {
  headingRef: React.Ref<HTMLHeadingElement>
  loading: boolean
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
    <section className="management" aria-labelledby="accounts-title">
      <h2 ref={headingRef} id="accounts-title" tabIndex={-1}>
        Family accounts
      </h2>
      <output>
        {loading
          ? 'Loading family accounts…'
          : createdUser
            ? 'Account created. Share the temporary password below.'
            : ''}
      </output>
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
