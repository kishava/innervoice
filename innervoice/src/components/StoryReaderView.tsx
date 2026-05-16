import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { BookOpen, Pause, Play, Square, Upload } from 'lucide-react'
import { motion } from 'framer-motion'
import { BreathingVoiceOrb, type OrbEmotion } from './BreathingVoiceOrb'
import { useAudioOrb } from '../contexts/AudioOrbContext'
import { useStoryPlayback } from '../hooks/useStoryPlayback'
import { readScriptFile, STORY_SCRIPT_MAX_CHARS, splitStoryIntoChunks } from '../lib/storyChunks'
import type { Emotion } from '../types'

interface Props {
  voiceId: string | null
  onBack: () => void
}

const NARRATION_EMOTIONS: Emotion[] = ['neutral', 'hopeful', 'sad', 'anxious', 'grateful', 'angry', 'excited']

function orbEmotionForNarration(emotion: Emotion): OrbEmotion {
  if (emotion === 'neutral' || emotion === 'excited') return 'hopeful'
  if (emotion === 'angry' || emotion === 'anxious' || emotion === 'sad' || emotion === 'hopeful' || emotion === 'grateful') {
    return emotion
  }
  return 'hopeful'
}

const SAMPLE_SCRIPT = `Once upon a time, in a quiet town where the streetlights hummed like old friends, someone sat up late wondering if the future would be kind.

They did not know yet that the voice they needed was already inside them — older, softer, and still listening.

This is your story. Paste or upload your script, then press play. Your future self will read it in your own voice.`

function statusLabel(status: string, chunkIndex: number, total: number): string {
  switch (status) {
    case 'preparing':
      return total > 0 ? `Preparing part ${chunkIndex + 1} of ${total}…` : 'Preparing…'
    case 'playing':
      return `Reading part ${chunkIndex + 1} of ${total}…`
    case 'paused':
      return 'Paused'
    case 'done':
      return 'Finished'
    case 'error':
      return 'Something went wrong'
    default:
      return 'Ready to narrate'
  }
}

export function StoryReaderView({ voiceId, onBack }: Props) {
  const [script, setScript] = useState('')
  const [emotion, setEmotion] = useState<Emotion>('neutral')
  const [uploadName, setUploadName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const { connect, setOrbState } = useAudioOrb()
  const { status, chunks, chunkIndex, error, isActive, start, stop, pause, resume } = useStoryPlayback(
    voiceId,
    connect,
  )

  useEffect(() => {
    if (status === 'preparing') setOrbState('processing')
    else if (status === 'playing') setOrbState('speaking')
    else if (status === 'paused') setOrbState('listening')
    else setOrbState('idle')
  }, [setOrbState, status])

  const previewChunks = useMemo(() => splitStoryIntoChunks(script), [script])
  const charCount = script.length
  const canPlay = Boolean(voiceId && script.trim() && !isActive)

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return
    try {
      const text = await readScriptFile(file)
      setScript(text)
      setUploadName(file.name)
    } catch (err) {
      setUploadName(null)
      alert(err instanceof Error ? err.message : 'Could not read file.')
    }
  }, [])

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0] ?? null)
    event.target.value = ''
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    void handleFile(event.dataTransfer.files[0] ?? null)
  }

  const progress =
    previewChunks.length > 0 && (status === 'playing' || status === 'preparing' || status === 'paused')
      ? Math.min(100, ((chunkIndex + (status === 'playing' ? 0.35 : 0)) / previewChunks.length) * 100)
      : status === 'done'
        ? 100
        : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-0 flex-col gap-3"
    >
      <motion.div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary">
            <BookOpen size={16} className="text-accent" />
            Story Reader
          </p>
          <p className="mt-1 max-w-xl text-xs text-text-tertiary">
            Upload a script or paste text — your cloned voice narrates it in parts, with natural pauses between
            paragraphs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            stop()
            onBack()
          }}
          className="rounded-full border border-border bg-elevated px-3 py-1.5 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
        >
          ← Back to Chat
        </button>
      </motion.div>

      {!voiceId && (
        <p className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          Complete Voice Train first — narration uses your ElevenLabs voice clone.
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,360px)]">
        <div className="flex min-h-0 flex-col gap-2">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border/90 bg-elevated/50 px-3 py-2"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              className="sr-only"
              onChange={onFileInput}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isActive}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-card px-3 py-1.5 text-xs text-text-primary transition hover:border-accent/60 disabled:opacity-50"
            >
              <Upload size={14} />
              Upload script
            </button>
            <button
              type="button"
              disabled={isActive}
              onClick={() => {
                setScript(SAMPLE_SCRIPT)
                setUploadName(null)
              }}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary disabled:opacity-50"
            >
              Try sample
            </button>
            {uploadName && <span className="truncate text-xs text-text-tertiary">{uploadName}</span>}
            <span className="ml-auto text-xs text-text-tertiary">
              {charCount.toLocaleString()} / {STORY_SCRIPT_MAX_CHARS.toLocaleString()}
            </span>
          </div>

          <textarea
            value={script}
            onChange={(e) => {
              setScript(e.target.value.slice(0, STORY_SCRIPT_MAX_CHARS))
              setUploadName(null)
            }}
            disabled={isActive}
            placeholder="Paste your story, monologue, or script here…"
            className="min-h-[200px] flex-1 resize-none rounded-xl border border-border bg-input-bg/80 px-3 py-2.5 text-sm leading-relaxed text-text-primary placeholder:text-text-tertiary focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
          />

          {previewChunks.length > 0 && (
            <p className="text-xs text-text-tertiary">
              ~{previewChunks.length} audio {previewChunks.length === 1 ? 'part' : 'parts'} for this script
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-gradient-to-b from-surface-card to-elevated p-4">
          <div className="flex justify-center">
            <BreathingVoiceOrb
              state={
                status === 'playing'
                  ? 'speaking'
                  : status === 'preparing'
                    ? 'processing'
                    : status === 'paused'
                      ? 'idle'
                      : 'listening'
              }
              emotion={orbEmotionForNarration(emotion)}
              level={status === 'playing' ? 0.75 : status === 'preparing' ? 0.4 : 0.15}
              size={120}
            />
          </div>

          <label className="text-xs text-text-tertiary">
            Narration mood
            <select
              value={emotion}
              disabled={isActive}
              onChange={(e) => setEmotion(e.target.value as Emotion)}
              className="mt-1 w-full rounded-lg border border-border bg-elevated px-2 py-2 text-sm text-text-primary"
            >
              {NARRATION_EMOTIONS.map((e) => (
                <option key={e} value={e}>
                  {e.charAt(0).toUpperCase() + e.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <div className="h-1.5 overflow-hidden rounded-full bg-border/60">
            <motion.div
              className="h-full rounded-full bg-accent"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.25 }}
            />
          </div>
          <p className="text-center text-sm text-text-secondary">
            {statusLabel(status, chunkIndex, chunks.length || previewChunks.length)}
          </p>

          {error && (
            <p className="rounded-lg border border-danger/40 bg-danger-soft px-2 py-1.5 text-xs text-danger">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            {status === 'idle' || status === 'done' || status === 'error' ? (
              <button
                type="button"
                disabled={!canPlay}
                onClick={() => start({ script: script.trim(), emotion })}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent px-4 py-2 text-sm font-medium text-white shadow-[0_0_20px_var(--color-accent-soft)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play size={16} />
                {status === 'done' ? 'Play again' : 'Read story'}
              </button>
            ) : status === 'paused' ? (
              <button
                type="button"
                onClick={resume}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent px-4 py-2 text-sm font-medium text-white"
              >
                <Play size={16} />
                Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={pause}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-4 py-2 text-sm text-text-primary"
              >
                <Pause size={16} />
                Pause
              </button>
            )}
            {isActive && (
              <button
                type="button"
                onClick={stop}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-4 py-2 text-sm text-text-secondary"
              >
                <Square size={14} />
                Stop
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
