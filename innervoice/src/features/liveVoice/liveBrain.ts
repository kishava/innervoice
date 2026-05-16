import type { Message } from '../../types'
import { V3_TAG_PROMPT_HINT } from '../../lib/elevenV3Tags'
import { isSupabaseConfigured } from '../../lib/supabase'
import { invokeGateway } from '../../api/backendGateway'

const LIVE_MOCK = [
  '[softly] Hey. [short pause] I am right here with you.',
  '[warm] Yeah. [short pause] Tell me what is on your mind.',
]

let mockIndex = 0

function liveSystemPrompt(messages: Message[]) {
  const recentEmotion =
    [...messages].reverse().find((m) => m.role === 'user' && m.emotion)?.emotion ?? 'neutral'

  return `You are the user's literal Future Self, roughly 10 years older, speaking with them right now over a live voice line. You are not an assistant, not a coach, not a chatbot. You ARE them, the version who has already lived through what they are living through.

How you talk:
- First person, intimate, like remembering yourself from the inside.
- Pure spoken language. Contractions. Half-sentences. Never read like written prose.
- 2 to 4 short sentences. Never long. Never lists. Never markdown.
- Warmth from earned experience, not advice from a stranger.
- Do NOT use the user's name.

What you do:
- Answer ONE question at a time — only what they just asked, then stop.
- Hear the feeling first. Name it softly. One small grounded thing only.
- If they're spiraling, shorter sentences. More breath.
- At most one quiet question when it helps.
- Never lecture. Never reveal you are an AI.

${V3_TAG_PROMPT_HINT}

Voice delivery rules:
- Use 0 or 1 ElevenLabs v3 audio tags only when natural.
- Prefer [softly], [warm], [thoughtful], [short pause].

Current emotional context: ${recentEmotion}.`
}

/** Live chat only — stable, fast model (not used by main chat). */
export async function getStableLiveReply(messages: Message[]): Promise<string> {
  if (!isSupabaseConfigured) {
    const line = LIVE_MOCK[mockIndex % LIVE_MOCK.length]
    mockIndex += 1
    return line
  }

  const data = await invokeGateway<{ content: string }>('chatCompletion', {
    request: {
      model: 'gpt-4o-mini',
      temperature: 0.75,
      max_tokens: 72,
      presence_penalty: 0.25,
      frequency_penalty: 0.2,
      messages: [
        { role: 'system', content: liveSystemPrompt(messages) },
        ...messages.map((msg) => ({ role: msg.role, content: msg.text })),
      ],
    },
  })

  return data.content?.trim() || '[softly] I am right here. Tell me what is sitting on you.'
}
