import { useCallback, useEffect, useRef, useState } from 'react'
import { ConversationProvider, useConversation } from '@elevenlabs/react'
import type { DisconnectionDetails } from '@elevenlabs/client'
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { fetchConversationToken } from '../../api/liveConversation'
import { useAuth } from '../../AuthContext'
import { useAudioOrb } from '../../contexts/AudioOrbContext'
import { BreathingVoiceOrb } from '../../components/BreathingVoiceOrb'
import { buildLiveConversationOverrides } from '../../lib/liveFutureSelfPrompt'
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

function disconnectMessage(details?: DisconnectionDetails): string | null {
  if (!details) return null
  if (details.reason === 'user') return null
  if (details.reason === 'error' && 'message' in details && typeof details.message === 'string') {
    return details.message
  }
  if (details.reason === 'agent' && 'context' in details && typeof details.context === 'string') {
    return details.context
  }
  if ('message' in details && typeof details.message === 'string' && details.message.trim()) {
    return details.message
  }
  try {
    const raw = JSON.stringify(details)
    if (raw && raw !== '{}' && raw.length > 2) return raw.slice(0, 280)
  } catch {
    /* ignore */
  }
  return null
}

export function LiveTalkPage({ voiceId, voices = [], onSelectVoice, onManageVoices, onBack }: Props) {
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

function LiveTalkPageInner({ voiceId, voices = [], onSelectVoice, onManageVoices, onBack }: Props) {
  const { user } = useAuth()
  const { setOrbState } = useAudioOrb()
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
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
        const detail =
          disconnectMessage(details) ??
          lastDebugRef.current ??
          'Call ended unexpectedly. Try My voices to pick a valid clone, or train a new voice.'
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

  useEffect(() => {
    syncOrb(conversation.status, conversation.isSpeaking)
  }, [conversation.status, conversation.isSpeaking, syncOrb])

  useEffect(() => {
    if (conversation.status === 'error' && conversation.message) {
      setError(conversation.message)
      setInCall(false)
      setConnecting(false)
      connectWaitRef.current?.reject(new Error(conversation.message))
      connectWaitRef.current = null
    }
  }, [conversation.message, conversation.status])

  const connected = inCall || conversation.status === 'connected'
  const busy = connecting || conversation.status === 'connecting'

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
      const overrides = buildLiveConversationOverrides(user?.name)
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
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-2 py-4 sm:px-4">
      <div className="text-center">
        <h2 className="text-lg font-medium text-text-primary">Talk to your future self</h2>
        <p className="mt-1 max-w-sm text-sm text-text-secondary">
          Live voice — speak naturally. Your cloned voice and personality are applied for this session.
        </p>
      </div>

      <BreathingVoiceOrb
        state={
          busy
            ? 'processing'
            : connected
              ? conversation.isSpeaking
                ? 'speaking'
                : 'listening'
              : 'idle'
        }
        className="h-40 w-40 sm:h-48 sm:w-48"
      />

      {error && (
        <p className="max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-sm text-red-200">
          {error}
        </p>
      )}

      <p className="text-center text-xs text-text-tertiary">
        {busy && 'Connecting…'}
        {!busy && connected && (conversation.isSpeaking ? 'Future self is speaking…' : 'Listening — say what’s on your mind')}
        {!busy && !connected && 'Tap start when you’re ready for a live call'}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {!connected ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={!voiceId || busy}
            className="inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-[0_0_24px_var(--color-accent-soft)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Phone size={16} />
            {busy ? 'Connecting…' : 'Start call'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMute}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/80 bg-elevated/90 text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
              aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {micMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              type="button"
              onClick={() => void end()}
              className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/15 px-5 py-2.5 text-sm font-medium text-red-100 transition hover:bg-red-500/25"
            >
              <PhoneOff size={16} />
              End call
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-border/80 bg-elevated/90 px-4 py-2.5 text-sm text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
        >
          Back to chat
        </button>
      </div>
    </div>
  )
}