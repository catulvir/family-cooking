import {type FormEvent, useEffect, useState} from 'react'
import {authApi, type CreatedUser, type CurrentUser, type ManagedUser} from './api/auth'
import './App.css'

export default function App() {
    const [user, setUser] = useState<CurrentUser | null>(null)
    const [checkingSession, setCheckingSession] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        authApi.currentUser().then(setUser).catch(() => undefined).finally(() => setCheckingSession(false))
    }, [])

    return <main className="app-shell">
        <section aria-labelledby="page-title" className="welcome-card">
            <p className="eyebrow">Private family space</p><h1 id="page-title">Family Cooking Tracker</h1>
            {checkingSession ? <p>Checking your session…</p> : user ? (
                user.mustChangePassword ? <PasswordChange user={user} onChanged={setUser} setError={setError}/> :
                    <Dashboard user={user} onLogout={() => {
                        setUser(null);
                        setError('')
                    }} setError={setError}/>
            ) : <Login onLoggedIn={setUser} setError={setError}/>}
            {error && <p className="error" role="alert">{error}</p>}
        </section>
    </main>
}

function Login({onLoggedIn, setError}: {
    onLoggedIn: (user: CurrentUser) => void,
    setError: (message: string) => void
}) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false)
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSubmitting(true);
        setError('');
        try {
            onLoggedIn(await authApi.login(email, password))
        } catch (reason) {
            setError(messageFrom(reason))
        } finally {
            setSubmitting(false)
        }
    }
    return (
        <form className="form" onSubmit={submit}><p className="intro">Sign in to your family’s private cooking
            space.</p>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                               required/></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                  autoComplete="current-password" required/></label>
            <button disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
        </form>
    )
}

function PasswordChange({user, onChanged, setError}: {
    user: CurrentUser,
    onChanged: (user: CurrentUser) => void,
    setError: (message: string) => void
}) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('')
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setError('');
        try {
            onChanged(await authApi.changePassword(currentPassword, newPassword))
        } catch (reason) {
            setError(messageFrom(reason))
        }
    }
    return <form className="form" onSubmit={submit}><p className="intro">Welcome, {user.email}. Set a new password
            before continuing.</p>
            <label>Temporary password<input type="password" value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            autoComplete="current-password" required/></label>
            <label>New password <small>At least 12 characters</small><input type="password" minLength={12}
                                                                            value={newPassword}
                                                                            onChange={(e) => setNewPassword(e.target.value)}
                                                                            autoComplete="new-password" required/></label>
            <button>Save new password</button>
        </form>
}

function Dashboard({user, onLogout, setError}: {
    user: CurrentUser,
    onLogout: () => void,
    setError: (message: string) => void
}) {
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null)
    useEffect(() => {
        if (user.role === 'ADMIN') authApi.users().then(setUsers).catch((reason) => setError(messageFrom(reason)))
    }, [user.role, setError])
    const logout = async () => {
        try {
            await authApi.logout()
        } finally {
            onLogout()
        }
    }
    return <div className="dashboard">
        <div className="account-row"><p className="intro">Signed in as {user.email}</p>
            <button className="secondary" onClick={logout}>Sign out</button>
        </div>
        {user.role === 'ADMIN' ?
            <UserManagement users={users} setUsers={setUsers} createdUser={createdUser} setCreatedUser={setCreatedUser}
                            setError={setError}/> : <p>Your cooking journal will appear here in the next milestone.</p>}
    </div>
}

function UserManagement({users, setUsers, createdUser, setCreatedUser, setError}: {
    users: ManagedUser[],
    setUsers: (users: ManagedUser[]) => void,
    createdUser: CreatedUser | null,
    setCreatedUser: (user: CreatedUser | null) => void,
    setError: (message: string) => void
}) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER')
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setError('');
        setCreatedUser(null);
        try {
            const created = await authApi.createUser(email, role);
            setCreatedUser(created);
            setUsers([...users, created].sort((a, b) => a.email.localeCompare(b.email)));
            setEmail('')
        } catch (reason) {
            setError(messageFrom(reason))
        }
    }
    return <section className="management"><h2>Family accounts</h2>
        <form className="form compact" onSubmit={submit}>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                               required/></label><label>Role<select value={role}
                                                                    onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MEMBER')}>
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Administrator</option>
        </select></label>
            <button>Create account</button>
        </form>
        {createdUser && <aside className="temporary-password"><strong>Share this temporary password
            now:</strong><code>{createdUser.temporaryPassword}</code><span>It is not shown again.</span></aside>}
        <ul className="user-list">{users.map((member) => <li key={member.id}>
            <span>{member.email}</span><small>{member.role.toLowerCase()} · {member.status.toLowerCase()}</small>
        </li>)}</ul>
    </section>
}

function messageFrom(reason: unknown) {
    return reason instanceof Error ? reason.message : 'Something went wrong. Please try again.'
}
