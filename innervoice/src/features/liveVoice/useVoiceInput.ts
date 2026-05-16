import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeLiveAudio } from './liveSpeechToText'

interface UseVoiceInputOptions {
  onFinalTranscript: (text: string) => void | Promise<void>
  onSpeechStart?: () => void
  onActivity?: () => void
  onError?: (message: string) => void
  onSilentCapture?: () => void
  /** Ms of silence before the current utterance is sent (live default: 3000). */
  silenceMs?: number
  minRecordMs?: number
}

const DEFAULT_SILENCE_MS = 400
const DEFAULT_MIN_RECORD_MS = 280
const MAX_RECORD_MS = 120000
const RMS_THRESHOLD = 0.005
const MIN_BLOB_BYTES = 900
const CYCLE_RESTART_MS = 50

export function useVoiceInput({
  onFinalTranscript,
  onSpeechStart,
  onActivity,
  onError,
  onSilentCapture,
  silenceMs = DEFAULT_SILENCE_MS,
  minRecordMs = DEFAULT_MIN_RECORD_MS,
}: UseVoiceInputOptions) {
  const silenceMsRef = useRef(silenceMs)
  const minRecordMsRef = useRef(minRecordMs)
  useEffect(() => {
    silenceMsRef.current = silenceMs
    minRecordMsRef.current = minRecordMs
  }, [silenceMs, minRecordMs])
  const [isSupported] = useState(
    Boolean(navigator.mediaDevices && typeof MediaRecorder !== 'undefined'),
  )
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [inputLevel, setInputLevel] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const runningRef = useRef(false)
  const sessionIdRef = useRef(0)

  const silenceTimerRef = useRef<number | null>(null)
  const maxTimerRef = useRef<number | null>(null)
  const meterRafRef = useRef<number | null>(null)
  const meterCtxRef = useRef<AudioContext | null>(null)

  const lastAudioAtRef = useRef(0)
  const recordStartRef = useRef(0)
  const stoppingRef = useRef(false)
  const capturePausedRef = useRef(false)

  const onFinalRef = useRef(onFinalTranscript)
  const onStartRef = useRef(onSpeechStart)
  const onActivityR = useRef(onActivity)
  const onErrorRef = useRef(onError)
  const onSilentRef = useRef(onSilentCapture)
  useEffect(() => { onFinalRef.current = onFinalTranscript }, [onFinalTranscript])
  useEffect(() => { onStartRef.current = onSpeechStart }, [onSpeechStart])
  useEffect(() => { onActivityR.current = onActivity }, [onActivity])
  useEffect(() => { onErrorRef.current = onError }, [onError])
  useEffect(() => { onSilentRef.current = onSilentCapture }, [onSilentCapture])

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearInterval(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (maxTimerRef.current !== null) {
      window.clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
  }, [])

  const stopMeter = useCallback(() => {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current)
      meterRafRef.current = null
    }
    if (meterCtxRef.current) {
      void meterCtxRef.current.close().catch(() => {})
      meterCtxRef.current = null
    }
    setInputLevel(0)
  }, [])

  const stopRecorder = useCallback(() => {
    if (stoppingRef.current) return
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') return
    stoppingRef.current = true
    clearTimers()
    try {
      rec.requestData()
      rec.stop()
    } catch {
      stoppingRef.current = false
    }
  }, [clearTimers])

  const stopListening = useCallback(() => {
    runningRef.current = false
    capturePausedRef.current = false
    sessionIdRef.current += 1
    clearTimers()
    stopRecorder()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    stopMeter()
    setIsListening(false)
    setTranscript('')
  }, [clearTimers, stopMeter, stopRecorder])

  const pauseCapture = useCallback(() => {
    if (!runningRef.current) return
    capturePausedRef.current = true
    clearTimers()
    stopRecorder()
  }, [clearTimers, stopRecorder])

  const startMeter = useCallback((stream: MediaStream, sid: number) => {
    stopMeter()
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      void ctx.resume().catch(() => {})
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      meterCtxRef.current = ctx
      const buf = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!runningRef.current || sessionIdRef.current !== sid) return
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i += 1) {
          const n = (buf[i] - 128) / 128
          sum += n * n
        }
        const rms = Math.sqrt(sum / buf.length)
        setInputLevel(Math.min(1, rms * 6))
        if (rms > RMS_THRESHOLD) {
          lastAudioAtRef.current = Date.now()
          onActivityR.current?.()
          onStartRef.current?.()
        }
        meterRafRef.current = requestAnimationFrame(tick)
      }
      meterRafRef.current = requestAnimationFrame(tick)
    } catch {
      setInputLevel(0)
    }
  }, [stopMeter])

  const startCycle = useCallback((stream: MediaStream, sid: number) => {
    if (!runningRef.current || sessionIdRef.current !== sid) return

    stoppingRef.current = false
    const chunks: Blob[] = []
    recordStartRef.current = Date.now()
    lastAudioAtRef.current = Date.now()

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream)
    } catch {
      onErrorRef.current?.('Recording not supported on this device.')
      return
    }
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = async () => {
      stoppingRef.current = false
      setIsListening(false)
      if (!runningRef.current || sessionIdRef.current !== sid) return

      if (capturePausedRef.current) {
        capturePausedRef.current = false
        return
      }

      const blob = new Blob(chunks, { type: 'audio/webm' })

      if (blob.size < MIN_BLOB_BYTES) {
        onSilentRef.current?.()
        window.setTimeout(() => startCycle(stream, sid), CYCLE_RESTART_MS)
        return
      }

      try {
        const text = await transcribeLiveAudio(blob)
        const trimmed = text.trim()
        if (trimmed) {
          await Promise.resolve(onFinalRef.current(trimmed))
        } else {
          onSilentRef.current?.()
          if (runningRef.current && sessionIdRef.current === sid) {
            window.setTimeout(() => startCycle(stream, sid), CYCLE_RESTART_MS)
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Transcription failed.'
        if (!/too short|no speech detected|recording too short/i.test(msg)) {
          onErrorRef.current?.(msg)
        } else {
          onSilentRef.current?.()
        }
        if (runningRef.current && sessionIdRef.current === sid) {
          window.setTimeout(() => startCycle(stream, sid), CYCLE_RESTART_MS)
        }
      }
    }

    try {
      recorder.start(100)
    } catch {
      try {
        recorder.start()
      } catch {
        return
      }
    }
    setIsListening(true)

    silenceTimerRef.current = window.setInterval(() => {
      if (!runningRef.current || sessionIdRef.current !== sid) return
      if (Date.now() - recordStartRef.current < minRecordMsRef.current) return
      if (Date.now() - lastAudioAtRef.current >= silenceMsRef.current) stopRecorder()
    }, 50)

    maxTimerRef.current = window.setTimeout(() => stopRecorder(), MAX_RECORD_MS)
  }, [clearTimers, stopRecorder])

  const startListening = useCallback(async () => {
    if (runningRef.current) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onErrorRef.current?.('Live voice is not supported in this browser.')
      return
    }

    runningRef.current = true
    const sid = ++sessionIdRef.current

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch {
      runningRef.current = false
      onErrorRef.current?.('Microphone blocked. Allow mic access in browser settings.')
      return
    }

    if (!runningRef.current || sessionIdRef.current !== sid) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }

    streamRef.current = stream
    startMeter(stream, sid)
    startCycle(stream, sid)
  }, [startCycle, startMeter])

  const resumeCapture = useCallback(() => {
    const stream = streamRef.current
    const sid = sessionIdRef.current
    if (!runningRef.current || !stream) {
      void startListening()
      return
    }
    startCycle(stream, sid)
  }, [startCycle, startListening])

  /** End the current utterance now (orb tap) — same as 3s silence send. */
  const flushUtterance = useCallback(() => {
    if (!runningRef.current) return
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') {
      if (streamRef.current) startCycle(streamRef.current, sessionIdRef.current)
      return
    }
    capturePausedRef.current = false
    stopRecorder()
  }, [startCycle, stopRecorder])

  useEffect(() => () => stopListening(), [stopListening])

  return {
    isSupported,
    isListening,
    transcript,
    inputLevel,
    startListening,
    stopListening,
    pauseCapture,
    resumeCapture,
    flushUtterance,
  }
}
