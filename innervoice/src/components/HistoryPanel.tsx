import type { Conversation } from '../types'

interface Props {
  open: boolean
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNewConversation: () => void
  onClose: () => void
}

function formatDate(time: number) {
  const date = new Date(time)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function HistoryPanel({
  open,
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNewConversation,
  onClose,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch">
      <button type="button" aria-label="Close history" className="absolute inset-0 bg-overlay" onClick={onClose} />
      <aside className="glass-panel relative ml-auto flex max-h-[86dvh] w-full flex-col rounded-t-2xl border border-border p-4 shadow-xl sm:h-full sm:max-h-none sm:w-80 sm:rounded-none sm:border-y-0 sm:border-r-0">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary">Conversations</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border bg-elevated px-3 py-1 text-xs text-text-secondary sm:hidden"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {conversations.length === 0 ? (
            <p className="text-xs text-text-tertiary">No saved conversations yet.</p>
          ) : (
            conversations.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-3 ${item.id === activeId ? 'border-accent/60' : 'border-border'}`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="w-full text-left"
                  tabIndex={0}
                >
                  <p className="line-clamp-2 text-sm text-text-primary">{item.title}</p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {item.messages.length} msgs • {formatDate(item.updatedAt)}
                  </p>
                </button>
                <button
                  type="button"
                  aria-label="Delete conversation"
                  onClick={() => onDelete(item.id)}
                  className="mt-2 text-xs text-danger"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={onNewConversation}
          className="mt-4 min-h-11 w-full rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-[0_0_16px_var(--color-accent-soft)]"
        >
          New Conversation
        </button>
      </aside>
    </div>
  )
}
