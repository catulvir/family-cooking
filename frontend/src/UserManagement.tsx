import { useEffect, useState, type Ref } from 'react'
import { FormikProvider, useFormik } from 'formik'
import { authApi, type CreatedUser, type ManagedUser } from './api/auth'
import { AppForm, FormField } from './forms'
import { accountSchema } from './formSchemas'
import { messageFrom } from './errors'

export default function UserManagement({
  headingRef,
  setError,
}: {
  headingRef: Ref<HTMLHeadingElement>
  setError: (message: string) => void
}) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    authApi
      .users()
      .then(setUsers)
      .catch((reason) => setError(messageFrom(reason)))
      .finally(() => setLoading(false))
  }, [setError])
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
