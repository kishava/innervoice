import { useCallback, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Download, Mic2, Pencil, Plus, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { listElevenLabsVoices, type ElevenLabsVoiceCatalogItem } from '../api/voices'
import type { UserVoice } from '../types'

interface Props {
  voices: UserVoice[]
  loading?: boolean
  loadError?: string | null
  maxVoices?: number
  canAddVoice?: boolean
  activeVoiceId: string | null
  onSelect: (elevenlabsVoiceId: string) => void
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onImportVoice: (elevenlabsVoiceId: string, name: string) => Promise<unknown>
  onTrainNew: () => void
  onBack: () => void
}

function categoryLabel(category: string): string {
  if (category === 'premade') return 'Premade'
  if (category === 'cloned') return 'Cloned'
  if (category === 'generated') return 'Generated'
  if (category === 'professional') return 'Professional'
  return category
}

export function VoicesView({
  voices,
  loading = false,
  loadError = null,
  maxVoices = 2,
  canAddVoice = true,
  activeVoiceId,
  onSelect,
  onRename,
  onDelete,
  onImportVoice,
  onTrainNew,
  onBack,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogVoices, setCatalogVoices] = useState<ElevenLabsVoiceCatalogItem[]>([])
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [importBusy, setImportBusy] = useState(false)

  const savedIds = useMemo(() => new Set(voices.map((v) => v.elevenlabsVoiceId)), [voices])

  const availableCatalog = useMemo(
    () => catalogVoices.filter((v) => !savedIds.has(v.voiceId)),
    [catalogVoices, savedIds],
  )

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

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    setError(null)
    try {
      const list = await listElevenLabsVoices()
      setCatalogVoices(list)
      setCatalogLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load ElevenLabs voices.')
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  const toggleCatalog = () => {
    const next = !catalogOpen
    setCatalogOpen(next)
    if (next && !catalogLoaded && !catalogLoading) void loadCatalog()
  }

  const handleImport = async (item: ElevenLabsVoiceCatalogItem) => {
    if (!canAddVoice) {
      setError(`You can keep up to ${maxVoices} voices. Delete one or switch active voice first.`)
      return
    }
    setImportBusy(true)
    setError(null)
    try {
      await onImportVoice(item.voiceId, item.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add voice.')
    } finally {
      setImportBusy(false)
    }
  }

  const handleImportAll = async () => {
    if (!canAddVoice || availableCatalog.length === 0) return
    setImportBusy(true)
    setError(null)
    let added = 0
    let slotsLeft = canAddVoice ? maxVoices - voices.length : 0

    try {
      for (const item of availableCatalog) {
        if (slotsLeft <= 0) break
        if (savedIds.has(item.voiceId)) continue
        try {
          await onImportVoice(item.voiceId, item.name)
          added += 1
          slotsLeft -= 1
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not add voice.'
          if (message.includes('up to')) break
          throw err
        }
      }
      if (added === 0 && availableCatalog.length > 0 && !canAddVoice) {
        setError(`Voice limit reached (${maxVoices}/${maxVoices}).`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add voices.')
    } finally {
      setImportBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-0 flex-col gap-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-text-primary">
            <Mic2 size={18} className="text-accent" />
            My voices
          </h2>
          <p className="mt-1 max-w-md text-sm text-text-secondary">
            Choose active voices for chat, story, and live talk. Add premade or cloned models from your ElevenLabs
            account, or train your own. Up to {maxVoices} saved here.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-border/80 bg-elevated/90 px-4 py-2 text-sm text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
        >
          Back
        </button>
      </div>

      {(error || loadError) && (
        <p className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error ?? loadError}
        </p>
      )}

      <button
        type="button"
        onClick={onTrainNew}
        disabled={!canAddVoice || loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-accent/50 bg-accent-soft/30 px-4 py-3 text-sm font-medium text-text-primary transition hover:border-accent hover:bg-accent-soft/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={16} />
        {canAddVoice ? 'Train a new voice' : `Voice limit reached (${maxVoices}/${maxVoices})`}
      </button>

      <div className="rounded-2xl border border-border/80 bg-elevated/50">
        <button
          type="button"
          onClick={toggleCatalog}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-text-primary"
        >
          <span className="inline-flex items-center gap-2">
            <Download size={16} className="text-accent" />
            Add from ElevenLabs
          </span>
          {catalogOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {catalogOpen && (
          <div className="border-t border-border/80 px-3 pb-3 pt-2">
            <p className="mb-2 text-xs text-text-tertiary">
              Premade and custom voices in your ElevenLabs account. Tap to add to My voices (up to {maxVoices}).
            </p>
            {catalogLoading ? (
              <p className="py-4 text-center text-sm text-text-secondary">Loading ElevenLabs voices…</p>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={importBusy || !canAddVoice || availableCatalog.length === 0}
                    onClick={() => void handleImportAll()}
                    className="rounded-full border border-accent/50 bg-accent-soft/40 px-3 py-1.5 text-xs font-medium text-text-primary transition hover:border-accent disabled:opacity-50"
                  >
                    Add all available
                    {availableCatalog.length > 0 ? ` (${Math.min(availableCatalog.length, maxVoices - voices.length)})` : ''}
                  </button>
                  <button
                    type="button"
                    disabled={catalogLoading}
                    onClick={() => void loadCatalog()}
                    className="rounded-full border border-border/80 px-3 py-1.5 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary disabled:opacity-50"
                  >
                    Refresh list
                  </button>
                </div>
                {availableCatalog.length === 0 ? (
                  <p className="py-3 text-center text-sm text-text-secondary">
                    {catalogLoaded ? 'No new voices to add — your library is up to date.' : 'Open this section to load voices.'}
                  </p>
                ) : (
                  <ul className="max-h-52 space-y-1 overflow-y-auto pr-1">
                    {availableCatalog.map((item) => (
                      <li
                        key={item.voiceId}
                        className="flex items-center gap-2 rounded-xl border border-border/70 bg-surface-card/40 px-2 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text-primary">{item.name}</p>
                          <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                            {categoryLabel(item.category)}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={importBusy || !canAddVoice}
                          onClick={() => void handleImport(item)}
                          className="shrink-0 rounded-full border border-accent/50 px-3 py-1 text-xs text-text-primary transition hover:bg-accent-soft/50 disabled:opacity-50"
                        >
                          Add
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <p className="rounded-2xl border border-border/80 bg-elevated/60 px-4 py-6 text-center text-sm text-text-secondary">
          Loading voices…
        </p>
      ) : voices.length === 0 ? (
        <p className="rounded-2xl border border-border/80 bg-elevated/60 px-4 py-6 text-center text-sm text-text-secondary">
          No voices yet. Add from ElevenLabs above or train your first voice.
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
