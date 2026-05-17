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

/** Live talk: voice is set on the ElevenLabs agent; personality matches chat via shared persona. */
export function buildLiveConversationOverrides(userName?: string, firstMessage?: string) {
  return {
    agent: {
      prompt: {
        prompt: buildLiveFutureSelfPrompt(userName),
      },
      firstMessage: firstMessage?.trim() || liveFutureSelfFirstMessage(userName),
      language: 'en' as const,
    },
  }
}
