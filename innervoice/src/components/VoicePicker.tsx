import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Mic2 } from 'lucide-react'
import type { UserVoice } from '../types'

interface Props {
  voices: UserVoice[]
  activeVoiceId: string | null
  onSelect: (elevenlabsVoiceId: string) => void
  onManage?: () => void
  disabled?: boolean
}

export function VoicePicker({ voices, activeVoiceId, onSelect, onManage, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const active = voices.find((v) => v.elevenlabsVoiceId === activeVoiceId)
  const label = active?.name ?? (activeVoiceId ? 'Untitled voice' : 'No voice selected')

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [])

  if (voices.length === 0 && !activeVoiceId) return null

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled || voices.length === 0}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-elevated/90 px-3 py-1.5 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Mic2 size={13} className="shrink-0 text-accent" />
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && voices.length > 0 && (
        <div
          role="listbox"
          className="glass-panel absolute left-0 top-full z-40 mt-1.5 min-w-[220px] max-w-[min(320px,90vw)] rounded-2xl border border-border/80 p-1.5 shadow-[0_12px_35px_rgb(0_0_0_/_0.3)]"
        >
          <p className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-text-tertiary">Speaking as</p>
          {voices.map((voice) => {
            const selected = voice.elevenlabsVoiceId === activeVoiceId
            return (
              <button
                key={voice.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onSelect(voice.elevenlabsVoiceId)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition ${
                  selected
                    ? 'bg-accent-soft/80 text-text-primary'
                    : 'text-text-secondary hover:bg-accent-soft/50 hover:text-text-primary'
                }`}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{voice.name}</span>
                {selected && <Check size={14} className="shrink-0 text-accent" />}
              </button>
            )
          })}
          {onManage && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onManage()
              }}
              className="mt-1 w-full rounded-xl border border-dashed border-border/80 px-2.5 py-2 text-left text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
            >
              Manage voices…
            </button>
          )}
        </div>
      )}
    </div>
  )
}
