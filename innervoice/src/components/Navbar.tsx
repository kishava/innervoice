import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AudioLines,
  Clock,
  LogOut,
  Menu,
  BookOpen,
  MessageCircle,
  Mic2,
  Phone,
  User,
  UserPlus,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '../AuthContext'
import { ProfileAvatar } from './ProfileAvatar'
import { ThemeToggle } from './ThemeToggle'
import { NavbarOrb } from './NavbarOrb'
import type { AppStep } from '../types'

interface Props {
  step: AppStep
  hasHistory: boolean
  hasVoice?: boolean
  onNavigate: (step: AppStep) => void
  onOpenHistory: () => void
  onOpenProfile: () => void
}

function NavButton({
  label,
  active = false,
  icon,
  onClick,
  disabled = false,
}: {
  label: string
  active?: boolean
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-40 sm:h-auto sm:py-2 ${
        active
          ? 'border-accent/60 bg-accent-soft/90 text-text-primary shadow-[0_0_18px_var(--color-accent-soft)]'
          : 'border-border/80 bg-elevated/90 text-text-secondary hover:border-accent/60 hover:text-text-primary hover:shadow-[0_0_14px_var(--color-accent-soft)]'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export function Navbar({ step, hasHistory, hasVoice = false, onNavigate, onOpenHistory, onOpenProfile }: Props) {
  const { user, isAuthenticated, logout } = useAuth()
  const voiceReady = Boolean(user?.voiceId) || hasVoice
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const optionsRef = useRef<HTMLDivElement | null>(null)

  const go = (next: AppStep) => {
    if (next === 'live') {
      // #region agent log
      fetch('http://127.0.0.1:7557/ingest/69d83c9c-05f0-432b-b66d-2c89382c215d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0d719b' },
        body: JSON.stringify({
          sessionId: '0d719b',
          runId: 'pre-fix',
          hypothesisId: 'H2',
          location: 'Navbar.tsx:go',
          message: 'Navbar Talk clicked',
          data: { voiceReady, step },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
    }
    onNavigate(next)
    setMobileMenuOpen(false)
  }

  const openHistory = () => {
    onOpenHistory()
    setMobileMenuOpen(false)
  }

  const openProfile = () => {
    onOpenProfile()
    setMobileMenuOpen(false)
  }

  const logOut = () => {
    logout()
    setMobileMenuOpen(false)
    setOptionsOpen(false)
  }

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (optionsRef.current && !optionsRef.current.contains(target)) {
        setOptionsOpen(false)
      }
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOptionsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [])

  return (
    <div className="relative z-30 mb-2 sm:mb-3">
      <NavbarOrb />
      <nav className="glass-panel sticky top-2 rounded-3xl border border-border/80 px-3 pb-2.5 pt-7 shadow-[0_10px_30px_rgb(0_0_0_/_0.22)] sm:px-4 sm:pt-8">
        <motion.div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          {isAuthenticated && user ? (
            <button
              type="button"
              onClick={onOpenProfile}
              className="shrink-0 rounded-full transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              aria-label="Open profile"
            >
              <ProfileAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
            </button>
          ) : (
            <div className="glow-accent flex h-8 w-8 items-center justify-center rounded-full border border-accent/40 bg-gradient-to-br from-accent to-accent-hover text-white">
              <AudioLines size={16} />
            </div>
          )}
          <div className="min-w-0 leading-tight">
            <p className="text-[10px] uppercase tracking-[0.28em] text-text-tertiary">InnerVoice</p>
            <p className="truncate text-xs text-text-secondary">Future-self companion</p>
          </div>
        </div>

        <motion.div className="min-w-[3.5rem] justify-self-center sm:min-w-[4.25rem]" aria-hidden />

        <div className="col-start-3 flex items-center justify-end gap-1.5 justify-self-end">
          <div className="hidden items-center gap-1.5 sm:flex">
            {!isAuthenticated && (
              <NavButton
                label="Register"
                icon={<UserPlus size={14} />}
                onClick={() => go('auth')}
                active={step === 'auth'}
              />
            )}
            {isAuthenticated && (
              <>
                <NavButton
                  label="Chat"
                  icon={<MessageCircle size={14} />}
                  onClick={() => go('chat')}
                  active={step === 'chat'}
                  disabled={!voiceReady}
                />
                <NavButton
                  label="Story"
                  icon={<BookOpen size={14} />}
                  onClick={() => go('story')}
                  active={step === 'story'}
                  disabled={!voiceReady}
                />
                <NavButton
                  label="Talk"
                  icon={<Phone size={14} />}
                  onClick={() => go('live')}
                  active={step === 'live'}
                  disabled={!voiceReady}
                />
                <motion.div ref={optionsRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setOptionsOpen((prev) => !prev)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-elevated/90 text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
                    aria-expanded={optionsOpen}
                    aria-haspopup="menu"
                    aria-label="Open options menu"
                  >
                    <Menu size={16} />
                  </button>
                  <AnimatePresence>
                    {optionsOpen && (
                      <motion.div
                        role="menu"
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                        className="glass-panel absolute right-0 top-12 z-40 flex min-w-[190px] flex-col gap-1 rounded-2xl border border-border/80 p-2 shadow-[0_12px_35px_rgb(0_0_0_/_0.3)]"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            openProfile()
                            setOptionsOpen(false)
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-xs text-text-secondary transition hover:border-accent/40 hover:bg-accent-soft/60 hover:text-text-primary"
                        >
                          <User size={14} /> Profile
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            openHistory()
                            setOptionsOpen(false)
                          }}
                          disabled={!hasHistory}
                          className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-xs text-text-secondary transition hover:border-accent/40 hover:bg-accent-soft/60 hover:text-text-primary disabled:opacity-40"
                        >
                          <Clock size={14} /> History
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            go('voices')
                            setOptionsOpen(false)
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-xs text-text-secondary transition hover:border-accent/40 hover:bg-accent-soft/60 hover:text-text-primary"
                        >
                          <Mic2 size={14} /> My voices
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            go('recording')
                            setOptionsOpen(false)
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-xs text-text-secondary transition hover:border-accent/40 hover:bg-accent-soft/60 hover:text-text-primary"
                        >
                          <Mic2 size={14} /> Train new voice
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            logOut()
                            setOptionsOpen(false)
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-xs text-text-secondary transition hover:border-accent/40 hover:bg-accent-soft/60 hover:text-text-primary"
                        >
                          <LogOut size={14} /> Log out
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </>
            )}
            <ThemeToggle />
          </div>

          <div className="sm:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-elevated/90 text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
            >
              {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
        </motion.div>
      </nav>

      {mobileMenuOpen && (
        <div className="glass-panel mt-2 rounded-3xl border border-border/80 px-3 py-3 sm:hidden">
        <div className="flex flex-col gap-2">
          {!isAuthenticated && (
            <NavButton
              label="Register"
              icon={<UserPlus size={14} />}
              onClick={() => go('auth')}
              active={step === 'auth'}
            />
          )}
          {isAuthenticated && (
            <>
              <NavButton
                label="Chat"
                icon={<MessageCircle size={14} />}
                onClick={() => go('chat')}
                active={step === 'chat'}
                disabled={!voiceReady}
              />
              <NavButton
                label="Story"
                icon={<BookOpen size={14} />}
                onClick={() => go('story')}
                active={step === 'story'}
                disabled={!voiceReady}
              />
              <NavButton
                label="Talk"
                icon={<Phone size={14} />}
                onClick={() => go('live')}
                active={step === 'live'}
                disabled={!voiceReady}
              />
              <div className="rounded-2xl border border-border/80 bg-elevated/80 p-2">
                <p className="mb-1 px-2 text-[11px] uppercase tracking-wider text-text-tertiary">Options</p>
                <button
                  type="button"
                  onClick={openProfile}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs text-text-secondary transition hover:bg-accent-soft/60 hover:text-text-primary"
                >
                  <User size={14} /> Profile
                </button>
                <button
                  type="button"
                  onClick={openHistory}
                  disabled={!hasHistory}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs text-text-secondary transition hover:bg-accent-soft/60 hover:text-text-primary disabled:opacity-40"
                >
                  <Clock size={14} /> History
                </button>
                <button
                  type="button"
                  onClick={() => go('voices')}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs text-text-secondary transition hover:bg-accent-soft/60 hover:text-text-primary"
                >
                  <Mic2 size={14} /> My voices
                </button>
                <button
                  type="button"
                  onClick={() => go('recording')}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs text-text-secondary transition hover:bg-accent-soft/60 hover:text-text-primary"
                >
                  <Mic2 size={14} /> Train new voice
                </button>
                <button
                  type="button"
                  onClick={logOut}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs text-text-secondary transition hover:bg-accent-soft/60 hover:text-text-primary"
                >
                  <LogOut size={14} /> Log out
                </button>
              </div>
            </>
          )}
          <div className="pt-1">
            <ThemeToggle />
          </div>
        </div>
        </div>
      )}
    </div>
  )
}
