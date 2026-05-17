const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type GatewayResult<T> = { ok: true; data: T } | { ok: false; error: string }

type ChatRequest = {
  model: string
  temperature?: number
  max_tokens?: number
  presence_penalty?: number
  frequency_penalty?: number
  messages: Array<{ role: string; content: string }>
}

function json<T>(status: number, body: GatewayResult<T>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  })
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function readErrorText(response: Response) {
  try {
    const text = await response.text()
    return text.slice(0, 400)
  } catch {
    return response.statusText
  }
}

async function chatCompletion(request: ChatRequest) {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) throw new Error('OPENAI_API_KEY is missing in Supabase secrets.')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${await readErrorText(response)}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content?.trim?.() ?? ''
  return { content }
}

async function cloneVoice(payload: { name: string; audioBase64: string; mimeType: string }) {
  const key = Deno.env.get('ELEVENLABS_API_KEY')
  if (!key) throw new Error('ELEVENLABS_API_KEY is missing in Supabase secrets.')

  const bytes = decodeBase64(payload.audioBase64)
  const formData = new FormData()
  formData.append('name', payload.name)
  formData.append('files', new Blob([bytes], { type: payload.mimeType || 'audio/webm' }), 'voice-sample.webm')

  const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: {
      'xi-api-key': key,
    },
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Voice clone failed (${response.status}): ${await readErrorText(response)}`)
  }

  const data = await response.json()
  if (!data?.voice_id) throw new Error('ElevenLabs response did not include voice_id.')
  return { voiceId: data.voice_id as string }
}

async function deleteVoice(payload: { voiceId: string }) {
  const key = Deno.env.get('ELEVENLABS_API_KEY')
  if (!key) throw new Error('ELEVENLABS_API_KEY is missing in Supabase secrets.')

  const voiceId = String(payload.voiceId ?? '').trim()
  if (!voiceId) throw new Error('voiceId is required.')

  const response = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
    method: 'DELETE',
    headers: { 'xi-api-key': key },
  })

  if (!response.ok && response.status !== 404) {
    throw new Error(`Voice delete failed (${response.status}): ${await readErrorText(response)}`)
  }

  return { deleted: true }
}

async function listVoices() {
  const key = Deno.env.get('ELEVENLABS_API_KEY')
  if (!key) throw new Error('ELEVENLABS_API_KEY is missing in Supabase secrets.')

  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': key },
  })

  if (!response.ok) {
    throw new Error(`List voices failed (${response.status}): ${await readErrorText(response)}`)
  }

  const data = await response.json()
  const raw = Array.isArray(data?.voices) ? data.voices : []
  const voices = raw
    .map((voice: { voice_id?: string; name?: string; category?: string }) => {
      const voiceId = String(voice?.voice_id ?? '').trim()
      const name = String(voice?.name ?? '').trim()
      if (!voiceId || !name) return null
      return {
        voiceId,
        name,
        category: String(voice?.category ?? 'unknown').trim() || 'unknown',
      }
    })
    .filter((v): v is { voiceId: string; name: string; category: string } => v !== null)

  return { voices }
}

// Map our emotion taxonomy to ElevenLabs v2 voice_settings.
// v2 doesn't support audio tags, so we make the voice emote via stability/style.
// Lower stability + higher style = more emotional/expressive delivery.
function v2SettingsForEmotion(emotion: string) {
  switch (emotion) {
    case 'fearful':
      return { stability: 0.22, similarity_boost: 0.82, style: 0.78, use_speaker_boost: true }
    case 'stressed':
      return { stability: 0.26, similarity_boost: 0.82, style: 0.72, use_speaker_boost: true }
    case 'grieving':
      return { stability: 0.22, similarity_boost: 0.85, style: 0.82, use_speaker_boost: true }
    case 'hurt':
      return { stability: 0.24, similarity_boost: 0.85, style: 0.78, use_speaker_boost: true }
    case 'sad':
      return { stability: 0.26, similarity_boost: 0.85, style: 0.76, use_speaker_boost: true }
    case 'anxious':
      return { stability: 0.28, similarity_boost: 0.82, style: 0.7, use_speaker_boost: true }
    case 'angry':
      return { stability: 0.3, similarity_boost: 0.8, style: 0.85, use_speaker_boost: true }
    case 'confused':
      return { stability: 0.34, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true }
    case 'ashamed':
      return { stability: 0.28, similarity_boost: 0.85, style: 0.7, use_speaker_boost: true }
    case 'guilty':
      return { stability: 0.3, similarity_boost: 0.85, style: 0.7, use_speaker_boost: true }
    case 'lonely':
      return { stability: 0.26, similarity_boost: 0.85, style: 0.75, use_speaker_boost: true }
    case 'tired':
      return { stability: 0.4, similarity_boost: 0.82, style: 0.5, use_speaker_boost: true }
    case 'excited':
      return { stability: 0.3, similarity_boost: 0.78, style: 0.85, use_speaker_boost: true }
    case 'hopeful':
      return { stability: 0.36, similarity_boost: 0.8, style: 0.68, use_speaker_boost: true }
    case 'grateful':
      return { stability: 0.34, similarity_boost: 0.82, style: 0.65, use_speaker_boost: true }
    case 'neutral':
    default:
      return { stability: 0.32, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true }
  }
}

async function textToSpeech(payload: {
  text: string
  plainText: string
  voiceId: string
  stability: number
  outputFormat: string
  realtime: boolean
  emotion?: string
}) {
  const key = Deno.env.get('ELEVENLABS_API_KEY')
  if (!key) throw new Error('ELEVENLABS_API_KEY is missing in Supabase secrets.')

  const headers = {
    'Content-Type': 'application/json',
    'xi-api-key': key,
  }

  // Realtime requests skip the slower dialogue_v3 endpoint and go straight to
  // speech_v3 with `optimize_streaming_latency` for snappy fillers / live mode.
  if (!payload.realtime) {
    const dialogue = await fetch(`https://api.elevenlabs.io/v1/text-to-dialogue?output_format=${payload.outputFormat}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inputs: [{ text: payload.text, voice_id: payload.voiceId }],
        model_id: 'eleven_v3',
        settings: { stability: payload.stability },
        apply_text_normalization: 'off',
      }),
    })
    if (dialogue.ok) {
      const bytes = new Uint8Array(await dialogue.arrayBuffer())
      return {
        audioBase64: encodeBase64(bytes),
        mimeType: dialogue.headers.get('content-type') ?? 'audio/mpeg',
        backend: 'dialogue_v3',
      }
    }
  }

  const latencyParam = payload.realtime ? '&optimize_streaming_latency=3' : ''
  const speechV3 = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${payload.voiceId}?output_format=${payload.outputFormat}${latencyParam}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text: payload.text,
        model_id: 'eleven_v3',
        apply_text_normalization: 'off',
        voice_settings: {
          stability: payload.stability,
          similarity_boost: 0.75,
          style: 0.35,
          use_speaker_boost: true,
          speed: 1,
        },
      }),
    },
  )
  if (speechV3.ok) {
    const bytes = new Uint8Array(await speechV3.arrayBuffer())
    return {
      audioBase64: encodeBase64(bytes),
      mimeType: speechV3.headers.get('content-type') ?? 'audio/mpeg',
      backend: 'speech_v3',
    }
  }

  // v2 fallback — tag-free but emotionally tuned per user emotion.
  const v2Settings = v2SettingsForEmotion(payload.emotion ?? 'neutral')
  const speechV2 = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${payload.voiceId}?output_format=${payload.outputFormat}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text: payload.plainText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: v2Settings,
      }),
    },
  )
  if (!speechV2.ok) {
    throw new Error(`Text-to-speech failed (${speechV2.status}): ${await readErrorText(speechV2)}`)
  }

  const bytes = new Uint8Array(await speechV2.arrayBuffer())
  return {
    audioBase64: encodeBase64(bytes),
    mimeType: speechV2.headers.get('content-type') ?? 'audio/mpeg',
    backend: 'speech_v2_fallback',
  }
}

async function transcribeAudio(payload: {
  audioBase64: string
  mimeType: string
  whisperOnly?: boolean
}) {
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  const elevenKey = Deno.env.get('ELEVENLABS_API_KEY')
  const bytes = decodeBase64(payload.audioBase64)
  const audioBlob = new Blob([bytes], { type: payload.mimeType || 'audio/webm' })

  if (openAiKey) {
    const formData = new FormData()
    formData.append('file', audioBlob, 'speech.webm')
    formData.append('model', 'whisper-1')
    formData.append('language', 'en')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: formData,
    })

    if (response.ok) {
      const data = await response.json()
      const text = (data?.text as string | undefined)?.trim() ?? ''
      if (text) return { text }
    }
    if (payload.whisperOnly) {
      throw new Error(`Speech-to-text failed (${response.status}): ${await readErrorText(response)}`)
    }
  }

  if (payload.whisperOnly) {
    throw new Error('Speech-to-text failed. Set OPENAI_API_KEY in Supabase secrets.')
  }

  if (elevenKey) {
    const formData = new FormData()
    formData.append('file', audioBlob, 'speech.webm')
    formData.append('model_id', 'scribe_v1')

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': elevenKey },
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`Speech-to-text failed (${response.status}): ${await readErrorText(response)}`)
    }
    const data = await response.json()
    const text = (data?.text as string | undefined)?.trim() ?? ''
    return { text }
  }

  throw new Error('No transcription provider configured. Set OPENAI_API_KEY or ELEVENLABS_API_KEY.')
}

async function assertVoiceExists(voiceId: string, key: string) {
  const id = voiceId.trim()
  if (!id) throw new Error('A trained voice is required for live talk.')

  const response = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(id)}`, {
    headers: { 'xi-api-key': key },
  })

  if (response.status === 404) {
    throw new Error(
      'This voice ID is not in your ElevenLabs account. Open My voices, select a current voice, or train a new one.',
    )
  }
  if (!response.ok) {
    throw new Error(`Could not verify voice (${response.status}): ${await readErrorText(response)}`)
  }
}

/** Point the ConvAI agent at the user's cloned voice (do not change TTS model — agent language rules apply). */
async function setAgentTrainedVoice(agentId: string, voiceId: string, key: string) {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    headers: {
      'xi-api-key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      conversation_config: {
        tts: {
          voice_id: voiceId,
        },
      },
    }),
  })

  if (!response.ok) {
    const detail = await readErrorText(response)
    throw new Error(
      `Could not set your voice on the live-talk agent (${response.status}): ${detail.slice(0, 280)}`,
    )
  }
}

/** Allow prompt / first-message overrides from the app (voice comes from agent config above). */
async function ensureLivePromptOverrides(agentId: string, key: string) {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    headers: {
      'xi-api-key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      platform_settings: {
        overrides: {
          conversation_config_override: {
            agent: {
              first_message: true,
              language: true,
              prompt: { prompt: true },
            },
          },
        },
      },
    }),
  })

  if (!response.ok) {
    const detail = await readErrorText(response)
    throw new Error(
      `Could not enable prompt overrides on your agent (${response.status}). In ElevenLabs → Agent → Security, allow prompt and first message overrides. ${detail.slice(0, 200)}`,
    )
  }
}

async function getConversationToken(payload: { voiceId?: string }) {
  const key = Deno.env.get('ELEVENLABS_API_KEY')
  const agentId = Deno.env.get('ELEVENLABS_AGENT_ID')
  if (!key) throw new Error('ELEVENLABS_API_KEY is not configured.')
  if (!agentId) {
    throw new Error(
      'ELEVENLABS_AGENT_ID is not configured. Create a Conversational AI agent in ElevenLabs and add its ID to Supabase secrets.',
    )
  }

  const voiceId = String(payload?.voiceId ?? '').trim()
  if (!voiceId) {
    throw new Error('voiceId is required for live talk.')
  }

  await assertVoiceExists(voiceId, key)
  await setAgentTrainedVoice(agentId, voiceId, key)
  await ensureLivePromptOverrides(agentId, key)

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { 'xi-api-key': key } },
  )

  if (!response.ok) {
    const detail = await readErrorText(response)
    throw new Error(`ElevenLabs conversation token failed (${response.status}): ${detail}`)
  }

  const data = (await response.json()) as { token?: string }
  if (!data.token) throw new Error('ElevenLabs returned no conversation token.')
  return { token: data.token }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const payload = await request.json()
    const action = String(payload?.action ?? '')

    switch (action) {
      case 'chatCompletion': {
        const data = await chatCompletion(payload.request as ChatRequest)
        return json(200, { ok: true, data })
      }
      case 'cloneVoice': {
        const data = await cloneVoice(payload as { name: string; audioBase64: string; mimeType: string })
        return json(200, { ok: true, data })
      }
      case 'textToSpeech': {
        const data = await textToSpeech(
          payload as {
            text: string
            plainText: string
            voiceId: string
            stability: number
            outputFormat: string
            realtime: boolean
            emotion?: string
          },
        )
        return json(200, { ok: true, data })
      }
      case 'transcribeAudio': {
        const data = await transcribeAudio(
          payload as { audioBase64: string; mimeType: string; whisperOnly?: boolean },
        )
        return json(200, { ok: true, data })
      }
      case 'getConversationToken': {
        const data = await getConversationToken(payload as { voiceId?: string })
        return json(200, { ok: true, data })
      }
      case 'deleteVoice': {
        const data = await deleteVoice(payload as { voiceId: string })
        return json(200, { ok: true, data })
      }
      case 'listVoices': {
        const data = await listVoices()
        return json(200, { ok: true, data })
      }
      default:
        return json(400, { ok: false, error: `Unsupported action: ${action}` })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown backend error.'
    return json(500, { ok: false, error: message })
  }
})

