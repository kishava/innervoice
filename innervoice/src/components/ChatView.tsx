import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Lightbulb, Pause, Play, Send } from 'lucide-react'
import type { Message } from '../types'
import { FollowUpSuggestions } from './FollowUpSuggestions'
import { VoiceInput } from './VoiceInput'
import { useAudioVisualizer } from '../hooks/useAudioVisualizer'
import { BreathingVoiceOrb } from './BreathingVoiceOrb'

interface Props {
  messages: Message[]
  isProcessing: boolean
  showThinking: boolean
  thinkingLabel: string
  onSend: (text: string) => void
}

function VisualBars({ levels }: { levels: number[] }) {
  return (
    <div className="ml-3 hidden items-end gap-1 min-[380px]:flex">
      {levels.map((level, index) => (
        <span
          key={`${index}-${Math.round(level * 100)}`}
          className="w-1 rounded bg-accent"
          style={{ height: `${Math.max(6, level * 24)}px` }}
        />
      ))}
    </div>
  )
}

export function ChatView({ messages, isProcessing, showThinking, thinkingLabel, onSend }: Props) {
  const [input, setInput] = useState('')
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(true)
  const [assistantSpeaking, setAssistantSpeaking] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const logRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const { levels, connect } = useAudioVisualizer()
  const maxChars = 1000
  const remaining = maxChars - input.length
  const lastAssistantMessageId = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant')?.id,
    [messages],
  )

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [messages, isProcessing, thinkingLabel])

  const canSend = useMemo(() => input.trim().length > 0 && !isProcessing, [input, isProcessing])
  const isLanding = messages.length === 0 && !isProcessing

  const send = () => {
    const text = input.trim()
    if (!text || isProcessing) return
    onSend(text)
    setInput('')
  }

  if (isLanding) {
    return (
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-40 bg-[radial-gradient(circle_at_center,rgb(127_157_255_/_0.4),transparent_68%)] blur-2xl lg:block" />
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-40 bg-[radial-gradient(circle_at_center,rgb(127_157_255_/_0.4),transparent_68%)] blur-2xl lg:block" />

        <section className="mx-auto w-full max-w-4xl px-2 pt-4 text-center sm:pt-6">
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-5xl">Your Future Self is Here.</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-text-secondary sm:text-base">
            InnerVoice is your personal conversational self-discovery AI.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
            className="mt-4 rounded-full border border-accent/40 bg-elevated/80 px-5 py-2 text-sm font-medium text-text-primary shadow-[0_0_24px_var(--color-accent-soft)] transition hover:border-accent/60"
          >
            Connect with Your Future Self
          </button>
        </section>

        <section className="mx-auto mt-4 flex w-full max-w-4xl flex-1 min-h-0 flex-col rounded-2xl border border-border/80 bg-elevated/55 p-3 backdrop-blur-xl sm:p-4">
          <div className="grid gap-2 rounded-xl border border-border/70 bg-surface-card/25 p-2.5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3">
            <div>
              <p className="text-sm leading-snug text-text-secondary">
                Tap to talk, let your voice clone guide you. Open the lightbulb for ideas.
              </p>
              <div className="mt-2 inline-flex items-center rounded-full border border-accent/35 px-2.5 py-1 text-xs text-text-primary">
                Voice mode: <span className="ml-1 text-accent">{voiceModeEnabled ? 'ON' : 'OFF'}</span>
              </div>
            </div>
            <div className="mx-auto rounded-full border border-border/80 bg-elevated/80 p-1.5 shadow-[0_0_26px_var(--color-accent-soft)]">
              <BreathingVoiceOrb
                state={assistantSpeaking ? 'speaking' : isProcessing ? 'processing' : 'listening'}
                emotion="hopeful"
                level={assistantSpeaking ? 0.9 : isProcessing ? 0.45 : 0.2}
                size={100}
              />
            </div>
          </div>

          <div className="mt-2 rounded-xl border border-border/70 bg-input-bg/65 p-2.5">
            <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-end gap-2">
              <button
                type="button"
                aria-label="Open question suggestions"
                onClick={() => setSuggestionsOpen(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-elevated text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
              >
                <Lightbulb size={16} />
              </button>
              <VoiceInput
                disabled={isProcessing || assistantSpeaking}
                onTranscript={(text) => {
                  if (!text.trim()) return
                  if (voiceModeEnabled && !isProcessing && !assistantSpeaking) {
                    onSend(text)
                    return
                  }
                  setInput((prev) => (prev ? `${prev} ${text}` : text).trim())
                }}
              />
              <div className="min-w-0 flex-1">
                <textarea
                  ref={inputRef}
                  value={input}
                  maxLength={maxChars}
                  rows={2}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      send()
                    }
                  }}
                  placeholder="Say what is on your mind..."
                  className="min-h-[48px] w-full resize-none rounded-xl border border-border bg-input-bg px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent/60"
                />
              </div>
              <button
                type="button"
                aria-label="Send message"
                onClick={send}
                disabled={!canSend}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-accent/45 bg-accent-soft text-text-primary transition hover:scale-[1.03] disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="inline-flex items-center rounded-full border border-border px-2 py-1 text-[11px] text-text-secondary">
                <VisualBars levels={levels} />
              </div>
              <p className="text-xs text-text-tertiary">{remaining} characters left</p>
            </div>
          </div>
        </section>

        <FollowUpSuggestions open={suggestionsOpen} onClose={() => setSuggestionsOpen(false)} onSelect={onSend} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        className="glass-panel min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border/80 p-3"
      >
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className={`rounded-2xl border p-3 ${
                message.role === 'user'
                  ? 'ml-auto max-w-[92%] border-accent/35 bg-accent-soft/90 sm:max-w-[82%]'
                  : 'mr-auto max-w-[92%] border-border/80 bg-assistant-bubble sm:max-w-[82%]'
              }`}
            >
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">{message.text}</p>
              {message.emotion && message.role === 'user' && (
                <p className="mt-1 text-xs italic text-text-tertiary">Emotion: {message.emotion}</p>
              )}
              {message.audioUrl && (
                <AudioBubble
                  audioUrl={message.audioUrl}
                  onConnect={connect}
                  levels={levels}
                  autoPlay={voiceModeEnabled && lastAssistantMessageId === message.id}
                  onSpeakingChange={setAssistantSpeaking}
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {showThinking && (
          <div className="animate-fade-in rounded-xl border border-accent/25 bg-elevated/90 p-3 text-sm text-text-secondary">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              {thinkingLabel}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-end gap-2">
        <button
          type="button"
          aria-label="Open question suggestions"
          onClick={() => setSuggestionsOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-elevated text-text-secondary transition hover:border-accent/60 hover:text-text-primary sm:h-12 sm:w-12"
        >
          <Lightbulb size={18} />
        </button>
        <VoiceInput
          disabled={isProcessing || assistantSpeaking}
          onTranscript={(text) => {
            if (!text.trim()) return
            if (voiceModeEnabled && !isProcessing && !assistantSpeaking) {
              onSend(text)
              return
            }
            setInput((prev) => (prev ? `${prev} ${text}` : text).trim())
          }}
        />
        <div className="min-w-0 flex-1">
          <textarea
            ref={inputRef}
            value={input}
            maxLength={maxChars}
            rows={2}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            placeholder="Say what is on your mind…"
            className="min-h-[46px] w-full resize-none rounded-xl border border-border bg-input-bg px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent/60 sm:min-h-[48px]"
          />
          <p className="mt-1 hidden text-right text-xs text-text-tertiary sm:block">{remaining} characters left</p>
        </div>
        <button
          type="button"
          aria-label="Send message"
          onClick={send}
          disabled={!canSend}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white shadow-[0_0_20px_var(--color-accent-soft)] transition hover:scale-[1.03] disabled:opacity-50 sm:h-12 sm:w-12"
        >
          <Send size={18} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-elevated/85 px-3 py-2">
        <p className="text-xs text-text-secondary">{voiceModeEnabled ? 'Voice mode is ON' : 'Voice mode is OFF'}</p>
        <button
          type="button"
          onClick={() => setVoiceModeEnabled((prev) => !prev)}
          className="whitespace-nowrap rounded-full border border-border bg-input-bg px-3 py-1 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
        >
          {voiceModeEnabled ? 'Disable' : 'Enable'}
        </button>
      </div>

      <FollowUpSuggestions open={suggestionsOpen} onClose={() => setSuggestionsOpen(false)} onSelect={onSend} />
    </div>
  )
}

function AudioBubble({
  audioUrl,
  onConnect,
  levels,
  autoPlay,
  onSpeakingChange,
}: {
  audioUrl: string
  onConnect: (audio: HTMLAudioElement) => void
  levels: number[]
  autoPlay?: boolean
  onSpeakingChange?: (playing: boolean) => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!autoPlay) return
    const element = audioRef.current
    if (!element) return
    void element.play().catch(() => {})
  }, [autoPlay])

  return (
    <div className="mt-2 flex max-w-full items-center overflow-hidden">
      <audio
        ref={audioRef}
        src={audioUrl}
        onPlay={(event) => {
          setPlaying(true)
          onSpeakingChange?.(true)
          onConnect(event.currentTarget)
        }}
        onPause={() => {
          setPlaying(false)
          onSpeakingChange?.(false)
        }}
        onEnded={() => {
          setPlaying(false)
          onSpeakingChange?.(false)
        }}
      />
      <button
        type="button"
        aria-label={playing ? 'Pause response audio' : 'Play response audio'}
        onClick={() => {
          const element = audioRef.current
          if (!element) return
          if (element.paused) {
            void element.play()
          } else {
            element.pause()
          }
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-elevated px-3 py-1 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
      >
        {playing ? <Pause size={12} /> : <Play size={12} />}
        {playing ? 'Pause' : 'Play'}
      </button>
      <VisualBars levels={levels} />
    </div>
  )
}
