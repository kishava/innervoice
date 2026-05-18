import { useCallback, useEffect, useState } from 'react'
import { deleteRemoteVoice } from '../api/voices'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { isDefaultElevenLabsVoiceId, isDefaultVoiceEntry } from '../lib/defaultVoices'
import { MAX_VOICES_PER_USER, voiceLimitMessage } from '../lib/voicePolicy'
import type { UserVoice } from '../types'

interface VoiceRow {
  id: string
  elevenlabs_voice_id: string
  name: string
  created_at: string
}

function mapRow(row: VoiceRow): UserVoice {
  return {
    id: row.id,
    elevenlabsVoiceId: row.elevenlabs_voice_id,
    name: row.name,
    createdAt: Date.parse(row.created_at),
  }
}

function legacyVoice(activeVoiceId: string, name = 'My future self'): UserVoice {
  return {
    id: 'legacy',
    elevenlabsVoiceId: activeVoiceId,
    name,
    createdAt: Date.now(),
  }
}

function isMissingUserVoicesTable(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42P01' || /user_voices/i.test(error.message ?? '')
}

export function useUserVoices(userId: string | null, activeVoiceId: string | null) {
  const [voices, setVoices] = useState<UserVoice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const syncProfileVoice = useCallback(
    async (rows: UserVoice[], profileVoiceId: string | null): Promise<UserVoice[]> => {
      if (!userId || !supabase || !profileVoiceId) return rows
      if (isDefaultElevenLabsVoiceId(profileVoiceId)) return rows
      if (rows.some((v) => v.elevenlabsVoiceId === profileVoiceId)) return rows

      const { data, error: insertError } = await supabase
        .from('user_voices')
        .insert({
          user_id: userId,
          elevenlabs_voice_id: profileVoiceId,
          name: 'My future self',
        })
        .select('id,elevenlabs_voice_id,name,created_at')
        .single()

      if (insertError) {
        if (insertError.code === '23505') {
          const { data: existing } = await supabase
            .from('user_voices')
            .select('id,elevenlabs_voice_id,name,created_at')
            .eq('user_id', userId)
            .eq('elevenlabs_voice_id', profileVoiceId)
            .maybeSingle()
          if (existing) return [mapRow(existing as VoiceRow), ...rows]
        }
        return [legacyVoice(profileVoiceId), ...rows.filter((v) => v.elevenlabsVoiceId !== profileVoiceId)]
      }

      return [mapRow(data as VoiceRow), ...rows]
    },
    [userId],
  )

  const refreshVoices = useCallback(async () => {
    if (!userId || !isSupabaseConfigured || !supabase) {
      setVoices([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('user_voices')
        .select('id,elevenlabs_voice_id,name,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      let next = ((data as VoiceRow[] | null)?.map(mapRow) ?? []).filter(
        (voice) => !isDefaultElevenLabsVoiceId(voice.elevenlabsVoiceId),
      )
      next = await syncProfileVoice(next, activeVoiceId)
      setVoices(next)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load voices.'
      const tableMissing = isMissingUserVoicesTable(err as { code?: string; message?: string })

      if (tableMissing) {
        setError('Voice library is not set up on the server yet. Apply the latest Supabase migrations.')
      } else {
        setError(message)
      }

      if (activeVoiceId) {
        setVoices([legacyVoice(activeVoiceId)])
      } else {
        setVoices([])
      }
    } finally {
      setLoading(false)
    }
  }, [activeVoiceId, syncProfileVoice, userId])

  useEffect(() => {
    void refreshVoices()
  }, [refreshVoices])

  const saveVoiceRow = useCallback(
    async (elevenlabsVoiceId: string, trimmed: string, cleanupOrphanOnLimit = false) => {
      if (!userId || !supabase) throw new Error('Sign in to save voices.')

      const { data, error } = await supabase
        .from('user_voices')
        .insert({
          user_id: userId,
          elevenlabs_voice_id: elevenlabsVoiceId,
          name: trimmed,
        })
        .select('id,elevenlabs_voice_id,name,created_at')
        .single()

      if (error) {
        if (error.code === '23505') {
          const { data: updated, error: updateError } = await supabase
            .from('user_voices')
            .update({ name: trimmed })
            .eq('user_id', userId)
            .eq('elevenlabs_voice_id', elevenlabsVoiceId)
            .select('id,elevenlabs_voice_id,name,created_at')
            .single()
          if (updateError) throw updateError
          const mapped = mapRow(updated as VoiceRow)
          setVoices((prev) => {
            const rest = prev.filter((v) => v.elevenlabsVoiceId !== elevenlabsVoiceId)
            return [mapped, ...rest]
          })
          return mapped
        }
        if (
          cleanupOrphanOnLimit &&
          (error.message?.includes('Voice limit') || error.code === 'P0001')
        ) {
          try {
            await deleteRemoteVoice(elevenlabsVoiceId)
          } catch {
            /* orphan clone */
          }
        }
        throw error
      }

      const mapped = mapRow(data as VoiceRow)
      setVoices((prev) => [mapped, ...prev.filter((v) => v.elevenlabsVoiceId !== elevenlabsVoiceId)])
      return mapped
    },
    [userId],
  )

  const addVoice = useCallback(
    async (elevenlabsVoiceId: string, name: string) => {
      if (!userId || !supabase) throw new Error('Sign in to save voices.')

      const trimmed = name.trim()
      if (!trimmed) throw new Error('Voice name cannot be empty.')

      const { count, error: countError } = await supabase
        .from('user_voices')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)

      if (countError && !isMissingUserVoicesTable(countError)) throw countError

      const existing = voices.find((v) => v.elevenlabsVoiceId === elevenlabsVoiceId)
      if (!existing && (count ?? voices.length) >= MAX_VOICES_PER_USER) {
        try {
          await deleteRemoteVoice(elevenlabsVoiceId)
        } catch {
          /* limit reached before save */
        }
        throw new Error(voiceLimitMessage(MAX_VOICES_PER_USER))
      }

      return saveVoiceRow(elevenlabsVoiceId, trimmed, true)
    },
    [saveVoiceRow, userId, voices],
  )

  const renameVoice = useCallback(
    async (id: string, name: string) => {
      if (!userId || !supabase) throw new Error('Sign in to rename voices.')
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Voice name cannot be empty.')

      if (id === 'legacy' || isDefaultVoiceEntry(id)) {
        throw new Error('This voice cannot be renamed here.')
      }

      const { data, error } = await supabase
        .from('user_voices')
        .update({ name: trimmed })
        .eq('id', id)
        .eq('user_id', userId)
        .select('id,elevenlabs_voice_id,name,created_at')
        .single()

      if (error) throw error
      const mapped = mapRow(data as VoiceRow)
      setVoices((prev) => prev.map((v) => (v.id === id ? mapped : v)))
      return mapped
    },
    [userId],
  )

  const deleteVoice = useCallback(
    async (id: string) => {
      if (!userId || !supabase) throw new Error('Sign in to delete voices.')
      if (id === 'legacy') {
        throw new Error('This voice is not in your library yet. Refresh or contact support if this persists.')
      }

      const row = voices.find((v) => v.id === id)
      if (!row) throw new Error('Voice not found.')

      try {
        await deleteRemoteVoice(row.elevenlabsVoiceId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not delete voice from ElevenLabs.'
        throw new Error(msg)
      }

      const { error } = await supabase.from('user_voices').delete().eq('id', id).eq('user_id', userId)
      if (error) throw error
      setVoices((prev) => prev.filter((v) => v.id !== id))
    },
    [userId, voices],
  )

  const canAddVoice = voices.length < MAX_VOICES_PER_USER

  return {
    voices,
    loading,
    error,
    canAddVoice,
    maxVoices: MAX_VOICES_PER_USER,
    refreshVoices,
    addVoice,
    renameVoice,
    deleteVoice,
  }
}
