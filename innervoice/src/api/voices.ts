import { invokeGateway } from './backendGateway'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { VOICE_INACTIVE_MS } from '../lib/voicePolicy'

export interface ElevenLabsVoiceCatalogItem {
  voiceId: string
  name: string
  category: string
}

export async function listElevenLabsVoices(): Promise<ElevenLabsVoiceCatalogItem[]> {
  const data = await invokeGateway<{ voices: ElevenLabsVoiceCatalogItem[] }>('listVoices', {})
  return data.voices ?? []
}

export async function deleteRemoteVoice(elevenlabsVoiceId: string): Promise<void> {
  await invokeGateway('deleteVoice', { voiceId: elevenlabsVoiceId })
}

export async function purgeAllUserVoices(userId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return

  const { data: rows, error } = await supabase
    .from('user_voices')
    .select('elevenlabs_voice_id')
    .eq('user_id', userId)

  const { data: profile } = await supabase.from('profiles').select('voice_id').eq('id', userId).maybeSingle()

  const voiceIds = new Set<string>()
  if (!error) {
    for (const row of rows ?? []) {
      voiceIds.add(row.elevenlabs_voice_id as string)
    }
  }
  if (profile?.voice_id) voiceIds.add(profile.voice_id as string)

  for (const id of voiceIds) {
    try {
      await deleteRemoteVoice(id)
    } catch {
      /* best-effort */
    }
  }

  if (!error) {
    await supabase.from('user_voices').delete().eq('user_id', userId)
  }

  await supabase.from('profiles').update({ voice_id: null }).eq('id', userId)
}

/** Bump activity; if last session was >1 week ago, clear voices from ElevenLabs + DB. */
export async function runVoiceLifecycle(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('last_active_at, voice_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    if (error.code === '42703') return false
    throw error
  }

  const now = Date.now()
  const lastActive = profile?.last_active_at ? Date.parse(profile.last_active_at as string) : now
  let purged = false

  if (profile?.last_active_at && now - lastActive >= VOICE_INACTIVE_MS) {
    await purgeAllUserVoices(userId)
    purged = true
  }

  await supabase.from('profiles').update({ last_active_at: new Date(now).toISOString() }).eq('id', userId)
  return purged
}
