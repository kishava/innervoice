import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Lightbulb, X } from 'lucide-react'

const BANK = [
  'What should I focus on right now?',
  'How do I handle this anxiety?',
  'What am I avoiding that matters most?',
  'What would future me thank me for today?',
  'How do I be kinder to myself?',
  'What one habit changes everything?',
  'How can I rebuild confidence?',
  'What should I let go of this week?',
]

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (text: string) => void
}

export function FollowUpSuggestions({ open, onClose, onSelect }: Props) {
  const [suggestions, setSuggestions] = useState(() => BANK.slice(0, 3))

  useEffect(() => {
    if (!open) return
    const shuffled = [...BANK].sort(() => 0.5 - Math.random())
    setSuggestions(shuffled.slice(0, 3))
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-3 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="suggestions-title"
            className="glass-panel glow-accent max-h-[88dvh] w-full max-w-md overflow-hidden rounded-2xl border border-border p-4 shadow-2xl sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Lightbulb size={18} />
                  </div>
                  <div>
                    <h3 id="suggestions-title" className="text-sm font-semibold text-text-primary">
                      Try asking
                    </h3>
                    <p className="text-xs text-text-secondary">Tap a prompt to start the conversation</p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close suggestions"
                  onClick={onClose}
                  className="rounded-full border border-border bg-elevated p-1.5 text-text-tertiary transition hover:border-accent/60 hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {suggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      onSelect(item)
                      onClose()
                    }}
                    className="min-h-12 rounded-xl border border-border bg-elevated px-4 py-3 text-left text-sm text-text-primary transition hover:border-accent/50 hover:bg-accent-soft"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
