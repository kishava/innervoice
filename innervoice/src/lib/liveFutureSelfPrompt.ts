import {
  buildLiveFutureSelfSystemPrompt,
  futureSelfLiveGreetingFallback,
} from './futureSelfPersona'

export function buildLiveFutureSelfPrompt(userName?: string) {
  return buildLiveFutureSelfSystemPrompt(userName)
}

export function liveFutureSelfFirstMessage(userName?: string) {
  return futureSelfLiveGreetingFallback(userName)
}

/** Live talk: per-session voice + prompt overrides via ElevenLabs React SDK. */
export function buildLiveConversationOverrides(userName?: string, firstMessage?: string, voiceId?: string | null) {
  return {
    agent: {
      prompt: {
        prompt: buildLiveFutureSelfPrompt(userName),
      },
      firstMessage: firstMessage?.trim() || liveFutureSelfFirstMessage(userName),
      language: 'en' as const,
    },
    tts: voiceId?.trim() ? { voiceId: voiceId.trim() } : undefined,
    conversation: { textOnly: false },
  }
}
