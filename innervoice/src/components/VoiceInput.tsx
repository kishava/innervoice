import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { transcribeAudio } from '../api/speechToText'
import { ErrorPopup } from './ErrorPopup'

export type VoiceInputStatus = 'idle' | 'recording' | 'transcribing'

interface Props {
  onTranscript: (text: string) => void
  disabled?: boolean
  /** Hold Space to record (ignored while typing in a field). */
  enableSpaceHotkey?: boolean
  hotkeyDisabled?: boolean
  onStatusChange?: (status: VoiceInputStatus) => void
}

function isTypingTarget(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return (el as HTMLElement).isContentEditable
}

export function VoiceInput({
  onTranscript,
  disabled = false,
  enableSpaceHotkey = true,
  hotkeyDisabled = false,
  onStatusChange,
}: Props) {
  const [status, setStatus] = useState<VoiceInputStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [spaceHeld, setSpaceHeld] = useState(false)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  const statusRef = useRef(status)
  const spaceHeldRef = useRef(false)

  const updateStatus = useCallback(
    (next: VoiceInputStatus) => {
      statusRef.current = next
      setStatus(next)
      onStatusChange?.(next)
    },
    [onStatusChange],
  )

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
    },
    [],
  )

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopRecording = useCallback(() => {
    const recorder = mediaRef.current
    if (!recorder || recorder.state === 'inactive') return
    if (recorder.state === 'recording') {
      recorder.requestData()
    }
    recorder.stop()
    mediaRef.current = null
  }, [])

  const startRecording = useCallback(async () => {
    if (disabled || statusRef.current !== 'idle') return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (disabled || statusRef.current !== 'idle') {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
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
        updateStatus('transcribing')
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
          updateStatus('idle')
          setElapsedSec(0)
          spaceHeldRef.current = false
          setSpaceHeld(false)
        }
      }

      recorder.start()
      updateStatus('recording')
      setElapsedSec(0)
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000)
    } catch {
      setError('Microphone blocked. Allow mic access in browser settings.')
      stopStream()
      spaceHeldRef.current = false
      setSpaceHeld(false)
    }
  }, [disabled, stopStream, updateStatus])

  const handleClick = () => {
    if (disabled || status === 'transcribing') return
    if (status === 'recording') {
      stopRecording()
    } else {
      void startRecording()
    }
  }

  useEffect(() => {
    if (!enableSpaceHotkey || disabled || hotkeyDisabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return
      if (event.repeat || isTypingTarget()) return
      if (statusRef.current === 'transcribing') return

      event.preventDefault()

      if (statusRef.current === 'recording') return

      spaceHeldRef.current = true
      setSpaceHeld(true)
      void startRecording()
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return
      if (!spaceHeldRef.current && statusRef.current !== 'recording') return

      event.preventDefault()
      spaceHeldRef.current = false
      setSpaceHeld(false)

      if (statusRef.current === 'recording') {
        stopRecording()
      }
    }

    const onWindowBlur = () => {
      if (!spaceHeldRef.current && statusRef.current !== 'recording') return
      spaceHeldRef.current = false
      setSpaceHeld(false)
      if (statusRef.current === 'recording') {
        stopRecording()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [disabled, enableSpaceHotkey, hotkeyDisabled, startRecording, stopRecording])

  const isRecording = status === 'recording'
  const isTranscribing = status === 'transcribing'
  const hint = isRecording
    ? spaceHeld
      ? `${elapsedSec}s — release Space to send`
      : `${elapsedSec}s — tap to send`
    : isTranscribing
      ? 'Transcribing…'
      : null

  return (
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center self-center sm:h-12 sm:w-12">
      <ErrorPopup message={error} onClose={() => setError(null)} />
      {hint && (
        <p className="pointer-events-none absolute -top-10 left-1/2 z-20 w-max -translate-x-1/2 whitespace-nowrap text-xs text-accent">
          {hint}
        </p>
      )}
      <button
        type="button"
        aria-label={
          isRecording
            ? 'Stop and transcribe'
            : isTranscribing
              ? 'Transcribing'
              : 'Record voice message (hold Space)'
        }
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
