import { handleGatewayRequest, requireAuthenticatedUser } from './index.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function base64Url(value: string) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function unsignedJwt(payload: Record<string, unknown>) {
  return [
    base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
    base64Url(JSON.stringify(payload)),
    'signature',
  ].join('.')
}

Deno.test('requireAuthenticatedUser accepts authenticated user tokens', () => {
  const token = unsignedJwt({
    role: 'authenticated',
    sub: '11111111-1111-4111-8111-111111111111',
  })

  const auth = requireAuthenticatedUser(
    new Request('http://localhost', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )

  assert(auth.userId === '11111111-1111-4111-8111-111111111111', 'expected user id from token subject')
  assert(auth.accessToken === token, 'expected access token to be preserved')
})

Deno.test('requireAuthenticatedUser rejects anon tokens', () => {
  const token = unsignedJwt({
    role: 'anon',
    sub: '11111111-1111-4111-8111-111111111111',
  })

  let rejected = false
  try {
    requireAuthenticatedUser(
      new Request('http://localhost', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
  } catch (error) {
    rejected = error instanceof Error && /sign in/i.test(error.message)
  }

  assert(rejected, 'expected anon JWT to be rejected')
})

Deno.test('gateway returns 401 without a signed-in user JWT', async () => {
  const response = await handleGatewayRequest(
    new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ action: 'chatCompletion' }),
    }),
  )

  assert(response.status === 401, `expected 401, got ${response.status}`)
  const body = (await response.json()) as { ok?: boolean; error?: string }
  assert(body.ok === false, 'expected error response')
  assert(/sign in/i.test(body.error ?? ''), 'expected sign-in error message')
})
