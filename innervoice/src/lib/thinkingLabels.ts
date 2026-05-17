import type { Emotion } from '../types'

export const THINKING_LABELS = [
  'Listening...',
  'Taking that in...',
  'Finding the right words...',
  'Breathing with you for a second...',
] as const

const HEAVY_EMOTIONS = new Set<Emotion>(['anxious', 'sad', 'fearful', 'stressed', 'grieving', 'hurt', 'lonely'])

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function pickThinkingLabel(emotion?: Emotion) {
  if (emotion && HEAVY_EMOTIONS.has(emotion)) {
    return Math.random() > 0.5 ? 'Taking that in...' : 'Breathing with you for a second...'
  }
  return THINKING_LABELS[randomBetween(0, THINKING_LABELS.length - 1)]
}
