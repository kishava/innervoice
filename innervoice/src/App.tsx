import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { cloneVoice, getLastTtsBackend, stripAudioTags, textToSpeech } from './api/elevenlabs'
import { detectEmotion, getFutureSelfResponse, getGreetingResponse } from './api/openai'
import { useAuth } from './AuthContext'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { useUserVoices } from './hooks/useUserVoices'
import { VoicesView } from './components/VoicesView'
import { AuthScreen } from './components/AuthScreen'
import { ChatView } from './components/ChatView'
import { CloningView } from './components/CloningView'
import { HistoryPanel } from './components/HistoryPanel'
import { Navbar } from './components/Navbar'
import { ProfilePanel } from './components/ProfilePanel'
import { OnboardingOverlay } from './components/OnboardingOverlay'
import { RecordingView } from './components/RecordingView'
import { StoryReaderView } from './components/StoryReaderView'
import { LiveTalkPage } from './features/liveTalk/LiveTalkPage'
import { TalkDebugBoundary } from './features/liveTalk/TalkDebugBoundary'
import { useConversations } from './hooks/useConversations'
import type { AppStep, Emotion, Message } from './types'

const ONBOARDED_KEY = 'innervoice-onboarded'
const THINKING_LABELS = [
  'Listening...',
  'Taking that in...',
  'Finding the right words...',
  'Breathing with you for a second...',
]
const HEAVY_EMOTIONS = new Set<Emotion>(['anxious', 'sad', 'fearful', 'stressed', 'grieving', 'hurt', 'lonely'])

function pickInitialStep(isAuthenticated: boolean): AppStep {
  if (!isAuthenticated) return 'auth'
  return 'chat'
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickThinkingLabel(emotion?: Emotion) {
  if (emotion && HEAVY_EMOTIONS.has(emotion)) {
    return Math.random() > 0.5 ? 'Taking that in...' : 'Breathing with you for a second...'
  }
  return THINKING_LABELS[randomBetween(0, THINKING_LABELS.length - 1)]
}

function thinkingDelayForEmotion(emotion: Emotion) {
  return HEAVY_EMOTIONS.has(emotion) ? randomBetween(1500, 2400) : randomBetween(900, 1800)
}

function revealChunks(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ['I am here with you.']
  return normalized.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map((chunk) => chunk.trim()) ?? [normalized]
}

async function revealAssistantMessage(
  messageId: string,
  text: string,
  setMessages: Dispatch<SetStateAction<Message[]>>,
) {
  let visibleText = ''
  const chunks = revealChunks(text)

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    visibleText = visibleText ? `${visibleText} ${chunk}` : chunk
    setMessages((prev) => prev.map((message) => (message.id === messageId ? { ...message, text: visibleText } : message)))

    if (index < chunks.length - 1) {
      await wait(Math.min(950, Math.max(360, chunk.length * 14)))
    }
  }
}

export default function App() {
  const { user, isAuthenticated, setUserVoiceId } = useAuth()
  const voiceId = user?.voiceId ?? null
  const [authUserId, setAuthUserId] = useState<string | null>(null)

  const { voices, addVoice, renameVoice, deleteVoice } = useUserVoices(authUserId, voiceId)
  const hasTrainedVoice = Boolean(voiceId) || voices.length > 0

  const [step, setStep] = useState<AppStep>(() => pickInitialStep(isAuthenticated))
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [showThinking, setShowThinking] = useState(false)
  const [thinkingLabel, setThinkingLabel] = useState(THINKING_LABELS[0])
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem(ONBOARDED_KEY))

  const { conversations, activeId, setActiveId, saveConversation, loadConversation, deleteConversation } =
    useConversations()

  const greetedFor = useRef<string | null>(null)
  const showedV2FallbackWarning = useRef(false)

  const hasBackend = isSupabaseConfigured
  const demoMode = !hasBackend

  useEffect(() => {
    if (!supabase || !isAuthenticated) {
      setAuthUserId(null)
      return
    }
    void supabase.auth.getUser().then(({ data }) => setAuthUserId(data.user?.id ?? null))
  }, [isAuthenticated])

  const selectVoice = useCallback(
    (nextVoiceId: string) => {
      setUserVoiceId(nextVoiceId)
      greetedFor.current = null
    },
    [setUserVoiceId],
  )

  // Sync step with auth/voice state when those external values change.
  useEffect(() => {
    if (!isAuthenticated) {
      setStep('auth')
      setMessages([])
      return
    }
    setStep((current) => (current === 'auth' || current === 'home' ? 'chat' : current))
  }, [isAuthenticated, voiceId])

  useEffect(() => {
    if (voiceId && messages.length > 0) {
      saveConversation(voiceId, messages)
    }
  }, [messages, saveConversation, voiceId])

  useEffect(() => {
    if (!showThinking) return undefined

    const intervalId = window.setInterval(() => {
      setThinkingLabel(pickThinkingLabel())
    }, 1300)

    return () => window.clearInterval(intervalId)
  }, [showThinking])

  const speakGreeting = useCallback(async () => {
    if (!voiceId || !user) return
    if (greetedFor.current === voiceId) return
    greetedFor.current = voiceId
    try {
      setIsProcessing(true)
      const greetingWithTags = await getGreetingResponse(user.name)
      const audioBlob = await textToSpeech(greetingWithTags, voiceId, 'hopeful')
      if (getLastTtsBackend() === 'speech_v2_fallback' && !showedV2FallbackWarning.current) {
        showedV2FallbackWarning.current = true
        setError('Eleven v3 is unavailable right now, so voice fell back to v2 (reduced emotional tags).')
      }
      const greeting: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: stripAudioTags(greetingWithTags),
        timestamp: Date.now(),
        audioUrl: URL.createObjectURL(audioBlob),
      }
      setMessages((prev) => (prev.length === 0 ? [greeting] : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate greeting.')
    } finally {
      setIsProcessing(false)
    }
  }, [user, voiceId])

  // Greet the user once they reach the chat with a cloned voice and no active conversation.
  useEffect(() => {
    if (step !== 'chat') return
    if (!voiceId) return
    if (activeId) return
    if (messages.length > 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void speakGreeting()
  }, [activeId, messages.length, speakGreeting, step, voiceId])

  const resetApp = useCallback(() => {
    messages.forEach((message) => {
      if (message.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(message.audioUrl)
    })
    setMessages([])
    setError(null)
    setActiveId(null)
    greetedFor.current = null
    setStep(isAuthenticated ? (voiceId ? 'chat' : 'recording') : 'auth')
  }, [isAuthenticated, messages, setActiveId, voiceId])

  const handleSendMessage = useCallback(
    async (text: string) => {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        timestamp: Date.now(),
        emotion: detectEmotion(text),
      }
      const userEmotion = userMessage.emotion ?? 'neutral'
      const updatedMessages = [...messages, userMessage]
      setMessages(updatedMessages)
      setIsProcessing(true)
      setShowThinking(true)
      setThinkingLabel(pickThinkingLabel(userEmotion))
      setError(null)
      try {
        const startedAt = Date.now()
        const responseTextWithTags = await getFutureSelfResponse(updatedMessages)
        await wait(Math.max(0, thinkingDelayForEmotion(userEmotion) - (Date.now() - startedAt)))

        const assistantMessageId = crypto.randomUUID()
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          text: '',
          timestamp: Date.now(),
        }
        const audioPromise = voiceId
          ? textToSpeech(responseTextWithTags, voiceId, userEmotion)
              .then((audioBlob) => ({ audioBlob, audioError: null as unknown }))
              .catch((audioError: unknown) => ({ audioBlob: null, audioError }))
          : Promise.resolve({ audioBlob: null as Blob | null, audioError: null as unknown })

        setMessages((prev) => [...prev, assistantMessage])
        setShowThinking(false)
        await revealAssistantMessage(assistantMessageId, stripAudioTags(responseTextWithTags), setMessages)

        const { audioBlob, audioError } = await audioPromise
        if (audioError) throw audioError
        if (audioBlob) {
          if (getLastTtsBackend() === 'speech_v2_fallback' && !showedV2FallbackWarning.current) {
            showedV2FallbackWarning.current = true
            setError('Eleven v3 is unavailable right now, so voice fell back to v2 (reduced emotional tags).')
          }
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId ? { ...message, audioUrl: URL.createObjectURL(audioBlob) } : message,
            ),
          )
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong while sending your message.')
      } finally {
        setShowThinking(false)
        setIsProcessing(false)
      }
    },
    [messages, voiceId],
  )

  const currentConversationTitle = useMemo(() => {
    const activeConversation = conversations.find((item) => item.id === activeId)
    return activeConversation?.title ?? 'New Conversation'
  }, [activeId, conversations])

  const visibleError =
    error ??
    (!hasBackend
      ? 'Missing Supabase config in .env. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      : null)

  const navigate = useCallback(
    (next: AppStep) => {
      if (next === 'recording') {
        greetedFor.current = null
      }
      if (next === 'live') {
        // #region agent log
        fetch('http://127.0.0.1:7557/ingest/69d83c9c-05f0-432b-b66d-2c89382c215d', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0d719b' },
          body: JSON.stringify({
            sessionId: '0d719b',
            runId: 'pre-fix',
            hypothesisId: 'H2',
            location: 'App.tsx:navigate',
            message: 'navigate to live',
            data: { hasVoiceId: Boolean(voiceId) },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
      }
      setStep(next)
    },
    [voiceId],
  )

  useEffect(() => {
    if (step !== 'live') return
    // #region agent log
    fetch('http://127.0.0.1:7557/ingest/69d83c9c-05f0-432b-b66d-2c89382c215d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0d719b' },
      body: JSON.stringify({
        sessionId: '0d719b',
        runId: 'pre-fix',
        hypothesisId: 'H2,H3,H5',
        location: 'App.tsx:liveStepEffect',
        message: 'live step active',
        data: { hasVoiceId: Boolean(voiceId), isAuthenticated },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }, [step, voiceId, isAuthenticated])

  return (
    <div className="orb-bg nebula-bg tech-grid relative min-h-dvh overflow-x-hidden bg-surface text-text-primary transition-colors duration-300">
      <OnboardingOverlay
        open={showOnboarding && isAuthenticated}
        step={onboardingStep}
        onNext={() => setOnboardingStep((prev) => Math.min(prev + 1, 2))}
        onBack={() => setOnboardingStep((prev) => Math.max(prev - 1, 0))}
        onSkip={() => {
          localStorage.setItem(ONBOARDED_KEY, 'true')
          setShowOnboarding(false)
        }}
        onFinish={() => {
          localStorage.setItem(ONBOARDED_KEY, 'true')
          setShowOnboarding(false)
        }}
      />

      <ProfilePanel
        open={showProfile}
        onClose={() => setShowProfile(false)}
        voiceCount={voices.length}
        onOpenVoices={() => {
          setShowProfile(false)
          navigate('voices')
        }}
      />

      <HistoryPanel
        open={showHistory}
        conversations={conversations}
        activeId={activeId}
        onClose={() => setShowHistory(false)}
        onDelete={deleteConversation}
        onSelect={(id) => {
          const conversation = loadConversation(id)
          if (!conversation) return
          setUserVoiceId(conversation.voiceId)
          setMessages(conversation.messages)
          setStep('chat')
          setActiveId(id)
          setShowHistory(false)
          greetedFor.current = conversation.voiceId
        }}
        onNewConversation={() => {
          setActiveId(null)
          setMessages([])
          setStep('chat')
          setShowHistory(false)
          greetedFor.current = null
        }}
      />

      <main className="relative z-10 mx-auto flex h-dvh w-full max-w-[1500px] flex-col overflow-hidden px-3 py-2 sm:px-4 sm:py-3 lg:px-6">
        <Navbar
          step={step}
          hasHistory={conversations.length > 0}
          hasVoice={hasTrainedVoice}
          onNavigate={navigate}
          onOpenHistory={() => setShowHistory(true)}
          onOpenProfile={() => setShowProfile(true)}
        />

        <div className="mb-2 flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary">
          <div className="flex min-w-0 items-center gap-2">
            {demoMode && (
              <span className="shrink-0 rounded-full border border-danger/40 bg-danger-soft px-2 py-0.5 text-danger">
                Demo Mode
              </span>
            )}
            {step === 'chat' && messages.length > 0 && <span className="truncate">{currentConversationTitle}</span>}
          </div>
        </div>

        {visibleError && (
          <div className="mb-2 rounded-xl border border-danger/40 bg-danger-soft p-2.5 text-sm text-danger">
            <div className="flex items-start justify-between gap-2">
              <p>{visibleError}</p>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
                className="text-xs text-danger"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <motion.section
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={`min-h-0 flex-1 overflow-hidden ${
            step === 'chat'
              ? 'rounded-2xl border border-transparent bg-transparent p-0 shadow-none'
              : 'glass-panel glow-accent rounded-3xl border border-border/80 p-3 shadow-[0_12px_35px_rgb(0_0_0_/_0.26)] sm:p-4 lg:p-5'
          }`}
        >
          {step === 'auth' && <AuthScreen />}
          {step === 'home' && (
            <div className="flex min-h-[300px] items-center justify-center text-text-secondary">Loading…</div>
          )}
          {step === 'recording' && (
            <RecordingView
              onUseRecording={async (blob, voiceName) => {
                if (!hasBackend) {
                  setError('Missing Supabase config. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
                  return
                }
                setStep('cloning')
                try {
                  const newVoiceId = await cloneVoice(blob, voiceName)
                  await addVoice(newVoiceId, voiceName)
                  setUserVoiceId(newVoiceId)
                  greetedFor.current = null
                  setStep('chat')
                } catch (err) {
                  setStep('recording')
                  setError(err instanceof Error ? err.message : 'Voice cloning failed.')
                }
              }}
            />
          )}
          {step === 'voices' && (
            <VoicesView
              voices={voices}
              activeVoiceId={voiceId}
              onSelect={(id) => {
                selectVoice(id)
                navigate('chat')
              }}
              onRename={async (id, name) => {
                await renameVoice(id, name)
              }}
              onDelete={async (id) => {
                const removed = voices.find((v) => v.id === id)
                const remaining = voices.filter((v) => v.id !== id)
                await deleteVoice(id)
                if (removed?.elevenlabsVoiceId === voiceId) {
                  if (remaining.length > 0) selectVoice(remaining[0].elevenlabsVoiceId)
                  else setUserVoiceId(null)
                }
              }}
              onTrainNew={() => navigate('recording')}
              onBack={() => navigate('chat')}
            />
          )}
          {step === 'cloning' && <CloningView />}
          {step === 'chat' && (
            <ChatView
              messages={messages}
              isProcessing={isProcessing}
              showThinking={showThinking}
              thinkingLabel={thinkingLabel}
              onSend={handleSendMessage}
              onOpenStory={() => navigate('story')}
              voices={voices}
              activeVoiceId={voiceId}
              onSelectVoice={selectVoice}
              onManageVoices={() => navigate('voices')}
            />
          )}
          {step === 'story' && (
            <StoryReaderView voiceId={voiceId} onBack={() => navigate('chat')} />
          )}
          {step === 'live' && (
            <TalkDebugBoundary>
              <LiveTalkPage voiceId={voiceId} onBack={() => navigate('chat')} />
            </TalkDebugBoundary>
          )}
        </motion.section>

        {step === 'chat' && (
        <footer className="mt-2 shrink-0 flex flex-col gap-2 text-xs text-text-tertiary sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-1">
            <Sparkles size={12} className="text-accent" /> Powered by OpenAI + ElevenLabs
          </p>
          <div className="flex flex-wrap gap-2">
            {step === 'chat' && (
              <button
                type="button"
                className="rounded-full border border-border/80 bg-elevated/90 px-3 py-1.5 transition hover:border-accent/60 hover:text-text-primary hover:shadow-[0_0_18px_var(--color-accent-soft)]"
                onClick={() => {
                  setUserVoiceId(null)
                  setStep('recording')
                  setMessages([])
                  greetedFor.current = null
                }}
              >
                Re-record
              </button>
            )}
            <button
              type="button"
              className="rounded-full border border-border/80 bg-elevated/90 px-3 py-1.5 transition hover:border-accent/60 hover:text-text-primary hover:shadow-[0_0_18px_var(--color-accent-soft)]"
              onClick={resetApp}
            >
              Start over
            </button>
          </div>
        </footer>
        )}
      </main>
    </div>
  )
}
