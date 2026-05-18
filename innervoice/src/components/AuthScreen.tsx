import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { AudioLines, LogIn, UserPlus } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { ErrorPopup } from './ErrorPopup'

type Mode = 'login' | 'register'

export function AuthScreen() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [bio, setBio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'register') {
        await register({ name, email, password, bio: bio || undefined })
      } else {
        await login({ email, password })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mx-auto flex h-full min-h-0 w-full max-w-sm flex-col items-center justify-center gap-3 py-1 sm:gap-4 sm:py-0"
    >
      <ErrorPopup message={error} onClose={() => setError(null)} />
      <div className="glow-accent flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-hover text-white sm:h-16 sm:w-16">
        <AudioLines size={22} />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text-primary dark:bg-gradient-to-r dark:from-white dark:to-zinc-400 dark:bg-clip-text dark:text-transparent sm:text-3xl">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {mode === 'login'
            ? 'Log in to talk to your future self.'
            : 'Sign up to train your voice and begin.'}
        </p>
      </div>

      <form onSubmit={submit} className="flex w-full flex-col gap-3">
        {mode === 'register' && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
            className="min-h-11 rounded-xl border border-border bg-input-bg px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent/60"
          />
        )}
        {mode === 'register' && (
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="About you (optional)"
            rows={2}
            maxLength={280}
            className="min-h-20 resize-none rounded-xl border border-border bg-input-bg px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent/60"
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="min-h-11 rounded-xl border border-border bg-input-bg px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent/60"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 6 chars)"
          required
          minLength={6}
          className="min-h-11 rounded-xl border border-border bg-input-bg px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent/60"
        />

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-white shadow-[0_0_18px_var(--color-accent-soft)] transition hover:scale-[1.02] disabled:opacity-50"
        >
          {mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
          {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setError(null)
          setMode(mode === 'login' ? 'register' : 'login')
        }}
        className="text-xs text-text-secondary underline-offset-4 transition hover:text-text-primary hover:underline"
      >
        {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
      </button>
    </motion.div>
  )
}
