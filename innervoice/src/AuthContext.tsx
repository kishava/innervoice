import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { AvatarThemePalette } from './lib/avatarPalette'
import { runVoiceLifecycle } from './api/voices'
import { isSupabaseConfigured, supabase } from './lib/supabase'

export interface PublicUser {
  email: string
  name: string
  voiceId: string | null
  bio: string
  avatarUrl: string | null
  themeFromAvatar: boolean
  avatarTheme: AvatarThemePalette | null
  createdAt: number
}

export type PostAuthStep = 'recording' | 'chat'

interface AuthContextValue {
  user: PublicUser | null
  userId: string | null
  isAuthenticated: boolean
  /** Set after register/login; App reads once to pick recording vs chat. */
  postAuthStep: PostAuthStep | null
  clearPostAuthStep: () => void
  register: (input: { name: string; email: string; password: string; bio?: string }) => Promise<void>
  login: (input: { email: string; password: string }) => Promise<void>
  logout: () => void
  setUserVoiceId: (voiceId: string | null) => void
  updateProfile: (input: {
    name: string
    bio?: string
    avatarUrl?: string | null
    themeFromAvatar?: boolean
    avatarTheme?: AvatarThemePalette | null
  }) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SESSION_KEY = 'innervoice-session'

function readSession(): PublicUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PublicUser
    return {
      ...parsed,
      bio: parsed.bio ?? '',
      avatarUrl: parsed.avatarUrl ?? null,
      themeFromAvatar: parsed.themeFromAvatar ?? false,
      avatarTheme: parsed.avatarTheme ?? null,
      createdAt: parsed.createdAt ?? Date.now(),
    }
  } catch {
    return null
  }
}

function writeSession(user: PublicUser | null) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}

interface ProfileRow {
  email: string | null
  name: string | null
  bio: string | null
  avatar_url: string | null
  theme_from_avatar: boolean | null
  avatar_theme: AvatarThemePalette | null
  voice_id: string | null
  created_at: string | null
}

function mapProfileToPublic(profile: ProfileRow, fallbackEmail = ''): PublicUser {
  return {
    email: profile.email ?? fallbackEmail,
    name: profile.name ?? 'InnerVoice User',
    bio: profile.bio ?? '',
    avatarUrl: profile.avatar_url ?? null,
    themeFromAvatar: profile.theme_from_avatar ?? false,
    avatarTheme: profile.avatar_theme ?? null,
    voiceId: profile.voice_id ?? null,
    createdAt: profile.created_at ? Date.parse(profile.created_at) : Date.now(),
  }
}

async function getOrCreateProfile(
  userId: string,
  email: string,
  defaults?: { name?: string; bio?: string; voiceId?: string | null },
) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('email,name,bio,avatar_url,theme_from_avatar,avatar_theme,voice_id,created_at')
    .eq('id', userId)
    .maybeSingle()

  if (fetchError) throw fetchError

  if (!existing) {
    const payload = {
      id: userId,
      email,
      name: defaults?.name?.trim() || 'InnerVoice User',
      bio: defaults?.bio?.trim() || '',
      avatar_url: null as string | null,
      theme_from_avatar: false,
      avatar_theme: null as AvatarThemePalette | null,
      voice_id: defaults?.voiceId ?? null,
      created_at: new Date().toISOString(),
    }
    const { error: insertError } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' })
    if (insertError) throw insertError
    return mapProfileToPublic(payload, email)
  }

  const existingProfile = existing as ProfileRow
  if (!existingProfile.voice_id && defaults?.voiceId) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ voice_id: defaults.voiceId })
      .eq('id', userId)
    if (!updateError) {
      return mapProfileToPublic({ ...existingProfile, voice_id: defaults.voiceId }, email)
    }
  }

  return mapProfileToPublic(existingProfile, email)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(() => readSession())
  const [userId, setUserId] = useState<string | null>(null)
  const [postAuthStep, setPostAuthStep] = useState<PostAuthStep | null>(null)

  const clearPostAuthStep = useCallback(() => {
    setPostAuthStep(null)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return

    let cancelled = false

    const syncUser = async (authUser: User | null) => {
      if (!authUser) {
        writeSession(null)
        if (!cancelled) {
          setUser(null)
          setUserId(null)
        }
        return
      }

      if (!cancelled) setUserId(authUser.id)

      try {
        const purged = await runVoiceLifecycle(authUser.id)
        const sessionSnapshot = readSession()
        const profile = await getOrCreateProfile(authUser.id, authUser.email ?? '', {
          name: sessionSnapshot?.name,
          bio: sessionSnapshot?.bio,
          voiceId: purged ? null : (sessionSnapshot?.voiceId ?? null),
        })
        writeSession(profile)
        if (!cancelled) setUser(profile)
      } catch {
        const fallback = readSession()
        if (!cancelled) setUser(fallback)
      }
    }

    void supabase.auth.getUser().then(({ data }) => syncUser(data.user ?? null))
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncUser(session?.user ?? null)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  const register = useCallback(
    async ({ name, email, password, bio }: { name: string; email: string; password: string; bio?: string }) => {
      const normalizedEmail = email.trim().toLowerCase()
      if (!normalizedEmail || !password || !name.trim()) {
        throw new Error('Please fill in your name, email and password.')
      }
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters.')
      }
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env')
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            name: name.trim(),
            bio: bio?.trim() ?? '',
          },
        },
      })

      if (error) throw error
      const authUser = data.user
      if (!authUser) throw new Error('Registration failed. Please try again.')

      const profile = await getOrCreateProfile(authUser.id, normalizedEmail, {
        name: name.trim(),
        bio: bio?.trim() ?? '',
      })

      writeSession(profile)
      setUserId(authUser.id)
      setPostAuthStep('recording')
      setUser(profile)
    },
    [],
  )

  const login = useCallback(async ({ email, password }: { email: string; password: string }) => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env')
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (error) throw error
    const authUser = data.user
    if (!authUser) throw new Error('Invalid email or password.')

    const profile = await getOrCreateProfile(authUser.id, normalizedEmail)
    writeSession(profile)
    setUserId(authUser.id)
    setPostAuthStep('chat')
    setUser(profile)
  }, [])

  const logout = useCallback(() => {
    if (supabase) {
      void supabase.auth.signOut()
    }
    writeSession(null)
    setUser(null)
    setUserId(null)
    setPostAuthStep(null)
  }, [])

  const setUserVoiceId = useCallback((voiceId: string | null) => {
    setUser((current) => {
      if (!current) return current
      const client = supabase
      if (client) {
        void client.auth.getUser().then(({ data }) => {
          if (!data.user) return
          void client.from('profiles').update({ voice_id: voiceId }).eq('id', data.user.id)
        })
      }
      const next: PublicUser = { ...current, voiceId }
      writeSession(next)
      return next
    })
  }, [])

  const updateProfile = useCallback(
    async ({
      name,
      bio,
      avatarUrl,
      themeFromAvatar,
      avatarTheme,
    }: {
      name: string
      bio?: string
      avatarUrl?: string | null
      themeFromAvatar?: boolean
      avatarTheme?: AvatarThemePalette | null
    }) => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        throw new Error('Name cannot be empty.')
      }
      const current = readSession() ?? user
      if (!current) return

      if (!supabase) throw new Error('Supabase is not configured.')
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return

      const nextAvatarUrl = avatarUrl !== undefined ? avatarUrl : current.avatarUrl
      const nextThemeFromAvatar =
        nextAvatarUrl && themeFromAvatar !== undefined ? themeFromAvatar : nextAvatarUrl ? current.themeFromAvatar : false
      const nextAvatarTheme = nextAvatarUrl ? (avatarTheme !== undefined ? avatarTheme : current.avatarTheme) : null

      const { error } = await supabase
        .from('profiles')
        .update({
          name: trimmedName,
          bio: bio !== undefined ? bio.trim() : current.bio,
          avatar_url: nextAvatarUrl,
          theme_from_avatar: nextThemeFromAvatar,
          avatar_theme: nextAvatarTheme,
        })
        .eq('id', authData.user.id)

      if (error) throw error

      const next: PublicUser = {
        ...current,
        name: trimmedName,
        bio: bio !== undefined ? bio.trim() : current.bio,
        avatarUrl: nextAvatarUrl ?? null,
        themeFromAvatar: nextThemeFromAvatar ?? false,
        avatarTheme: nextAvatarTheme ?? null,
      }
      writeSession(next)
      setUser(next)
    },
    [user],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      userId,
      isAuthenticated: Boolean(user && userId),
      postAuthStep,
      clearPostAuthStep,
      register,
      login,
      logout,
      setUserVoiceId,
      updateProfile,
    }),
    [clearPostAuthStep, login, logout, postAuthStep, register, setUserVoiceId, updateProfile, user, userId],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
