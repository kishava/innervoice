import { useCallback, useEffect, useRef, useState } from 'react'
import { ConversationProvider, useConversation } from '@elevenlabs/react'
import type { DisconnectionDetails } from '@elevenlabs/client'
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { stripAudioTags } from '../../api/elevenlabs'
import { fetchConversationSignedUrl } from '../../api/liveConversation'
import { getGreetingResponse } from '../../api/openai'
import { useAuth } from '../../AuthContext'
import { useAudioOrb } from '../../contexts/AudioOrbContext'
import { BreathingVoiceOrb } from '../../components/BreathingVoiceOrb'
import { buildLiveConversationOverrides } from '../../lib/liveFutureSelfPrompt'
import { pickThinkingLabel } from '../../lib/thinkingLabels'
import { VoicePicker } from '../../components/VoicePicker'
import { ErrorPopup } from '../../components/ErrorPopup'
import type { UserVoice } from '../../types'

interface Props {
  voiceId: string | null
  voices?: UserVoice[]
  onSelectVoice?: (elevenlabsVoiceId: string) => void
  onManageVoices?: () => void
  onBack: () => void
}

type ConnectWaiter = {
  resolve: () => void
  reject: (error: Error) => void
  cancel: () => void
}

const LIVE_CALL_ENDED_HINT =
  'Call ended unexpectedly. Allow microphone access, confirm your voice in My voices, then try again.'
const LIVE_CONNECT_TIMEOUT_MS = 25_000
const LIVE_SESSION_SETUP_TIMEOUT_MS = 20_000
const LIVE_GREETING_TIMEOUT_MS = 7_000
const LIVE_FIRST_RESPONSE_FALLBACK_MS = 1_800
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), ms)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  })
}

function hasSecureLiveVoiceContext() {
  return window.isSecureContext || LOCAL_HOSTNAMES.has(window.location.hostname)
}

function isOpaqueDisconnectContext(context: unknown): boolean {
  if (!context || typeof context !== 'object') return false
  const record = context as Record<string, unknown>
  if ('isTrusted' in record && typeof record.isTrusted === 'boolean') return true
  if (record.type === 'error' && record.target != null) return true
  return false
}

function messageFromUnknownContext(context: unknown): string | null {
  if (typeof context === 'string') {
    const trimmed = context.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (!context || typeof context !== 'object') return null
  if (isOpaqueDisconnectContext(context)) return null
  const record = context as Record<string, unknown>
  for (const key of ['message', 'error', 'detail', 'reason'] as const) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function disconnectMessage(details?: DisconnectionDetails): string | null {
  if (!details) return null
  if (details.reason === 'user') return null

  if ('message' in details && typeof details.message === 'string') {
    const msg = details.message.trim()
    if (msg) return msg
  }

  if (details.reason === 'agent') {
    const fromContext =
      'context' in details ? messageFromUnknownContext(details.context) : null
    return fromContext
  }

  if (details.reason === 'error') {
    return 'Live call ended due to a connection error.'
  }

  return null
}

export function LiveTalkPage({ voiceId, voices, onSelectVoice, onManageVoices, onBack }: Props) {
  return (
    <ConversationProvider>
      <LiveTalkPageInner
        voiceId={voiceId}
        voices={voices}
        onSelectVoice={onSelectVoice}
        onManageVoices={onManageVoices}
        onBack={onBack}
      />
    </ConversationProvider>
  )
}

function LiveTalkPageInner({ voiceId, voices, onSelectVoice, onManageVoices, onBack }: Props) {
  const { user, userId } = useAuth()
  const { setOrbState } = useAudioOrb()
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [statusLabel, setStatusLabel] = useState('Tap below when you’re ready to talk')
  const [connectHint, setConnectHint] = useState<string | null>(null)
  const connectWaitRef = useRef<ConnectWaiter | null>(null)
  const endingRef = useRef(false)
  const hadConnectedRef = useRef(false)
  const lastDebugRef = useRef<string | null>(null)
  const heardAgentRef = useRef(false)
  const firstResponseTimerRef = useRef<number | null>(null)

  const cancelConnectWait = useCallback(() => {
    connectWaitRef.current?.cancel()
    connectWaitRef.current = null
  }, [])

  const cancelFirstResponseTimer = useCallback(() => {
    if (firstResponseTimerRef.current !== null) {
      window.clearTimeout(firstResponseTimerRef.current)
      firstResponseTimerRef.current = null
    }
  }, [])

  const rejectConnectWait = useCallback((message: string) => {
    connectWaitRef.current?.reject(new Error(message))
    connectWaitRef.current = null
  }, [])

  const syncOrb = useCallback(
    (status: string, speaking: boolean) => {
      if (status === 'connecting') {
        setOrbState('processing')
        return
      }
      if (status !== 'connected') {
        setOrbState('idle')
        return
      }
      setOrbState(speaking ? 'speaking' : 'listening')
    },
    [setOrbState],
  )

  const conversation = useConversation({
    micMuted,
    volume: 1,
    onConnect: () => {
      setError(null)
      setInCall(true)
      hadConnectedRef.current = true
      setConnecting(false)
    },
    onDisconnect: (details) => {
      setInCall(false)
      setConnecting(false)
      setOrbState('idle')
      if (connectWaitRef.current) {
        const detail = disconnectMessage(details) ?? lastDebugRef.current ?? LIVE_CALL_ENDED_HINT
        rejectConnectWait(detail)
        return
      }
      if (!endingRef.current && hadConnectedRef.current) {
        const detail = disconnectMessage(details) ?? lastDebugRef.current ?? LIVE_CALL_ENDED_HINT
        setError(detail)
      }
      hadConnectedRef.current = false
    },
    onError: (message) => {
      const detail = typeof message === 'string' ? message : 'Live voice connection failed.'
      setError(detail)
      setInCall(false)
      setConnecting(false)
      setOrbState('idle')
      rejectConnectWait(detail)
    },
    onMessage: (message) => {
      if (import.meta.env.DEV) console.debug('[LiveTalk message]', message)
      if (message.role === 'agent' || message.source === 'ai') {
        heardAgentRef.current = true
        cancelFirstResponseTimer()
      }
    },
    onAudio: () => {
      if (import.meta.env.DEV) console.debug('[LiveTalk audio]')
      heardAgentRef.current = true
      cancelFirstResponseTimer()
    },
    onModeChange: (mode) => {
      setOrbState(mode.mode === 'speaking' ? 'speaking' : 'listening')
    },
    onStatusChange: (status) => {
      if (status.status === 'connecting') setOrbState('processing')
      if (status.status === 'connected') {
        setInCall(true)
        setConnecting(false)
        setError(null)
        lastDebugRef.current = null
        connectWaitRef.current?.resolve()
        connectWaitRef.current = null
      }
      if (status.status === 'disconnected') {
        setInCall(false)
        setConnecting(false)
        if (connectWaitRef.current && !endingRef.current) {
          rejectConnectWait(lastDebugRef.current ?? LIVE_CALL_ENDED_HINT)
        }
      }
    },
    onDebug: (info) => {
      if (import.meta.env.DEV) console.debug('[LiveTalk]', info)
      if (typeof info === 'string' && info.trim()) {
        lastDebugRef.current = info.trim().slice(0, 280)
        return
      }
      if (info && typeof info === 'object') {
        const msg =
          'message' in info && typeof info.message === 'string'
            ? info.message
            : 'error' in info && typeof info.error === 'string'
              ? info.error
              : null
        if (msg) lastDebugRef.current = msg.slice(0, 280)
      }
    },
  })

  const connected = inCall || conversation.status === 'connected'
  const busy = connecting || conversation.status === 'connecting'
  const canToggleCall = Boolean(voiceId && userId)

  const orbState = busy
    ? 'processing'
    : connected
      ? conversation.isSpeaking
        ? 'speaking'
        : 'listening'
      : 'idle'

  useEffect(() => {
    syncOrb(conversation.status, conversation.isSpeaking)
  }, [conversation.status, conversation.isSpeaking, syncOrb])

  useEffect(() => {
    if (!busy && !connected) {
      setStatusLabel(
        voiceId ? 'Tap below when you’re ready to talk' : 'Pick a voice below or in My voices, then connect',
      )
      return undefined
    }
    if (busy) {
      if (connectHint) {
        setStatusLabel(connectHint)
        return undefined
      }
      setStatusLabel(pickThinkingLabel())
      const intervalId = window.setInterval(() => setStatusLabel(pickThinkingLabel()), 1300)
      return () => window.clearInterval(intervalId)
    }
    if (conversation.isSpeaking) {
      setStatusLabel('Speaking with you…')
      return undefined
    }
    setStatusLabel('Listening… say what’s on your mind')
    return undefined
  }, [busy, connected, connectHint, conversation.isSpeaking, voiceId])

  useEffect(() => {
    if (conversation.status === 'error' && conversation.message) {
      setError(conversation.message)
      setInCall(false)
      setConnecting(false)
      rejectConnectWait(conversation.message)
    }
  }, [conversation.message, conversation.status, rejectConnectWait])

  const waitUntilConnected = () =>
    new Promise<void>((resolve, reject) => {
      if (conversation.status === 'connected') {
        resolve()
        return
      }
      const timeoutId = window.setTimeout(() => {
        connectWaitRef.current = null
        reject(new Error('Live talk could not connect. Check microphone permission, then try again.'))
      }, LIVE_CONNECT_TIMEOUT_MS)
      connectWaitRef.current = {
        resolve: () => {
          window.clearTimeout(timeoutId)
          resolve()
        },
        reject: (err) => {
          window.clearTimeout(timeoutId)
          reject(err)
        },
        cancel: () => {
          window.clearTimeout(timeoutId)
        },
      }
    })

  const start = async () => {
    if (!voiceId || !userId || busy || connected) return
    if (!hasSecureLiveVoiceContext()) {
      setError('Live voice requires HTTPS or localhost. Open this app on http://127.0.0.1:5173, or use HTTPS for LAN access.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot start live voice because microphone access is unavailable. Try Chrome or Edge on localhost/HTTPS.')
      return
    }
    setConnecting(true)
    setConnectHint('Preparing your live voice...')
    setError(null)
    setInCall(false)
    setOrbState('processing')
    endingRef.current = false
    hadConnectedRef.current = false
    heardAgentRef.current = false
    cancelFirstResponseTimer()

    try {
      if (conversation.status !== 'disconnected') {
        conversation.endSession()
        await new Promise((r) => window.setTimeout(r, 300))
      }

      let firstMessage: string | undefined
      try {
        setConnectHint('Preparing your greeting...')
        const greetingTagged = await withTimeout(
          getGreetingResponse(user?.name),
          LIVE_GREETING_TIMEOUT_MS,
          'Greeting took too long.',
        )
        firstMessage = stripAudioTags(greetingTagged).trim() || undefined
      } catch {
        /* use shared fallback greeting */
      }
      const overrides = buildLiveConversationOverrides(user?.name, firstMessage, voiceId)

      setConnectHint('Preparing your live voice...')
      const signedUrl = await withTimeout(
        fetchConversationSignedUrl(voiceId),
        LIVE_SESSION_SETUP_TIMEOUT_MS,
        'Could not prepare the live voice session. Check your ElevenLabs/Supabase setup and try again.',
      )

      setConnectHint('Opening the live room...')
      const waitForConnected = waitUntilConnected()
      await conversation.startSession({
        signedUrl,
        connectionType: 'websocket',
        overrides,
        dynamicVariables: user?.name ? { user_name: user.name } : undefined,
      })

      await waitForConnected
      setConnectHint(null)
      setInCall(true)
      conversation.setVolume({ volume: 1 })
      conversation.sendUserActivity()
      firstResponseTimerRef.current = window.setTimeout(() => {
        firstResponseTimerRef.current = null
        if (!heardAgentRef.current && !endingRef.current) {
          try {
            conversation.sendUserMessage(
              'Start this live voice call now with a short warm greeting, then invite me to speak.',
            )
          } catch (sendError) {
            if (import.meta.env.DEV) console.debug('[LiveTalk fallback failed]', sendError)
          }
        }
      }, LIVE_FIRST_RESPONSE_FALLBACK_MS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start live call.')
      setInCall(false)
      setOrbState('idle')
      cancelConnectWait()
      try {
        conversation.endSession()
      } catch {
        /* ignore */
      }
    } finally {
      setConnecting(false)
      setConnectHint(null)
    }
  }

  const end = async () => {
    endingRef.current = true
    setError(null)
    cancelConnectWait()
    cancelFirstResponseTimer()
    try {
      conversation.endSession()
    } catch {
      /* ignore */
    }
    setInCall(false)
    setConnecting(false)
    setConnectHint(null)
    setOrbState('idle')
    hadConnectedRef.current = false
    window.setTimeout(() => {
      endingRef.current = false
    }, 300)
  }

  const toggleCall = () => {
    if (busy || connected) {
      void end()
      return
    }
    void start()
  }

  const toggleMute = () => {
    setMicMuted((prev) => !prev)
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ErrorPopup message={error} onClose={() => setError(null)} />
      <div className="live-talk-shell flex min-h-0 flex-1 flex-col items-center overflow-hidden px-3 py-2 sm:px-5 sm:py-3">
        <div className="live-talk-content flex h-full min-h-0 w-full max-w-3xl flex-col items-center justify-between gap-2 text-center">
          <header className="live-talk-header w-full shrink-0 space-y-1">
            <h2 className="live-talk-title text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
              Your Future Self is Here.
            </h2>
            <p className="live-talk-copy mx-auto max-w-sm text-sm leading-relaxed text-text-secondary">
              Same voice and presence as chat — speak naturally, like talking to someone who already knows you.
            </p>
          </header>

          {voices && voices.length > 0 && onSelectVoice && (
            <section className="live-talk-voice flex w-full shrink-0 flex-col items-center gap-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                Voice for this call
              </p>
              <VoicePicker
                voices={voices}
                activeVoiceId={voiceId}
                menuCentered
                onSelect={(id) => {
                  if (id !== voiceId) {
                    if (connected || busy) void end()
                    onSelectVoice(id)
                  }
                }}
                onManage={onManageVoices}
                disabled={busy || connected}
              />
            </section>
          )}

          <section className="live-talk-card flex min-h-0 w-full max-w-2xl flex-1 items-center justify-center rounded-2xl border border-border/80 bg-elevated/55 px-3 py-3 backdrop-blur-xl sm:px-5">
            <div className="flex min-h-0 flex-col items-center justify-center gap-2">
              <button
                type="button"
                onClick={toggleCall}
                disabled={!canToggleCall}
                aria-label={busy || connected ? 'Stop live call' : 'Start live call'}
                className="rounded-full border border-border/80 bg-elevated/80 p-1.5 shadow-[0_0_32px_var(--color-accent-soft)] transition hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-55"
              >
                <BreathingVoiceOrb
                  state={orbState}
                  emotion="hopeful"
                  level={connected ? (conversation.isSpeaking ? 0.9 : 0.35) : busy ? 0.45 : 0.2}
                  className="live-talk-orb h-24 w-24 sm:h-28 sm:w-28"
                />
              </button>
              <p className="live-talk-card-copy max-w-md text-sm leading-relaxed text-text-secondary">
                {connected
                  ? 'Hold the mic unmuted and talk. Your future self listens, then answers in your voice.'
                  : 'Allow microphone access when prompted. One tap connects you for a live back-and-forth.'}
              </p>
            </div>
          </section>

          <div className="live-talk-controls flex w-full max-w-sm shrink-0 flex-col items-center gap-2 pb-1">
            <p className="min-h-5 text-sm text-text-tertiary">
              {busy ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                  {statusLabel}
                </span>
              ) : (
                statusLabel
              )}
            </p>

            <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
              {!connected ? (
                <button
                  type="button"
                  onClick={toggleCall}
                  disabled={!canToggleCall}
                  className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium shadow-[0_0_24px_var(--color-accent-soft)] transition disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[16rem] ${
                    busy
                      ? 'border-red-500/45 bg-red-500/20 text-red-100 hover:bg-red-500/30'
                      : 'border-accent/60 bg-accent text-white hover:bg-accent-hover'
                  }`}
                >
                  {busy ? <PhoneOff size={16} /> : <Phone size={16} />}
                  {busy ? 'Stop connecting' : 'Connect with Your Future Self'}
                </button>
              ) : (
                <div className="flex w-full items-center justify-center gap-2.5 sm:w-auto">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/80 bg-elevated/90 text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
                    aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                  >
                    {micMuted ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void end()}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-red-500/40 bg-red-500/15 px-5 py-2.5 text-sm font-medium text-red-100 transition hover:bg-red-500/25 sm:flex-initial"
                  >
                    <PhoneOff size={16} />
                    End call
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-border/80 bg-elevated/90 px-4 py-2 text-sm text-text-secondary transition hover:border-accent/60 hover:text-text-primary sm:w-auto"
              >
                Back to chat
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
