/**
 * Verify remote Supabase schema + ai-gateway after deploy.
 * Usage: node scripts/remote-setup.mjs
 * Reads keys from .env and .env.supabase.secrets (gitignored) or environment variables.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  const map = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    map[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return map
}

const env = {
  ...loadEnvFile(resolve(root, '.env')),
  ...loadEnvFile(resolve(root, '.env.supabase.secrets')),
  ...process.env,
}

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SB_SECRET
const PUBLISHABLE = env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SERVICE_KEY || !PUBLISHABLE) {
  console.error('Missing VITE_SUPABASE_URL, service role key, or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'User-Agent': 'innervoice-setup/1.0' } },
})

async function checkSchema() {
  const { error: uv } = await admin.from('user_voices').select('id').limit(1)
  const { error: la } = await admin.from('profiles').select('last_active_at').limit(1)
  console.log('user_voices:', uv ? `MISSING (${uv.message})` : 'OK')
  console.log('profiles.last_active_at:', la ? `MISSING (${la.message})` : 'OK')
  return !uv && !la
}

async function testGatewayWithUserSession() {
  const email = `setup-test-${Date.now()}@innervoice.local`
  const password = 'SetupTest123!'

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr) {
    console.log('createUser:', createErr.message)
    return
  }

  const pub = createClient(SUPABASE_URL, PUBLISHABLE, {
    global: { headers: { 'User-Agent': 'innervoice-setup/1.0' } },
  })
  const { data: signIn, error: signErr } = await pub.auth.signInWithPassword({ email, password })
  if (signErr) {
    console.log('signIn:', signErr.message)
    return
  }

  const token = signIn.session?.access_token
  if (!token) {
    console.log('No session token')
    return
  }

  const authed = createClient(SUPABASE_URL, PUBLISHABLE, {
    global: {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'innervoice-setup/1.0' },
    },
  })

  const { data, error } = await authed.functions.invoke('ai-gateway', {
    body: {
      action: 'chatCompletion',
      request: {
        model: 'gpt-4o-mini',
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Reply with OK only.' }],
      },
    },
  })

  if (error) {
    console.log('ai-gateway test FAILED:', error.message)
    return
  }

  if (data && typeof data === 'object' && 'ok' in data && data.ok === false) {
    console.log('ai-gateway test FAILED:', data.error)
    return
  }

  console.log('ai-gateway test OK (chatCompletion)')
  await admin.auth.admin.deleteUser(created.user.id)
}

async function main() {
  console.log('InnerVoice remote setup\n')
  const schemaOk = await checkSchema()
  if (!schemaOk) {
    console.log('\nRun: npx supabase db push --linked (after supabase login)')
  }

  console.log('\nTesting edge function...')
  await testGatewayWithUserSession()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
