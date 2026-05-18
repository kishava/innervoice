import { getElevenLabsAgentId } from '../lib/elevenLabsConvai'
import { isSupabaseConfigured } from '../lib/supabase'
import { invokeGateway } from './backendGateway'

/** WebRTC live talk: server mints token for ElevenLabs LiveKit transport. */
export async function fetchConversationToken(voiceId: string): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }

  const trimmed = voiceId.trim()
  if (!trimmed) {
    throw new Error('Train or select a voice before starting live talk.')
  }

  const data = await invokeGateway<{ token: string }>('getConversationToken', {
    agentId: getElevenLabsAgentId(),
    voiceId: trimmed,
  })
  const token = data.token.trim()
  if (!token) {
    throw new Error('Could not start live voice session.')
  }
  return token
}

/** WebSocket live talk: server returns a private signed URL for ElevenLabs audio streaming. */
export async function fetchConversationSignedUrl(voiceId: string): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }

  const trimmed = voiceId.trim()
  if (!trimmed) {
    throw new Error('Train or select a voice before starting live talk.')
  }

  const data = await invokeGateway<{ signedUrl: string }>('getConversationSignedUrl', {
    agentId: getElevenLabsAgentId(),
    voiceId: trimmed,
  })
  const signedUrl = data.signedUrl.trim()
  if (!signedUrl) {
    throw new Error('Could not start live voice session.')
  }
  return signedUrl
}
