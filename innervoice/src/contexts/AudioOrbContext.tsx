import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { OrbState } from '../components/BreathingVoiceOrb'
import { useAudioVisualizer } from '../hooks/useAudioVisualizer'

interface AudioOrbContextValue {
  level: number
  levels: number[]
  orbState: OrbState
  setOrbState: (state: OrbState) => void
  connect: (audio: HTMLAudioElement) => void
}

const AudioOrbContext = createContext<AudioOrbContextValue | null>(null)

export function AudioOrbProvider({ children }: { children: ReactNode }) {
  const { levels, connect } = useAudioVisualizer()
  const [orbState, setOrbState] = useState<OrbState>('idle')

  const level = useMemo(() => {
    if (!levels.length) return 0
    return Math.max(...levels)
  }, [levels])

  const setOrbStateStable = useCallback((state: OrbState) => {
    setOrbState(state)
  }, [])

  const value = useMemo(
    () => ({
      level,
      levels,
      orbState,
      setOrbState: setOrbStateStable,
      connect,
    }),
    [connect, level, levels, orbState, setOrbStateStable],
  )

  return <AudioOrbContext.Provider value={value}>{children}</AudioOrbContext.Provider>
}

export function useAudioOrb() {
  const ctx = useContext(AudioOrbContext)
  if (!ctx) {
    throw new Error('useAudioOrb must be used within AudioOrbProvider')
  }
  return ctx
}
