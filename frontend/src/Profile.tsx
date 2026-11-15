import { useEffect, useState } from 'react'
import ProfileForm from './ProfileForm'
import { profileApi, type ProfileData } from './api/profile'
import { messageFrom } from './errors'

export default function Profile({
  active,
  onChanged,
}: {
  active: boolean
  onChanged: (displayName: string | null) => void
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!loading) return
    let cancelled = false
    profileApi
      .get()
      .then((value) => {
        if (!cancelled) {
          setProfile(value)
          onChanged(value.displayName)
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(messageFrom(reason))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loading, onChanged])
  return (
    <section aria-labelledby="profile-title">
      <h2 id="profile-title">Profile</h2>
      {profile ? (
        <ProfileForm initialProfile={profile} active={active} onChanged={onChanged} />
      ) : error ? (
        <>
          <p className="error" role="alert">
            {error}
          </p>
          <button
            className="secondary"
            onClick={() => {
              setError('')
              setLoading(true)
            }}
          >
            Retry profile
          </button>
        </>
      ) : (
        <output>Loading profile…</output>
      )}
    </section>
  )
}
