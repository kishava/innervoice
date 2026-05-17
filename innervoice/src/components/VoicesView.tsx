import { useState } from 'react'
import { Check, Mic2, Pencil, Plus, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import type { UserVoice } from '../types'

interface Props {
  voices: UserVoice[]
  activeVoiceId: string | null
  onSelect: (elevenlabsVoiceId: string) => void
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onTrainNew: () => void
  onBack: () => void
}

export function VoicesView({
  voices,
  activeVoiceId,
  onSelect,
  onRename,
  onDelete,
  onTrainNew,
  onBack,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startEdit = (voice: UserVoice) => {
    setEditingId(voice.id)
    setEditName(voice.name)
    setError(null)
  }

  const saveEdit = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      await onRename(id, editName)
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename voice.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (voice: UserVoice) => {
    if (voice.id === 'legacy') return
    const ok = window.confirm(`Delete "${voice.name}"? This cannot be undone.`)
    if (!ok) return
    setBusyId(voice.id)
    setError(null)
    try {
      await onDelete(voice.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete voice.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-0 flex-col gap-4"
    >
      <motion.div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-text-primary">
            <Mic2 size={18} className="text-accent" />
            My voices
          </h2>
          <p className="mt-1 max-w-md text-sm text-text-secondary">
            Trained voices for chat, story, and live talk. Pick one to speak as your future self.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-border/80 bg-elevated/90 px-4 py-2 text-sm text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
        >
          Back
        </button>
      </motion.div>

      {error && (
        <p className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <button
        type="button"
        onClick={onTrainNew}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-accent/50 bg-accent-soft/30 px-4 py-3 text-sm font-medium text-text-primary transition hover:border-accent hover:bg-accent-soft/50"
      >
        <Plus size={16} />
        Train a new voice
      </button>

      {voices.length === 0 ? (
        <p className="rounded-2xl border border-border/80 bg-elevated/60 px-4 py-6 text-center text-sm text-text-secondary">
          No voices yet. Train your first voice to start chatting.
        </p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {voices.map((voice) => {
            const selected = voice.elevenlabsVoiceId === activeVoiceId
            const editing = editingId === voice.id
            const busy = busyId === voice.id

            return (
              <li
                key={voice.id}
                className={`rounded-2xl border p-3 transition ${
                  selected ? 'border-accent/50 bg-accent-soft/40' : 'border-border/80 bg-elevated/70'
                }`}
              >
                {editing ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={48}
                      className="min-w-0 flex-1 rounded-xl border border-border bg-input-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/60"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy || !editName.trim()}
                        onClick={() => void saveEdit(voice.id)}
                        className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-full border border-border px-4 py-2 text-xs text-text-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(voice.elevenlabsVoiceId)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="truncate font-medium text-text-primary">{voice.name}</span>
                      {selected && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                          <Check size={10} />
                          Active
                        </span>
                      )}
                    </button>
                    {voice.id !== 'legacy' && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          aria-label={`Rename ${voice.name}`}
                          disabled={busy}
                          onClick={() => startEdit(voice)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/80 text-text-secondary transition hover:border-accent/60 hover:text-text-primary disabled:opacity-50"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${voice.name}`}
                          disabled={busy || selected}
                          title={selected ? 'Switch to another voice before deleting' : undefined}
                          onClick={() => void handleDelete(voice)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/80 text-text-secondary transition hover:border-danger/60 hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </motion.div>
  )
}
