/** Max cloned voices stored per account (ElevenLabs account cap is 30). */
export const MAX_VOICES_PER_USER = 2

/** Delete all user voices after this many ms without a session. */
export const VOICE_INACTIVE_MS = 7 * 24 * 60 * 60 * 1000

export function voiceLimitMessage(currentCount: number): string {
  if (currentCount >= MAX_VOICES_PER_USER) {
    return `You can keep up to ${MAX_VOICES_PER_USER} voices. Delete one to train another.`
  }
  return ''
}
