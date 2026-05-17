import { isSupabaseConfigured } from '../lib/supabase'
import { invokeGateway } from './backendGateway'

export async function fetchConversationToken(voiceId: string): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }

  const trimmed = voiceId.trim()
  if (!trimmed) {
    throw new Error('Train or select a voice before starting live talk.')
  }

  const data = await invokeGateway<{ token: string }>('getConversationToken', { voiceId: trimmed })
  if (!data.token) {
    throw new Error('Could not start live voice session.')
  }
  return data.token
}
