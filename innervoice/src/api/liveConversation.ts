import { INNERVOICE_AGENT_ID } from '../lib/elevenLabsConvai'
import { isSupabaseConfigured } from '../lib/supabase'
import { invokeGateway } from './backendGateway'

/** WebRTC live talk: server mints token and binds cloned voice to InnerVoice agent. */
export async function fetchConversationToken(voiceId: string): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }

  const trimmed = voiceId.trim()
  if (!trimmed) {
    throw new Error('Train or select a voice before starting live talk.')
  }

  const data = await invokeGateway<{ token: string }>('getConversationToken', {
    agentId: INNERVOICE_AGENT_ID,
    voiceId: trimmed,
  })
  const token = data.token.trim()
  if (!token) {
    throw new Error('Could not start live voice session.')
  }
  if (token.split('.').length !== 3) {
    throw new Error('Server returned an invalid conversation token. Try again or log out and sign in.')
  }
  return token
}
