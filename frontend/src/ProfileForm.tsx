import { useEffect, useRef, useState } from 'react'
import { FormikProvider, useFormik } from 'formik'
import * as yup from 'yup'
import { UserRound } from 'lucide-react'
import { AppForm, FormError, FormField } from './forms'
import { profileApi, ProfileApiError, type ProfileData } from './api/profile'
import { messageFrom } from './errors'

const profileSchema = yup.object({
  displayName: yup.string().trim().max(80, 'Use at most 80 characters.').default(''),
})

export default function ProfileForm({
  initialProfile,
  active,
  onChanged,
}: {
  initialProfile: ProfileData
  active: boolean
  onChanged: (displayName: string | null) => void
}) {
  const [profile, setProfile] = useState(initialProfile)
  const [conflict, setConflict] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [discard, setDiscard] = useState<'reload' | 'reset' | null>(null)
  const mounted = useRef(true)
  const visible = useRef(active)
  const reloadLock = useRef(false)
  const keepButton = useRef<HTMLButtonElement>(null)
  const reloadButton = useRef<HTMLButtonElement>(null)
  const resetButton = useRef<HTMLButtonElement>(null)
  const focusAfterReload = useRef<'reload' | 'reset' | null>(null)
  const focusAfterDiscard = useRef<'reload' | 'reset' | null>(null)
  useEffect(() => {
    visible.current = active
  }, [active])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const formik = useFormik({
    initialValues: { displayName: initialProfile.displayName ?? '' },
    validationSchema: profileSchema,
    validateOnBlur: false,
    validateOnChange: false,
    onSubmit: async (values, helpers) => {
      if (reloadLock.current || discard || conflict) return
      setSaved(false)
      try {
        const next = await profileApi.save(values.displayName.trim() || null, profile.version)
        if (!mounted.current) return
        setProfile(next)
        helpers.resetForm({ values: { displayName: next.displayName ?? '' } })
        setSaved(true)
        onChanged(next.displayName)
      } catch (reason) {
        if (!mounted.current) return
        helpers.setStatus(messageFrom(reason))
        if (reason instanceof ProfileApiError) {
          helpers.setErrors(reason.fieldErrors)
          if (reason.status === 409) setConflict(true)
        }
      }
    },
  })
  const dirty = (formik.values.displayName.trim() || null) !== profile.displayName
  const busy = formik.isSubmitting || reloading
  const previousDiscard = useRef(discard)
  useEffect(() => {
    const changed = previousDiscard.current !== discard
    previousDiscard.current = discard
    if (changed && discard && active) keepButton.current?.focus()
    if (!discard && focusAfterDiscard.current) {
      const target = focusAfterDiscard.current
      focusAfterDiscard.current = null
      if (active) (target === 'reload' ? reloadButton : resetButton).current?.focus()
    }
  }, [discard, active])
  useEffect(() => {
    if (reloading || !focusAfterReload.current) return
    const target = focusAfterReload.current
    focusAfterReload.current = null
    if (visible.current) (target === 'reload' ? reloadButton : resetButton).current?.focus()
  }, [reloading])
  const keepEditing = () => {
    focusAfterDiscard.current = discard === 'reload' ? 'reload' : 'reset'
    setDiscard(null)
  }
  const handleDiscardKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      keepEditing()
    }
  }
  const reload = async () => {
    if (reloadLock.current || formik.isSubmitting) return
    reloadLock.current = true
    setReloading(true)
    setDiscard(null)
    setSaved(false)
    formik.setStatus(undefined)
    try {
      const next = await profileApi.get()
      if (!mounted.current) return
      setProfile(next)
      formik.resetForm({ values: { displayName: next.displayName ?? '' } })
      setConflict(false)
      onChanged(next.displayName)
      focusAfterReload.current = 'reset'
    } catch (reason) {
      if (mounted.current) {
        formik.setStatus(messageFrom(reason))
        focusAfterReload.current = 'reload'
      }
    } finally {
      reloadLock.current = false
      if (mounted.current) setReloading(false)
    }
  }
  const reset = () => {
    formik.resetForm({ values: { displayName: profile.displayName ?? '' } })
    if (discard) focusAfterDiscard.current = 'reset'
    setDiscard(null)
    setSaved(false)
  }
  const requestDiscard = (action: 'reload' | 'reset') => {
    if (busy || reloadLock.current || discard) return
    if (dirty) setDiscard(action)
    else if (action === 'reload') void reload()
    else reset()
  }
  return (
    <FormikProvider value={formik}>
      <AppForm disabled={reloading || !!discard || conflict}>
        <div className="profile-identity">
          <span className="profile-avatar" aria-hidden="true">
            <UserRound size={28} />
          </span>
          <p>{profile.displayName ?? 'Your profile'}</p>
        </div>
        <div className="form-field">
          <label htmlFor="profile-email">Email</label>
          <input
            id="profile-email"
            type="email"
            value={profile.email}
            readOnly
            aria-describedby="profile-email-help"
          />
          <p className="access-note" id="profile-email-help">
            Your email is used to sign in.
          </p>
        </div>
        <fieldset className="recipe-fields" disabled={busy || !!discard}>
          <legend>Personal details</legend>
          <FormField name="displayName" label="Display name (optional)" autoComplete="nickname" />
          <p className="access-note">
            Use up to 80 characters. Leave blank to clear your display name.
          </p>
        </fieldset>
        <FormError />
        {conflict && (
          <section aria-label="Profile changed">
            <p>
              Your profile changed elsewhere. Your draft is still here. Reload the latest profile to
              continue from the saved version.
            </p>
            <button
              ref={reloadButton}
              type="button"
              className="secondary"
              disabled={busy || !!discard}
              onClick={() => requestDiscard('reload')}
            >
              Reload latest profile
            </button>
          </section>
        )}
        {reloading && <output>Loading latest profile…</output>}
        {saved && !formik.dirty && <output>Profile saved.</output>}
        <div className="form-actions">
          <button disabled={busy || !!discard || conflict}>
            {formik.isSubmitting ? 'Saving…' : 'Save profile'}
          </button>
          <button
            ref={resetButton}
            type="button"
            className="secondary"
            disabled={busy || !!discard}
            onClick={() => requestDiscard('reset')}
          >
            Reset changes
          </button>
        </div>
        {discard && (
          <section aria-label="Unsaved profile changes">
            <output>
              {discard === 'reload'
                ? 'Discard your unsaved changes and load the latest saved profile?'
                : 'Discard your unsaved profile changes?'}
            </output>
            <div className="form-actions">
              <button
                ref={keepButton}
                type="button"
                onClick={keepEditing}
                onKeyDown={handleDiscardKeyDown}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onKeyDown={handleDiscardKeyDown}
                onClick={() => (discard === 'reload' ? void reload() : reset())}
              >
                {discard === 'reload' ? 'Discard and reload' : 'Discard changes'}
              </button>
            </div>
          </section>
        )}
      </AppForm>
    </FormikProvider>
  )
}
