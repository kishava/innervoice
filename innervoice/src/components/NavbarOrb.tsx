import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../AuthContext'
import { useAudioOrb } from '../contexts/AudioOrbContext'
import { BreathingVoiceOrb } from './BreathingVoiceOrb'

/** 3D orb floating above the navbar — reacts to assistant voice playback. */
export function NavbarOrb() {
  const { user, isAuthenticated } = useAuth()
  const { level, orbState } = useAudioOrb()
  const [orbSize, setOrbSize] = useState(64)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setOrbSize(mq.matches ? 54 : 68)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  if (!isAuthenticated) return null

  const pulse = 1 + level * 0.14
  const glow = 12 + level * 28

  return (
    <motion.div
      className="pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-[46%]"
      aria-hidden
    >
      <motion.div
        animate={{
          scale: pulse,
          boxShadow: `0 0 ${glow}px var(--color-accent-soft)`,
        }}
        transition={{ type: 'spring', stiffness: 280, damping: 22, mass: 0.35 }}
        className="rounded-full border border-accent/45 bg-elevated/90 p-1 shadow-[0_8px_32px_rgb(0_0_0_/_0.25)] backdrop-blur-md dark:bg-elevated/80"
      >
        <BreathingVoiceOrb
          state={orbState}
          emotion="hopeful"
          level={Math.max(0.12, level)}
          size={orbSize}
        />
      </motion.div>
      {!user?.voiceId && (
        <p className="pointer-events-none mt-1 whitespace-nowrap text-center text-[9px] text-text-tertiary">
          Train voice
        </p>
      )}
    </motion.div>
  )
}
