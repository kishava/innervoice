import type { Emotion, Message } from '../types'
import {
  buildChatFutureSelfSystemPrompt,
  buildGreetingSystemPrompt,
  futureSelfGreetingFallback,
} from '../lib/futureSelfPersona'
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
  return buildChatFutureSelfSystemPrompt(messages)
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
  const fallback = futureSelfGreetingFallback(userName)

  if (!isSupabaseConfigured) {
    return fallback
  }

  try {
    const data = await invokeGateway<{ content: string }>('chatCompletion', {
      request: {
        model: 'gpt-4o',
        temperature: 0.9,
        messages: [
          { role: 'system', content: buildGreetingSystemPrompt(userName) },
          { role: 'user', content: 'Greet me now.' },
        ],
      },
    })
    return data.content?.trim() ?? fallback
  } catch {
    return fallback
  }
}
