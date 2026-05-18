import { AlertCircle, X } from 'lucide-react'

interface Props {
  message: string | null
  onClose: () => void
}

export function ErrorPopup({ message, onClose }: Props) {
  if (!message) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[110] flex items-start justify-center p-3 sm:p-4">
      <div className="pointer-events-auto mt-1 w-full max-w-lg rounded-2xl border border-danger/45 bg-surface-card/98 p-3 shadow-[0_16px_44px_rgb(0_0_0_/_0.42)] backdrop-blur">
        <div className="flex items-start gap-2.5">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" />
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-text-primary">{message}</p>
          <button
            type="button"
            aria-label="Close error popup"
            onClick={onClose}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/85 bg-elevated/80 text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
