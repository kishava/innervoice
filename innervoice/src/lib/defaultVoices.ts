import type { UserVoice } from '../types'

/** ElevenLabs premade voices (stable public IDs). */
const DEFAULT_VOICE_DEFS = [
  { elevenlabsVoiceId: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
  { elevenlabsVoiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  { elevenlabsVoiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
  { elevenlabsVoiceId: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  { elevenlabsVoiceId: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },
  { elevenlabsVoiceId: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli' },
  { elevenlabsVoiceId: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam' },
  { elevenlabsVoiceId: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi' },
] as const

export function isDefaultVoiceEntry(id: string): boolean {
  return id.startsWith('default-')
}

export function defaultVoicesAsUserVoices(): UserVoice[] {
  return DEFAULT_VOICE_DEFS.map((v) => ({
    id: `default-${v.elevenlabsVoiceId}`,
    elevenlabsVoiceId: v.elevenlabsVoiceId,
    name: v.name,
    createdAt: 0,
  }))
}

/** Trained voices first, then premade defaults not already in the library. */
export function mergeVoicesForSelection(trained: UserVoice[]): UserVoice[] {
  const trainedIds = new Set(trained.map((v) => v.elevenlabsVoiceId))
  const defaults = defaultVoicesAsUserVoices().filter((d) => !trainedIds.has(d.elevenlabsVoiceId))
  return [...trained, ...defaults]
}

export function defaultVoicesForMyVoicesPage(trained: UserVoice[]): UserVoice[] {
  const trainedIds = new Set(trained.map((v) => v.elevenlabsVoiceId))
  return defaultVoicesAsUserVoices().filter((d) => !trainedIds.has(d.elevenlabsVoiceId))
}
