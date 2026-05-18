import { FunctionsHttpError } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

interface GatewaySuccess<T> {
  ok: true
  data: T
}

interface GatewayFailure {
  ok: false
  error: string
}

type GatewayResponse<T> = GatewaySuccess<T> | GatewayFailure

async function gatewayErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    try {
      const response = error.context.clone()
      const contentType = response.headers.get('Content-Type') ?? ''
      if (contentType.includes('application/json')) {
        const body = (await response.json()) as GatewayResponse<unknown> | { error?: string; message?: string }
        if (body && typeof body === 'object') {
          if ('ok' in body && body.ok === false && body.error) return body.error
          if ('error' in body && typeof body.error === 'string') return body.error
          if ('message' in body && typeof body.message === 'string') return body.message
        }
      } else {
        const text = (await response.text()).trim()
        if (text) return text.slice(0, 400)
      }
    } catch {
      /* use fallback below */
    }
  }
  if (error instanceof Error && error.message) {
    if (/invalid jwt/i.test(error.message)) {
      return 'Session expired or invalid. Log out, sign in again, then retry Talk.'
    }
    return error.message
  }
  return 'Unable to reach backend gateway.'
}

/** Attach a fresh user JWT when available; omit if missing (ai-gateway allows anon when verify_jwt is off). */
async function optionalAuthHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {}

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData.session?.access_token) return {}

  let accessToken = sessionData.session.access_token
  const expiresAt = sessionData.session.expires_at
  const expiresSoon =
    typeof expiresAt === 'number' && expiresAt * 1000 < Date.now() + 60_000

  if (expiresSoon) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
    if (!refreshError && refreshed.session?.access_token) {
      accessToken = refreshed.session.access_token
    }
  }

  if (!accessToken) return {}
  return { Authorization: `Bearer ${accessToken}` }
}

export async function invokeGateway<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env')
  }

  const { data, error } = await supabase.functions.invoke<GatewayResponse<T>>('ai-gateway', {
    body: { action, ...payload },
    headers: await optionalAuthHeaders(),
  })

  if (error) {
    throw new Error(await gatewayErrorMessage(error))
  }
  if (!data) {
    throw new Error('Backend gateway returned an empty response.')
  }
  if (!data.ok) {
    throw new Error(data.error || 'Backend gateway failed.')
  }
  return data.data
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}
