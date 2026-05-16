import { useCallback, useEffect, useRef, useState } from 'react'
import { textToSpeech } from '../api/elevenlabs'
import { splitStoryIntoChunks } from '../lib/storyChunks'
import type { Emotion } from '../types'

export type StoryPlaybackStatus = 'idle' | 'preparing' | 'playing' | 'paused' | 'done' | 'error'

interface StartOptions {
  script: string
  emotion: Emotion
}

export function useStoryPlayback(voiceId: string | null) {
  const [status, setStatus] = useState<StoryPlaybackStatus>('idle')
  const [chunks, setChunks] = useState<string[]>([])
  const [chunkIndex, setChunkIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const abortedRef = useRef(false)
  const pausedRef = useRef(false)
  const prefetchRef = useRef<Map<number, Blob>>(new Map())
  const runIdRef = useRef(0)

  const clearAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    abortedRef.current = true
    pausedRef.current = false
    runIdRef.current += 1
    clearAudio()
    prefetchRef.current.clear()
    setStatus('idle')
    setChunkIndex(0)
    setChunks([])
    setError(null)
  }, [clearAudio])

  const pause = useCallback(() => {
    if (status !== 'playing') return
    pausedRef.current = true
    audioRef.current?.pause()
    setStatus('paused')
  }, [status])

  const resume = useCallback(() => {
    if (status !== 'paused') return
    pausedRef.current = false
    const audio = audioRef.current
    if (audio && !audio.ended) {
      setStatus('playing')
      void audio.play().catch(() => setStatus('paused'))
      return
    }
    setStatus('playing')
  }, [status])

  const fetchChunkAudio = useCallback(
    async (index: number, parts: string[], emotion: Emotion, runId: number) => {
      const cached = prefetchRef.current.get(index)
      if (cached) return cached
      const blob = await textToSpeech(parts[index], voiceId!, emotion)
      if (runIdRef.current !== runId || abortedRef.current) return null
      prefetchRef.current.set(index, blob)
      return blob
    },
    [voiceId],
  )

  const playBlob = useCallback(
    (blob: Blob, runId: number) =>
      new Promise<void>((resolve, reject) => {
        if (abortedRef.current || runIdRef.current !== runId) {
          resolve()
          return
        }
        clearAudio()
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio

        audio.onended = () => {
          clearAudio()
          resolve()
        }
        audio.onerror = () => {
          clearAudio()
          reject(new Error('Audio playback failed.'))
        }

        void audio.play().catch(reject)
      }),
    [clearAudio],
  )

  const waitWhilePaused = useCallback(async (runId: number) => {
    while (pausedRef.current && !abortedRef.current && runIdRef.current === runId) {
      await new Promise((r) => window.setTimeout(r, 120))
    }
  }, [])

  const runPlayback = useCallback(
    async ({ script, emotion }: StartOptions) => {
      if (!voiceId) {
        setError('Complete Voice Train first so your clone can narrate.')
        setStatus('error')
        return
      }

      const parts = splitStoryIntoChunks(script)
      if (parts.length === 0) {
        setError('Add some script text to narrate.')
        setStatus('error')
        return
      }

      abortedRef.current = false
      pausedRef.current = false
      const runId = ++runIdRef.current
      prefetchRef.current.clear()
      setChunks(parts)
      setChunkIndex(0)
      setError(null)
      setStatus('preparing')

      try {
        for (let i = 0; i < parts.length; i += 1) {
          if (abortedRef.current || runIdRef.current !== runId) return

          setChunkIndex(i)
          setStatus('preparing')

          const blob = await fetchChunkAudio(i, parts, emotion, runId)
          if (!blob || abortedRef.current || runIdRef.current !== runId) return

          if (i + 1 < parts.length) {
            void fetchChunkAudio(i + 1, parts, emotion, runId).catch(() => {})
          }

          await waitWhilePaused(runId)
          if (abortedRef.current || runIdRef.current !== runId) return

          setStatus('playing')
          await playBlob(blob, runId)
          prefetchRef.current.delete(i)

          await waitWhilePaused(runId)
        }

        if (!abortedRef.current && runIdRef.current === runId) {
          setStatus('done')
        }
      } catch (err) {
        if (abortedRef.current || runIdRef.current !== runId) return
        setError(err instanceof Error ? err.message : 'Story narration failed.')
        setStatus('error')
      }
    },
    [fetchChunkAudio, playBlob, voiceId, waitWhilePaused],
  )

  const start = useCallback(
    (options: StartOptions) => {
      stop()
      abortedRef.current = false
      void runPlayback(options)
    },
    [runPlayback, stop],
  )

  useEffect(() => () => {
    abortedRef.current = true
    clearAudio()
    prefetchRef.current.clear()
  }, [clearAudio])

  const isActive = status === 'preparing' || status === 'playing' || status === 'paused'

  return {
    status,
    chunks,
    chunkIndex,
    error,
    isActive,
    start,
    stop,
    pause,
    resume,
  }
}
