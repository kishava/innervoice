import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConversationProvider, useConversation } from '@elevenlabs/react'
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { fetchConversationToken } from '../../api/liveConversation'
import { useAuth } from '../../AuthContext'
import { useAudioOrb } from '../../contexts/AudioOrbContext'
import { BreathingVoiceOrb } from '../../components/BreathingVoiceOrb'
import { buildLiveConversationOverrides } from '../../lib/liveFutureSelfPrompt'

interface Props {
  voiceId: string | null
  onBack: () => void
}

export function LiveTalkPage({ voiceId, onBack }: Props) {
  return (
    <ConversationProvider>
      <LiveTalkPageInner voiceId={voiceId} onBack={onBack} />
    </ConversationProvider>
  )
}

function LiveTalkPageInner({ voiceId, onBack }: Props) {
  const { user } = useAuth()
  const { setOrbState } = useAudioOrb()
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [micMuted, setMicMuted] = useState(false)

  const overrides = useMemo(
    () => (voiceId ? buildLiveConversationOverrides(voiceId, user?.name) : undefined),
    [voiceId, user?.name],
  )

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
    overrides,
    micMuted,
    onConnect: () => setError(null),
    onDisconnect: () => setOrbState('idle'),
    onError: (message) => setError(typeof message === 'string' ? message : 'Live voice connection failed.'),
    onModeChange: (mode) => {
      setOrbState(mode.mode === 'speaking' ? 'speaking' : 'listening')
    },
    onStatusChange: (status) => {
      if (status.status === 'connecting') setOrbState('processing')
      if (status.status === 'disconnected') setOrbState('idle')
    },
  })

  useEffect(() => {
    syncOrb(conversation.status, conversation.isSpeaking)
  }, [conversation.status, conversation.isSpeaking, syncOrb])

  useEffect(() => {
    return () => {
      void conversation.endSession()
      setOrbState('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
  }, [])

  const connected = conversation.status === 'connected'
  const busy = connecting || conversation.status === 'connecting'

  const start = async () => {
    if (!voiceId || busy || connected) return
    setConnecting(true)
    setError(null)
    setOrbState('processing')
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      const token = await fetchConversationToken()
      await conversation.startSession({
        conversationToken: token,
        connectionType: 'webrtc',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start live call.')
      setOrbState('idle')
    } finally {
      setConnecting(false)
    }
  }

  const end = async () => {
    try {
      await conversation.endSession()
    } catch {
      /* ignore */
    }
    setOrbState('idle')
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
