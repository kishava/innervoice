import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
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

export function useUserVoices(userId: string | null, activeVoiceId: string | null) {
  const [voices, setVoices] = useState<UserVoice[]>([])
  const [loading, setLoading] = useState(false)

  const refreshVoices = useCallback(async () => {
    if (!userId || !isSupabaseConfigured || !supabase) {
      setVoices([])
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('user_voices')
        .select('id,elevenlabs_voice_id,name,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setVoices((data as VoiceRow[] | null)?.map(mapRow) ?? [])
    } catch {
      if (activeVoiceId) {
        setVoices([
          {
            id: 'legacy',
            elevenlabsVoiceId: activeVoiceId,
            name: 'My future self',
            createdAt: Date.now(),
          },
        ])
      } else {
        setVoices([])
      }
    } finally {
      setLoading(false)
    }
  }, [activeVoiceId, userId])

  useEffect(() => {
    void refreshVoices()
  }, [refreshVoices])

  const addVoice = useCallback(
    async (elevenlabsVoiceId: string, name: string) => {
      if (!userId || !supabase) throw new Error('Sign in to save voices.')
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Voice name cannot be empty.')

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
        throw error
      }

      const mapped = mapRow(data as VoiceRow)
      setVoices((prev) => [mapped, ...prev.filter((v) => v.elevenlabsVoiceId !== elevenlabsVoiceId)])
      return mapped
    },
    [userId],
  )

  const renameVoice = useCallback(
    async (id: string, name: string) => {
      if (!userId || !supabase) throw new Error('Sign in to rename voices.')
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Voice name cannot be empty.')

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
      const { error } = await supabase.from('user_voices').delete().eq('id', id).eq('user_id', userId)
      if (error) throw error
      setVoices((prev) => prev.filter((v) => v.id !== id))
    },
    [userId],
  )

  return {
    voices,
    loading,
    refreshVoices,
    addVoice,
    renameVoice,
    deleteVoice,
  }
}
