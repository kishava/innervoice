import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { transcribeAudio } from '../api/speechToText'

interface Props {
  onTranscript: (text: string) => void
  disabled?: boolean
}

export function VoiceInput({ onTranscript, disabled = false }: Props) {
  const [status, setStatus] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const onTranscriptRef = useRef(onTranscript)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
    },
    [],
  )

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startRecording = async () => {
    if (disabled || status !== 'idle') return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        stopStream()
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setStatus('transcribing')
        try {
          const text = await transcribeAudio(blob)
          if (text) {
            onTranscriptRef.current(text)
          } else {
            setError('No speech detected. Try again.')
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Transcription failed.')
        } finally {
          setStatus('idle')
          setElapsedSec(0)
        }
      }

      recorder.start()
      setStatus('recording')
      setElapsedSec(0)
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000)
    } catch {
      setError('Microphone blocked. Allow mic access in browser settings.')
      stopStream()
    }
  }

  const stopRecording = () => {
    const recorder = mediaRef.current
    if (!recorder || recorder.state === 'inactive') return
    if (recorder.state === 'recording') {
      recorder.requestData()
    }
    recorder.stop()
    mediaRef.current = null
  }

  const handleClick = () => {
    if (disabled || status === 'transcribing') return
    if (status === 'recording') {
      stopRecording()
    } else {
      void startRecording()
    }
  }

  const isRecording = status === 'recording'
  const isTranscribing = status === 'transcribing'

  return (
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center self-center sm:h-12 sm:w-12">
      {error && (
        <p className="pointer-events-none absolute -top-14 left-1/2 z-20 w-[min(280px,80vw)] -translate-x-1/2 rounded-lg border border-danger/40 bg-danger-soft px-3 py-1.5 text-center text-xs text-danger">
          {error}
        </p>
      )}
      {isRecording && (
        <p className="pointer-events-none absolute -top-10 left-1/2 z-20 w-max -translate-x-1/2 whitespace-nowrap text-xs text-accent">
          {elapsedSec}s — tap to send
        </p>
      )}
      <button
        type="button"
        aria-label={isRecording ? 'Stop and transcribe' : isTranscribing ? 'Transcribing' : 'Record voice message'}
        disabled={disabled || isTranscribing}
        onClick={handleClick}
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:w-12 ${
          isRecording
            ? 'border-accent bg-accent text-white shadow-[0_0_24px_var(--color-accent-soft)]'
            : isTranscribing
              ? 'border-border bg-elevated text-text-secondary'
              : 'border-border bg-elevated text-text-secondary hover:border-accent/60 hover:text-text-primary'
        }`}
      >
        {isTranscribing ? (
          <Loader2 size={18} className="animate-spin" />
        ) : isRecording ? (
          <Square size={16} />
        ) : (
          <Mic size={18} />
        )}
        {isRecording && (
          <span className="pointer-events-none absolute inset-0 animate-ping rounded-full border border-accent/60" />
        )}
      </button>
    </div>
  )
}
