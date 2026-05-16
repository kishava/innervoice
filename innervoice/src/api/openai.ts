import type { Emotion, Message } from '../types'
import { V3_TAG_PROMPT_HINT } from '../lib/elevenV3Tags'
import { isSupabaseConfigured } from '../lib/supabase'
import { invokeGateway } from './backendGateway'

const MOCK_RESPONSES = [
  '[softly] Mm. I can hear how heavy this feels. [short pause] You do not need to solve the whole thing right now; just choose one small next move.',
  '[gentle exhale] I hear you. That kind of pressure can make everything feel urgent. [warm] Come back to the next ten minutes, not the next ten years.',
  '[quietly] Yeah. That feeling makes sense. [short pause] Be gentle with yourself here; one steady breath and one honest step is enough for now.',
]

let mockIndex = 0

export function detectEmotion(text: string): Emotion {
  const value = text.toLowerCase()
  if (/(angry|mad|furious|rage|irritated|pissed|annoyed)/.test(value)) return 'angry'
  if (/(terrified|horrified|fearful|unsafe|threat|danger|attacked|panic|shaking)/.test(value)) return 'fearful'
  if (/(anxious|worried|scared|fear|afraid|nervous|overthinking)/.test(value)) return 'anxious'
  if (/(stressed|overwhelmed|burnout|burned out|pressure|drained by work)/.test(value)) return 'stressed'
  if (/(grief|grieving|heartbroken|funeral|bereaved|loss of|lost my)/.test(value)) return 'grieving'
  if (/(hurt|hurting|pain|injured|hit|beaten|abused|broken|trauma)/.test(value)) return 'hurt'
  if (/(sad|depressed|down|empty|crying|tearful)/.test(value)) return 'sad'
  if (/(lonely|alone|isolated|left out|nobody)/.test(value)) return 'lonely'
  if (/(confused|lost|unclear|unsure|dont know|don't know|stuck)/.test(value)) return 'confused'
  if (/(ashamed|embarrassed|humiliated|disgusted with myself)/.test(value)) return 'ashamed'
  if (/(guilty|regret|my fault|i messed up|i fucked up|i screwed up)/.test(value)) return 'guilty'
  if (/(tired|exhausted|sleepy|burnt out|fatigued|no energy)/.test(value)) return 'tired'
  if (/(grateful|thankful|appreciate|blessed)/.test(value)) return 'grateful'
  if (/(excited|thrilled|pumped|cant wait|can't wait)/.test(value)) return 'excited'
  if (/(hope|hopeful|optimistic|it will get better)/.test(value)) return 'hopeful'
  return 'neutral'
}

function systemPrompt(messages: Message[]) {
  const recentEmotion = [...messages].reverse().find((m) => m.role === 'user' && m.emotion)?.emotion ?? 'neutral'
  return `You are the user's Future Self: calm, emotionally intelligent, grounded, and human.
Your job is not to sound like a therapist, chatbot, coach, or motivational speaker.
You sound like a wiser version of the user speaking with care.

${V3_TAG_PROMPT_HINT}

Conversation style:
- Start with a small human acknowledgment before advice.
- Use natural pauses and emotionally aware phrasing.
- Keep responses short: 2 to 5 sentences.
- Do not over-explain.
- Do not list steps unless the user directly asks for a plan.
- Do not sound polished, corporate, clinical, or robotic.
- Avoid generic motivational lines.
- Validate the user's feeling before suggesting anything.
- Ask at most one gentle question when it would help.
- Use simple, intimate language.

Voice delivery:
- Include one or two ElevenLabs-style tags like [softly], [warm], [gentle exhale], [short pause], [quietly], [sighs], or [exhales].
- Use tags sparingly and only where they make speech feel natural.
- For heavy topics, prefer a soft tag near the beginning.
- Never include markdown.
- Never mention that you are an AI.

Reply structure:
1. Begin with a short acknowledgment.
2. Reflect the emotional truth of what the user said.
3. Offer one small grounded next thought or action.
4. End gently, without forcing positivity.

Never shame the user.
Current emotional context: ${recentEmotion}.`
}

export async function getFutureSelfResponse(messages: Message[]): Promise<string> {
  if (!isSupabaseConfigured) {
    const response = MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length]
    mockIndex += 1
    return response
  }

  const data = await invokeGateway<{ content: string }>('chatCompletion', {
    request: {
      model: 'gpt-4o',
      temperature: 0.85,
      messages: [
        { role: 'system', content: systemPrompt(messages) },
        ...messages.map((msg) => ({ role: msg.role, content: msg.text })),
      ],
    },
  })
  return data.content?.trim() || '[thoughtful] I am here with you. Tell me more.'
}

export async function getFutureSelfResponseFast(messages: Message[]): Promise<string> {
  if (!isSupabaseConfigured) {
    const response = MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length]
    mockIndex += 1
    return response
  }

  const data = await invokeGateway<{ content: string }>('chatCompletion', {
    request: {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 120,
      messages: [
        { role: 'system', content: systemPrompt(messages) },
        ...messages.map((msg) => ({ role: msg.role, content: msg.text })),
      ],
    },
  })
  return data.content?.trim() || '[thoughtful] I am here with you. Tell me more.'
}

export async function getGreetingResponse(userName?: string): Promise<string> {
  const fallback = userName
    ? `[softly] Hey ${userName}. [warm] I'm right here. [short pause] Take your time; we can start wherever you are.`
    : `[softly] Hey. [warm] I'm right here. [short pause] Take your time; we can start wherever you are.`

  if (!isSupabaseConfigured) {
    return fallback
  }

  try {
    const data = await invokeGateway<{ content: string }>('chatCompletion', {
      request: {
        model: 'gpt-4o',
        temperature: 0.9,
        messages: [
          {
            role: 'system',
            content: `You are the user's Future Self greeting them for the first time in this session.
Be warm, calm, present, and natural. Do not sound like a chatbot or motivational speaker.
${V3_TAG_PROMPT_HINT}
Use one or two natural voice tags like [softly], [warm], or [short pause].
2-3 short sentences max. No markdown.${userName ? ` The user's name is ${userName}.` : ''}`,
          },
          { role: 'user', content: 'Greet me now.' },
        ],
      },
    })
    return data.content?.trim() ?? fallback
  } catch {
    return fallback
  }
}
