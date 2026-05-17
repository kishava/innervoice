import { isSupabaseConfigured } from '../lib/supabase'
import { invokeGateway } from './backendGateway'

export async function fetchConversationToken(): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }

  const data = await invokeGateway<{ token: string }>('getConversationToken', {})
  if (!data.token) {
    throw new Error('Could not start live voice session.')
  }
  return data.token
}
