import mammoth from 'mammoth'

export async function extractDocxText(
  file: File,
  enforceLength: (text: string) => string,
  normalizeExtractedText: (text: string) => string,
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const { value } = await mammoth.extractRawText({ arrayBuffer })
  return enforceLength(normalizeExtractedText(value))
}
