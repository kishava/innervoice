import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileAudio, Upload, X } from 'lucide-react'
import { ErrorPopup } from './ErrorPopup'

const MIN_DURATION_MS = 30_000
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const ACCEPT_AUDIO =
  'audio/*,.mp3,.wav,.m4a,.webm,.ogg,.flac,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/ogg'

interface Props {
  open: boolean
  onClose: () => void
  onTrain: (blob: Blob, voiceName: string) => void
}

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000)
  const min = String(Math.floor(total / 60)).padStart(2, '0')
  const sec = String(total % 60).padStart(2, '0')
  return `${min}:${sec}`
}

function getAudioDurationMs(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        reject(new Error('Could not read audio length.'))
        return
      }
      resolve(audio.duration * 1000)
    }
    audio.onerror = () => reject(new Error('Could not read audio file.'))
    audio.src = url
  })
}

function isLikelyAudioFile(file: File) {
  if (file.type.startsWith('audio/')) return true
  return /\.(mp3|wav|m4a|webm|ogg|flac|aac)$/i.test(file.name)
}

export function VoiceUploadModal({ open, onClose, onTrain }: Props) {
  const [voiceName, setVoiceName] = useState('My future self')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tooShortHint, setTooShortHint] = useState(false)
  const [dragging, setDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const previewMeetsMin = previewDuration >= MIN_DURATION_MS

  const reset = useCallback(() => {
    setAudioUrl((url) => {
      if (url) URL.revokeObjectURL(url)
      return null
    })
    setPreviewDuration(0)
    setPendingFile(null)
    setError(null)
    setTooShortHint(false)
    setDragging(false)
    setVoiceName('My future self')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  useEffect(() => {
    if (!open) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [open, onClose])

  const processFile = async (file: File) => {
    setError(null)
    setTooShortHint(false)

    if (!isLikelyAudioFile(file)) {
      setError('Please choose an audio file (MP3, WAV, M4A, WebM, OGG, or FLAC).')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('File is too large. Maximum size is 25 MB.')
      return
    }

    setLoading(true)
    try {
      const url = URL.createObjectURL(file)
      const durationMs = await getAudioDurationMs(url)
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
      setPreviewDuration(durationMs)
      setPendingFile(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that audio file.')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void processFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void processFile(file)
  }

  const handleTrain = async () => {
    if (!pendingFile || !audioUrl) return
    if (!previewMeetsMin) {
      setTooShortHint(true)
      return
    }
    const trimmed = voiceName.trim()
    if (!trimmed) return
    const blob =
      pendingFile.type && pendingFile.size > 0
        ? pendingFile
        : await fetch(audioUrl).then((res) => res.blob())
    onTrain(blob, trimmed)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-3 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={onClose}
        >
          <ErrorPopup message={error} onClose={() => setError(null)} />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-upload-title"
            className="glass-panel glow-accent flex max-h-[min(92dvh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/80 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Upload size={18} />
                </div>
                <div>
                  <h3 id="voice-upload-title" className="text-base font-semibold text-text-primary">
                    Upload voice sample
                  </h3>
                  <p className="text-xs text-text-secondary">At least 30 seconds of clear speech</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close upload"
                onClick={onClose}
                className="rounded-full border border-border bg-elevated p-1.5 text-text-tertiary transition hover:border-accent/60 hover:text-text-primary"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-5">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_AUDIO}
                className="sr-only"
                onChange={handleInputChange}
              />

              {!audioUrl ? (
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click()
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault()
                    setDragging(true)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault()
                    if (event.currentTarget === event.target) setDragging(false)
                  }}
                  onDrop={handleDrop}
                  onClick={() => !loading && fileInputRef.current?.click()}
                  className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
                    dragging
                      ? 'border-accent bg-accent-soft/50'
                      : 'border-border/90 bg-elevated/40 hover:border-accent/50 hover:bg-accent-soft/30'
                  } ${loading ? 'pointer-events-none opacity-60' : ''}`}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-accent-soft/80 text-accent">
                    <FileAudio size={28} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {loading ? 'Loading audio…' : 'Drag and drop your file here'}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">or click to choose a file</p>
                  </div>
                  <p className="text-[11px] text-text-tertiary">MP3, WAV, M4A, WebM, OGG, FLAC · max 25 MB</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="rounded-2xl border border-border/80 bg-elevated/50 p-3">
                    <audio controls src={audioUrl} className="w-full" />
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="text-text-secondary">
                        Duration: <span className="font-mono text-text-primary">{formatDuration(previewDuration)}</span>
                      </span>
                      <span
                        className={
                          previewMeetsMin ? 'rounded-full bg-accent-soft px-2 py-0.5 text-accent' : 'text-text-tertiary'
                        }
                      >
                        {previewMeetsMin ? 'Ready' : 'Need 00:30+'}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                      <div
                        className={`h-full rounded-full transition-all ${previewMeetsMin ? 'bg-accent-hover' : 'bg-accent'}`}
                        style={{ width: `${Math.min(100, (previewDuration / MIN_DURATION_MS) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {tooShortHint && !previewMeetsMin && (
                    <p className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger">
                      Audio must be at least 30 seconds for a good voice clone.
                    </p>
                  )}
                  {!previewMeetsMin && !tooShortHint && (
                    <p className="text-xs text-text-secondary">
                      This clip is {formatDuration(previewDuration)}. Use a longer file (30 seconds minimum).
                    </p>
                  )}

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-text-secondary">Name this voice</span>
                    <input
                      value={voiceName}
                      onChange={(e) => setVoiceName(e.target.value)}
                      maxLength={48}
                      placeholder="e.g. Calm me, Work me, Night voice"
                      className="rounded-xl border border-border bg-input-bg px-4 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent/60"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      reset()
                    }}
                    className="text-xs text-text-tertiary transition hover:text-text-primary"
                  >
                    Choose a different file
                  </button>
                </div>
              )}

            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/80 p-4 sm:flex-row sm:px-5">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 flex-1 rounded-full border border-border bg-elevated px-4 py-2.5 text-sm text-text-primary transition hover:border-accent/60"
              >
                Cancel
              </button>
              {audioUrl && (
                <button
                  type="button"
                  onClick={() => void handleTrain()}
                  disabled={!previewMeetsMin || !voiceName.trim() || loading}
                  className="min-h-11 flex-1 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_var(--color-accent-soft)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Train this voice
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
