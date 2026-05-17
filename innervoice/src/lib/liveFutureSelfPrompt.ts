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

/** Live talk uses per-session overrides so concurrent callers don't mutate the shared agent. */
export function buildLiveConversationOverrides(userName?: string, firstMessage?: string, voiceId?: string) {
  return {
    agent: {
      prompt: {
        prompt: buildLiveFutureSelfPrompt(userName),
      },
      firstMessage: firstMessage?.trim() || liveFutureSelfFirstMessage(userName),
      language: 'en' as const,
    },
    tts: voiceId ? { voiceId } : undefined,
  }
}
