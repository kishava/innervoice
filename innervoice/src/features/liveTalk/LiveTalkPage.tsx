import { useCallback, useEffect, useRef, useState } from 'react'
import { ConversationProvider, useConversation } from '@elevenlabs/react'
import type { DisconnectionDetails } from '@elevenlabs/client'
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { stripAudioTags } from '../../api/elevenlabs'
import { fetchConversationToken } from '../../api/liveConversation'
import { getGreetingResponse } from '../../api/openai'
import { useAuth } from '../../AuthContext'
import { useAudioOrb } from '../../contexts/AudioOrbContext'
import { BreathingVoiceOrb } from '../../components/BreathingVoiceOrb'
import { buildLiveConversationOverrides } from '../../lib/liveFutureSelfPrompt'
import { pickThinkingLabel } from '../../lib/thinkingLabels'
import { VoicePicker } from '../../components/VoicePicker'
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
}

const LIVE_CALL_ENDED_HINT =
  'Call ended unexpectedly. Allow microphone access, confirm your voice in My voices, then try again.'

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
  const { user } = useAuth()
  const { setOrbState } = useAudioOrb()
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [statusLabel, setStatusLabel] = useState('Tap below when you’re ready to talk')
  const connectWaitRef = useRef<ConnectWaiter | null>(null)
  const endingRef = useRef(false)
  const hadConnectedRef = useRef(false)
  const lastDebugRef = useRef<string | null>(null)

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
    onConnect: () => {
      setError(null)
      setInCall(true)
      hadConnectedRef.current = true
    },
    onDisconnect: (details) => {
      setInCall(false)
      setConnecting(false)
      setOrbState('idle')
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
      connectWaitRef.current?.reject(new Error(detail))
      connectWaitRef.current = null
    },
    onModeChange: (mode) => {
      setOrbState(mode.mode === 'speaking' ? 'speaking' : 'listening')
    },
    onStatusChange: (status) => {
      if (status.status === 'connecting') setOrbState('processing')
      if (status.status === 'connected') {
        setInCall(true)
        setError(null)
        lastDebugRef.current = null
        connectWaitRef.current?.resolve()
        connectWaitRef.current = null
      }
      if (status.status === 'disconnected') {
        setInCall(false)
        setConnecting(false)
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
  }, [busy, connected, conversation.isSpeaking, voiceId])

  useEffect(() => {
    if (conversation.status === 'error' && conversation.message) {
      setError(conversation.message)
      setInCall(false)
      setConnecting(false)
      connectWaitRef.current?.reject(new Error(conversation.message))
      connectWaitRef.current = null
    }
  }, [conversation.message, conversation.status])

  const waitUntilConnected = () =>
    new Promise<void>((resolve, reject) => {
      if (conversation.status === 'connected') {
        resolve()
        return
      }
      const timeoutId = window.setTimeout(() => {
        connectWaitRef.current = null
        reject(new Error('Connection timed out. Allow microphone access and try again.'))
      }, 60_000)
      connectWaitRef.current = {
        resolve: () => {
          window.clearTimeout(timeoutId)
          resolve()
        },
        reject: (err) => {
          window.clearTimeout(timeoutId)
          reject(err)
        },
      }
    })

  const start = async () => {
    if (!voiceId || busy || connected) return
    setConnecting(true)
    setError(null)
    setInCall(false)
    setOrbState('processing')
    endingRef.current = false
    hadConnectedRef.current = false

    try {
      if (conversation.status !== 'disconnected') {
        conversation.endSession()
        await new Promise((r) => window.setTimeout(r, 300))
      }

      const token = await fetchConversationToken(voiceId)
      let firstMessage: string | undefined
      try {
        const greetingTagged = await getGreetingResponse(user?.name)
        firstMessage = stripAudioTags(greetingTagged).trim() || undefined
      } catch {
        /* use shared fallback greeting */
      }
      const overrides = buildLiveConversationOverrides(user?.name, firstMessage)
      const waitForConnected = waitUntilConnected()

      conversation.startSession({
        conversationToken: token,
        connectionType: 'webrtc',
        overrides,
        dynamicVariables: user?.name ? { user_name: user.name } : undefined,
      })

      await waitForConnected
      setInCall(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start live call.')
      setInCall(false)
      setOrbState('idle')
      connectWaitRef.current = null
      try {
        conversation.endSession()
      } catch {
        /* ignore */
      }
    } finally {
      setConnecting(false)
    }
  }

  const end = async () => {
    endingRef.current = true
    setError(null)
    try {
      conversation.endSession()
    } catch {
      /* ignore */
    }
    setInCall(false)
    setConnecting(false)
    setOrbState('idle')
    endingRef.current = false
    hadConnectedRef.current = false
  }

  const toggleMute = () => {
    setMicMuted((prev) => !prev)
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-3 py-4 sm:px-5 sm:py-6">
        <div className="flex w-full max-w-md flex-col items-center gap-5 text-center sm:max-w-lg sm:gap-6">
          <header className="w-full space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              Your Future Self is Here.
            </h2>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-text-secondary">
              Same voice and presence as chat — speak naturally, like talking to someone who already knows you.
            </p>
          </header>

          {voices && voices.length > 0 && onSelectVoice && (
            <section className="flex w-full flex-col items-center gap-2">
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

          <section className="w-full rounded-2xl border border-border/80 bg-elevated/55 px-5 py-6 backdrop-blur-xl sm:px-6 sm:py-7">
            <div className="flex flex-col items-center gap-5">
              <div className="rounded-full border border-border/80 bg-elevated/80 p-2 shadow-[0_0_32px_var(--color-accent-soft)]">
                <BreathingVoiceOrb
                  state={orbState}
                  emotion="hopeful"
                  level={connected ? (conversation.isSpeaking ? 0.9 : 0.35) : busy ? 0.45 : 0.2}
                  className="h-32 w-32 sm:h-36 sm:w-36"
                />
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-text-secondary">
                {connected
                  ? 'Hold the mic unmuted and talk. Your future self listens, then answers in your voice.'
                  : 'Allow microphone access when prompted. One tap connects you for a live back-and-forth.'}
              </p>
            </div>
          </section>

          {error && (
            <p className="w-full rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
              {error}
            </p>
          )}

          <div className="flex w-full max-w-sm flex-col items-center gap-4">
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

            <div className="flex w-full flex-col items-stretch gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
              {!connected ? (
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={!voiceId || busy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-accent/60 bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_0_24px_var(--color-accent-soft)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[16rem]"
                >
                  <Phone size={16} />
                  {busy ? 'Connecting…' : 'Connect with Your Future Self'}
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
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-red-500/40 bg-red-500/15 px-5 py-3 text-sm font-medium text-red-100 transition hover:bg-red-500/25 sm:flex-initial"
                  >
                    <PhoneOff size={16} />
                    End call
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={onBack}
                className="inline-flex w-full items-center justify-center rounded-full border border-border/80 bg-elevated/90 px-4 py-2.5 text-sm text-text-secondary transition hover:border-accent/60 hover:text-text-primary sm:w-auto"
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
