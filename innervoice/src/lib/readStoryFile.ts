import { STORY_SCRIPT_MAX_CHARS } from './storyChunks'

/** Max binary upload size before text extraction. */
export const STORY_FILE_MAX_BYTES = 5_000_000

export const STORY_FILE_ACCEPT =
  '.txt,.md,.pdf,.doc,.docx,text/plain,text/markdown,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const PLAIN_TEXT_EXTENSIONS = new Set(['txt', 'md', 'text'])

function extensionOf(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? ''
}

function normalizeExtractedText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\u0000/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

function enforceLength(text: string): string {
  if (text.length > STORY_SCRIPT_MAX_CHARS) {
    throw new Error(`Script is too long (max ${STORY_SCRIPT_MAX_CHARS.toLocaleString()} characters).`)
  }
  return text
}

async function readPlainTextFile(file: File): Promise<string> {
  const text = await file.text()
  return enforceLength(normalizeExtractedText(text))
}

export function isStoryFileSupported(file: File): boolean {
  const ext = extensionOf(file)
  if (PLAIN_TEXT_EXTENSIONS.has(ext)) return true
  if (ext === 'pdf' || ext === 'docx') return true
  if (file.type === 'application/pdf') return true
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true
  if (file.type === 'text/plain' || file.type === 'text/markdown') return true
  return false
}

export async function readStoryFile(file: File): Promise<string> {
  if (file.size > STORY_FILE_MAX_BYTES) {
    throw new Error(`File is too large (max ${Math.round(STORY_FILE_MAX_BYTES / 1_000_000)} MB).`)
  }

  const ext = extensionOf(file)

  if (ext === 'doc' || file.type === 'application/msword') {
    throw new Error('Legacy .doc files are not supported. Save as .docx or PDF and try again.')
  }

  if (ext === 'pdf' || file.type === 'application/pdf') {
    const { extractPdfText } = await import('./storyFilePdf')
    return extractPdfText(file, enforceLength, normalizeExtractedText)
  }

  if (
    ext === 'docx' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const { extractDocxText } = await import('./storyFileDocx')
    return extractDocxText(file, enforceLength, normalizeExtractedText)
  }

  if (PLAIN_TEXT_EXTENSIONS.has(ext) || file.type === 'text/plain' || file.type === 'text/markdown') {
    return readPlainTextFile(file)
  }

  throw new Error('Upload a .txt, .md, .pdf, or .docx file.')
}
