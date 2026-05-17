import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Mic, Radio, Square, Upload } from 'lucide-react'

interface Props {
  onUseRecording: (blob: Blob, voiceName: string) => void
}

const MIN_DURATION_MS = 30_000
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const ACCEPT_AUDIO =
  'audio/*,.mp3,.wav,.m4a,.webm,.ogg,.flac,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/ogg'

type AudioSource = 'record' | 'upload'

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

const TRAINING_PASSAGE = `Take a slow breath in, and a slower one out. The voice you are about to hear belongs to a future version of you — someone who has lived through what you are facing right now and made it to the other side.

This is a quiet promise from them: you are not alone. You are not behind. The hardest seasons of your life are also the most formative, even when you cannot see it yet.

Speak naturally, the way you would talk to a friend at the end of a long day. Read these words steadily, with warmth, without rushing. The richer your tone, the more your future self will sound like you when they finally speak back.

When you finish, take another breath, and remember: clarity is on its way. Small steps still count. You are allowed to be soft about the things that hurt.`

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000)
  const min = String(Math.floor(total / 60)).padStart(2, '0')
  const sec = String(total % 60).padStart(2, '0')
  return `${min}:${sec}`
}

export function RecordingView({ onUseRecording }: Props) {
  const [isRecording, setIsRecording] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [tooShortHint, setTooShortHint] = useState(false)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [voiceName, setVoiceName] = useState('My future self')
  const [audioSource, setAudioSource] = useState<AudioSource | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number>(0)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    },
    [audioUrl],
  )

  const recordingStateLabel = useMemo(() => {
    if (audioUrl) return 'Preview'
    if (isRecording) return 'Recording'
    return 'Start'
  }, [audioUrl, isRecording])

  const progress = Math.min(100, (elapsedMs / MIN_DURATION_MS) * 100)
  const hasReachedMin = elapsedMs >= MIN_DURATION_MS
  const previewMeetsMin = previewDuration >= MIN_DURATION_MS

  const startRecording = async () => {
    try {
      setTooShortHint(false)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (audioUrl) URL.revokeObjectURL(audioUrl)
        setAudioUrl(URL.createObjectURL(blob))
        setAudioSource('record')
        setUploadError(null)
      }
      recorder.start()
      startedAtRef.current = Date.now()
      timerRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200)
      setIsRecording(true)
    } catch {
      setPermissionDenied(true)
    }
  }

  const stopRecording = () => {
    setPreviewDuration(Date.now() - startedAtRef.current)
    mediaRef.current?.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (timerRef.current) window.clearInterval(timerRef.current)
    setIsRecording(false)
  }

  const clearAudio = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    setElapsedMs(0)
    setPreviewDuration(0)
    setTooShortHint(false)
    setAudioSource(null)
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadError(null)
    setTooShortHint(false)

    if (!isLikelyAudioFile(file)) {
      setUploadError('Please choose an audio file (MP3, WAV, M4A, WebM, OGG, or FLAC).')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('File is too large. Maximum size is 25 MB.')
      return
    }

    setUploading(true)
    try {
      const url = URL.createObjectURL(file)
      const durationMs = await getAudioDurationMs(url)
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      setAudioUrl(url)
      setPreviewDuration(durationMs)
      setAudioSource('upload')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not load that audio file.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const useRecording = async () => {
    if (!audioUrl) return
    if (!previewMeetsMin) {
      setTooShortHint(true)
      return
    }
    const trimmedName = voiceName.trim()
    if (!trimmedName) return
    const blob = await fetch(audioUrl).then((res) => res.blob())
    onUseRecording(blob, trimmedName)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex h-full min-h-0 flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-[minmax(320px,1.1fr)_minmax(300px,0.9fr)] lg:gap-4"
    >
      <div className="text-center lg:col-span-2">
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-text-primary">
          <BookOpen size={18} className="text-accent" />
          Voice Training
        </h2>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-text-secondary">
          Record the passage below or upload your own audio — at least{' '}
          <span className="font-semibold text-text-primary">30 seconds</span> of clear speech.
        </p>
      </div>

      <div className="glass-panel min-h-[140px] overflow-y-auto rounded-2xl border border-border p-3 text-sm leading-relaxed text-text-secondary sm:p-4 lg:min-h-0 lg:max-h-none">
        {TRAINING_PASSAGE.split('\n\n').map((paragraph, idx) => (
          <p key={idx} className={idx === 0 ? '' : 'mt-3'}>
            {paragraph}
          </p>
        ))}
      </div>

      <div className="flex flex-col items-center justify-center gap-3">
        <button
          type="button"
          aria-label="Start or stop recording"
          onClick={isRecording ? stopRecording : audioUrl ? clearAudio : startRecording}
          disabled={uploading}
          className={`relative flex h-20 w-20 items-center justify-center rounded-full border text-sm font-semibold text-white shadow-[0_0_30px_var(--color-accent-soft)] transition active:scale-95 sm:h-24 sm:w-24 ${
            audioUrl
              ? 'border-white/20 bg-white/15'
              : isRecording
                ? 'border-accent bg-accent'
                : 'border-accent/60 bg-elevated text-text-primary'
          }`}
        >
          <span className="flex flex-col items-center gap-1">
            {isRecording ? <Square size={18} /> : audioUrl ? <Radio size={18} /> : <Mic size={18} />}
            <span className="text-xs">{recordingStateLabel}</span>
          </span>
          {isRecording && (
            <span className="pointer-events-none absolute inset-0 animate-ping rounded-full border border-accent/60" />
          )}
        </button>

        <p className="font-mono text-lg text-text-primary">
          {formatDuration(audioUrl ? previewDuration : elapsedMs)}
          <span className="text-xs text-text-tertiary"> / 00:30 min</span>
        </p>

        <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-border">
          <div
            className={`h-full rounded-full transition-all duration-200 ${hasReachedMin || previewMeetsMin ? 'bg-accent-hover' : 'bg-accent'}`}
            style={{ width: `${audioUrl ? Math.min(100, (previewDuration / MIN_DURATION_MS) * 100) : progress}%` }}
          />
        </div>
        {isRecording && !hasReachedMin && (
          <p className="text-center text-xs text-text-tertiary">
            Keep reading... {Math.max(0, Math.ceil((MIN_DURATION_MS - elapsedMs) / 1000))}s remaining
          </p>
        )}

        {!audioUrl && !isRecording && (
          <div className="flex w-full max-w-sm flex-col items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-text-tertiary">or</span>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_AUDIO}
              className="sr-only"
              onChange={(e) => void handleFileSelect(e)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border/80 bg-elevated/90 px-5 py-2.5 text-sm text-text-secondary transition hover:border-accent/60 hover:text-text-primary disabled:opacity-50"
            >
              <Upload size={16} />
              {uploading ? 'Loading file…' : 'Upload audio file'}
            </button>
            <p className="text-center text-[11px] text-text-tertiary">MP3, WAV, M4A, WebM, OGG, FLAC · max 25 MB</p>
          </div>
        )}
      </div>

      {uploadError && (
        <p className="text-center text-sm text-danger lg:col-span-2">{uploadError}</p>
      )}

      {permissionDenied && (
        <p className="text-center text-sm text-danger">Microphone access is blocked. Enable it in browser settings.</p>
      )}

      {audioUrl && (
        <div className="glass-panel flex w-full flex-col gap-3 rounded-2xl border border-border p-3 lg:col-span-2">
          <audio controls src={audioUrl} className="w-full" />
          {audioSource === 'upload' && (
            <p className="text-xs text-text-tertiary">Using uploaded file · {formatDuration(previewDuration)}</p>
          )}
          {tooShortHint && !previewMeetsMin && (
            <p className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger">
              Audio must be at least 30 seconds for a good voice clone.
            </p>
          )}
          {!previewMeetsMin && audioUrl && !tooShortHint && (
            <p className="rounded-lg border border-border/80 bg-elevated/80 px-3 py-2 text-xs text-text-secondary">
              This clip is {formatDuration(previewDuration)} — add more audio or choose a longer file (30s minimum).
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
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={clearAudio}
              className="min-h-11 flex-1 rounded-full border border-border bg-elevated px-6 py-3 text-text-primary transition hover:border-accent/60"
            >
              {audioSource === 'upload' ? 'Choose another file' : 'Re-record'}
            </button>
            <button
              type="button"
              onClick={useRecording}
              disabled={!previewMeetsMin || !voiceName.trim()}
              className="min-h-11 flex-1 rounded-full bg-accent px-6 py-3 font-semibold text-white shadow-[0_0_16px_var(--color-accent-soft)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Train this voice
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
