/** ElevenLabs-friendly chunk size for narration (stay under API limits). */
export const STORY_CHUNK_MAX_CHARS = 2200
export const STORY_SCRIPT_MAX_CHARS = 80_000

export function splitStoryIntoChunks(text: string, maxChars = STORY_CHUNK_MAX_CHARS): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const blocks = normalized.split(/\n\s*\n/).map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const chunks: string[] = []
  let buffer = ''

  const flush = () => {
    if (buffer.trim()) chunks.push(buffer.trim())
    buffer = ''
  }

  const appendSentence = (sentence: string) => {
    const s = sentence.trim()
    if (!s) return
    const next = buffer ? `${buffer} ${s}` : s
    if (next.length <= maxChars) {
      buffer = next
      return
    }
    flush()
    if (s.length <= maxChars) {
      buffer = s
      return
    }
    for (let i = 0; i < s.length; i += maxChars) {
      chunks.push(s.slice(i, i + maxChars).trim())
    }
  }

  const appendLongBlock = (block: string) => {
    const sentences = block.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [block]
    for (const sentence of sentences) appendSentence(sentence)
  }

  for (const block of blocks) {
    if (block.length > maxChars) {
      flush()
      appendLongBlock(block)
      continue
    }
    const next = buffer ? `${buffer}\n\n${block}` : block
    if (next.length > maxChars) {
      flush()
      buffer = block
    } else {
      buffer = next
    }
  }

  flush()
  return chunks
}
