interface Props {
  open: boolean
  step: number
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  onFinish: () => void
}

const STEPS = [
  {
    title: 'Record Your Voice',
    text: 'Speak into your microphone so we can create your InnerVoice profile.',
  },
  {
    title: 'AI Clones It',
    text: 'ElevenLabs creates a digital voice twin to speak your responses back.',
  },
  {
    title: 'Ask Anything',
    text: 'Chat with your future self for calm guidance, clarity, and support.',
  },
]

export function OnboardingOverlay({ open, step, onNext, onBack, onSkip, onFinish }: Props) {
  if (!open) return null

  const last = step === STEPS.length - 1
  const current = STEPS[step]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="glass-panel max-h-[90dvh] w-full max-w-md overflow-hidden rounded-2xl border border-border p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-text-primary">{current.title}</h2>
        <p className="mt-2 text-sm text-text-secondary">{current.text}</p>
        <div className="mt-4 flex gap-2">
          {STEPS.map((item, index) => (
            <span
              key={item.title}
              className={`h-2 rounded-full ${index === step ? 'w-8 bg-accent' : 'w-2 bg-border'}`}
            />
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onSkip} className="min-h-10 text-sm text-text-tertiary sm:min-h-0">
            Skip tutorial
          </button>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={onBack}
              disabled={step === 0}
              className="min-h-11 rounded-full border border-border bg-elevated px-4 py-2 disabled:opacity-50"
            >
              Back
            </button>
            {last ? (
              <button type="button" onClick={onFinish} className="min-h-11 rounded-full bg-accent px-4 py-2 text-white">
                Get Started
              </button>
            ) : (
              <button type="button" onClick={onNext} className="min-h-11 rounded-full bg-accent px-4 py-2 text-white">
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
