import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Palette, Trash2, User, X } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { processAvatarFile } from '../lib/avatarImage'
import { extractPaletteFromDataUrl } from '../lib/avatarPalette'
import { ProfileAvatar } from './ProfileAvatar'
import { ErrorPopup } from './ErrorPopup'

interface Props {
  open: boolean
  onClose: () => void
  voiceCount?: number
  onOpenVoices?: () => void
}

export function ProfilePanel({ open, onClose, voiceCount = 0, onOpenVoices }: Props) {
  const { user, updateProfile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [themeFromAvatar, setThemeFromAvatar] = useState(false)

  useEffect(() => {
    if (!open || !user) return
    setName(user.name)
    setBio(user.bio ?? '')
    setAvatarUrl(user.avatarUrl)
    setThemeFromAvatar(user.themeFromAvatar ?? false)
    setError(null)
    setSaved(false)
  }, [open, user])

  if (!user) return null

  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSaved(false)
    setSubmitting(true)
    try {
      let nextThemeFromAvatar = themeFromAvatar
      let avatarTheme = user.avatarTheme

      if (!avatarUrl) {
        nextThemeFromAvatar = false
        avatarTheme = null
      } else if (themeFromAvatar) {
        const photoChanged = avatarUrl !== user.avatarUrl
        if (photoChanged || !avatarTheme) {
          avatarTheme = await extractPaletteFromDataUrl(avatarUrl)
        }
      } else {
        avatarTheme = null
      }

      await updateProfile({
        name,
        bio,
        avatarUrl,
        themeFromAvatar: nextThemeFromAvatar,
        avatarTheme,
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.')
    } finally {
      setSubmitting(false)
    }
  }

  const onPhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setSaved(false)
    setUploadingPhoto(true)
    try {
      const dataUrl = await processAvatarFile(file)
      setAvatarUrl(dataUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load image.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const removePhoto = () => {
    setAvatarUrl(null)
    setThemeFromAvatar(false)
    setSaved(false)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-3 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={onClose}
        >
          <ErrorPopup message={error} onClose={() => setError(null)} />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
            className="glass-panel glow-accent max-h-[92dvh] w-full max-w-md overflow-hidden rounded-2xl border border-border p-4 shadow-2xl sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                aria-label="Close profile"
                onClick={onClose}
                className="rounded-full border border-border bg-elevated p-1.5 text-text-tertiary transition hover:border-accent/60 hover:text-text-primary"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-5 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <div className="relative">
                <ProfileAvatar name={name || user.name} avatarUrl={avatarUrl} size="lg" />
                <button
                  type="button"
                  aria-label="Change profile photo"
                  disabled={uploadingPhoto}
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-elevated text-text-secondary shadow-md transition hover:border-accent/60 hover:text-accent disabled:opacity-50"
                >
                  <Camera size={14} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={onPhotoSelected}
                />
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <h2 id="profile-title" className="text-lg font-semibold text-text-primary">
                  Your profile
                </h2>
                <p className="break-all text-xs text-text-secondary">{user.email}</p>
                <p className="mt-1 text-xs text-text-tertiary">
                  {uploadingPhoto ? 'Processing photo…' : 'Tap the camera to add a photo'}
                </p>
              </div>
            </div>

            {avatarUrl && (
              <button
                type="button"
                onClick={removePhoto}
                className="mb-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-elevated py-2 text-xs text-text-secondary transition hover:border-danger/50 hover:text-danger"
              >
                <Trash2 size={14} />
                Remove photo
              </button>
            )}

            <form onSubmit={submit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">Display name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="min-h-11 rounded-xl border border-border bg-input-bg px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent/60"
                />
              </label>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-elevated px-3 py-3 transition sm:px-4 ${
                  !avatarUrl ? 'cursor-not-allowed opacity-50' : 'hover:border-accent/40'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                  checked={themeFromAvatar}
                  disabled={!avatarUrl}
                  onChange={(e) => setThemeFromAvatar(e.target.checked)}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="inline-flex items-start gap-1.5 text-sm font-medium text-text-primary">
                    <Palette size={14} className="text-accent" />
                    Match UI colors to my photo
                  </span>
                  <span className="text-xs text-text-secondary">
                    {avatarUrl
                      ? 'Uses gentle tones from your profile picture instead of the default theme. Save to apply.'
                      : 'Add a profile photo first to enable this.'}
                  </span>
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">About you (optional)</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={280}
                  placeholder="A few words about what brings you here…"
                  className="resize-none rounded-xl border border-border bg-input-bg px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent/60"
                />
              </label>

              <div className="rounded-xl border border-border bg-elevated px-4 py-3 text-xs text-text-secondary">
                <p>
                  <span className="font-medium text-text-primary">Member since:</span> {memberSince}
                </p>
                <p className="mt-1">
                  <span className="font-medium text-text-primary">Voices:</span>{' '}
                  {voiceCount > 0
                    ? `${voiceCount} trained`
                    : user.voiceId
                      ? '1 trained'
                      : 'None yet'}
                </p>
                {onOpenVoices && (
                  <button
                    type="button"
                    onClick={onOpenVoices}
                    className="mt-2 text-xs font-medium text-accent transition hover:underline"
                  >
                    View &amp; manage voices
                  </button>
                )}
              </div>

              {saved && (
                <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs text-accent">
                  Profile saved.
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || uploadingPhoto}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-white shadow-[0_0_18px_var(--color-accent-soft)] transition hover:bg-accent-hover hover:scale-[1.02] disabled:opacity-50"
              >
                <User size={16} />
                {submitting ? 'Saving…' : 'Save profile'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
