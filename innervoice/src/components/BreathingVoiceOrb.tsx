import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking'
export type OrbEmotion =
  | 'neutral'
  | 'anxious'
  | 'sad'
  | 'hopeful'
  | 'grateful'
  | 'angry'

interface BreathingVoiceOrbProps {
  state?: OrbState
  emotion?: OrbEmotion
  /** 0..1 reactive intensity from real audio level */
  level?: number
  /** outer canvas size in px */
  size?: number
  className?: string
}

const EMOTION_PALETTE: Record<
  OrbEmotion,
  { core: string; emissive: string; halo: string; rim: string }
> = {
  neutral:  { core: '#9ccfca', emissive: '#5f8f8b', halo: '#b8ddd7', rim: '#7fb8b3' },
  anxious:  { core: '#a6a5d8', emissive: '#5e5e9c', halo: '#c0bee4', rim: '#8786c3' },
  sad:      { core: '#8aaecf', emissive: '#3f6c97', halo: '#b3cde0', rim: '#6f95bb' },
  hopeful:  { core: '#f0c987', emissive: '#b58943', halo: '#f7d8a3', rim: '#d8a85e' },
  grateful: { core: '#e8a5a8', emissive: '#a4595d', halo: '#f1c2c5', rim: '#cf8487' },
  angry:    { core: '#d18b8b', emissive: '#8c4444', halo: '#dfa5a5', rim: '#a96c6c' },
}

interface InternalProps {
  state: OrbState
  emotion: OrbEmotion
  level: number
  reducedMotion: boolean
  isMobile: boolean
}

function makeParticleGeometry(count: number) {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    // Spherical shell at radius ~ 1.85 with small thickness
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 1.85 + (Math.random() - 0.5) * 0.35
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geom
}

function OrbContent({ state, emotion, level, reducedMotion, isMobile }: InternalProps) {
  const coreRef = useRef<THREE.Mesh>(null)
  const haloRef = useRef<THREE.Mesh>(null)
  const ringGroupRef = useRef<THREE.Group>(null)
  const particleRef = useRef<THREE.Points>(null)
  const haloMatRef = useRef<THREE.MeshBasicMaterial>(null)

  const palette = EMOTION_PALETTE[emotion]

  const tuning = useMemo(() => {
    switch (state) {
      case 'listening':
        return { rate: 1.4, amp: 0.07, scale: 1.04, glow: 0.7 }
      case 'processing':
        return { rate: 1.0, amp: 0.05, scale: 1.06, glow: 0.8 }
      case 'speaking':
        return { rate: 1.6, amp: 0.09, scale: 1.08, glow: 0.9 }
      default:
        return { rate: 0.45, amp: 0.035, scale: 1.0, glow: 0.45 }
    }
  }, [state])

  // Pre-build particle geometry once. Mobile gets fewer particles.
  const particleGeometry = useMemo(
    () => makeParticleGeometry(isMobile ? 60 : 180),
    [isMobile],
  )
  useEffect(() => {
    return () => particleGeometry.dispose()
  }, [particleGeometry])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime

    if (coreRef.current) {
      const breathe = reducedMotion ? 0 : Math.sin(t * tuning.rate) * tuning.amp
      const reactive = reducedMotion ? 0 : level * 0.22
      coreRef.current.scale.setScalar(tuning.scale + breathe + reactive)
      // Gentle spin so the surface highlights drift instead of feeling static.
      if (!reducedMotion) {
        coreRef.current.rotation.y = t * 0.08
        coreRef.current.rotation.x = Math.sin(t * 0.2) * 0.08
      }
    }

    if (haloRef.current) {
      const breathe = reducedMotion ? 0 : Math.sin(t * (tuning.rate * 0.7)) * (tuning.amp * 0.6)
      haloRef.current.scale.setScalar(1.32 + breathe + level * 0.12)
    }
    if (haloMatRef.current) {
      const base = 0.12 + tuning.glow * 0.05
      haloMatRef.current.opacity = reducedMotion ? base : base + Math.sin(t * 0.5) * 0.04
    }

    if (ringGroupRef.current && !reducedMotion) {
      ringGroupRef.current.rotation.y = t * 0.05
      ringGroupRef.current.rotation.x = Math.sin(t * 0.15) * 0.15
    }

    if (particleRef.current && !reducedMotion) {
      particleRef.current.rotation.y = t * 0.025
      particleRef.current.rotation.x = Math.sin(t * 0.1) * 0.1
    }
  })

  const coreSegments = isMobile ? 48 : 96

  return (
    <>
      <ambientLight intensity={0.55} />
      <pointLight position={[3.5, 3, 4]} intensity={0.85} color={palette.rim} />
      <pointLight position={[-3, -2.5, -3]} intensity={0.45} color={palette.halo} />

      <mesh ref={coreRef}>
        <sphereGeometry args={[1, coreSegments, coreSegments]} />
        <meshStandardMaterial
          color={palette.core}
          roughness={0.42}
          metalness={0.18}
          emissive={palette.emissive}
          emissiveIntensity={0.4 + tuning.glow * 0.25}
        />
      </mesh>

      <mesh ref={haloRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          ref={haloMatRef}
          color={palette.halo}
          transparent
          opacity={0.14}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      <group ref={ringGroupRef}>
        <mesh rotation={[Math.PI / 3, Math.PI / 6, 0]}>
          <torusGeometry args={[1.7, 0.006, 8, 96]} />
          <meshBasicMaterial color={palette.rim} transparent opacity={0.22} />
        </mesh>
        <mesh rotation={[Math.PI / 4, -Math.PI / 5, 0]}>
          <torusGeometry args={[1.92, 0.005, 8, 96]} />
          <meshBasicMaterial color={palette.rim} transparent opacity={0.16} />
        </mesh>
        <mesh rotation={[-Math.PI / 3.5, Math.PI / 3, 0]}>
          <torusGeometry args={[2.15, 0.004, 8, 96]} />
          <meshBasicMaterial color={palette.rim} transparent opacity={0.1} />
        </mesh>
      </group>

      {!reducedMotion && (
        <points ref={particleRef} geometry={particleGeometry}>
          <pointsMaterial
            size={isMobile ? 0.022 : 0.018}
            color={palette.halo}
            transparent
            opacity={0.55}
            sizeAttenuation
            depthWrite={false}
          />
        </points>
      )}
    </>
  )
}

export function BreathingVoiceOrb({
  state = 'idle',
  emotion = 'neutral',
  level = 0,
  size = 240,
  className,
}: BreathingVoiceOrbProps) {
  const [reducedMotion, setReducedMotion] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const setFromMq = () => setReducedMotion(mq.matches)
    setFromMq()
    mq.addEventListener?.('change', setFromMq)
    return () => mq.removeEventListener?.('change', setFromMq)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 640px)')
    const setFromMq = () => setIsMobile(mq.matches)
    setFromMq()
    mq.addEventListener?.('change', setFromMq)
    return () => mq.removeEventListener?.('change', setFromMq)
  }, [])

  const sizeFromClass = className?.match(/\b(h-|w-|size-)/)
  return (
    <div
      className={[className, 'relative overflow-hidden'].filter(Boolean).join(' ')}
      style={sizeFromClass ? undefined : { width: size, height: size }}
      aria-hidden="true"
    >
      <Canvas
        className="!block h-full w-full"
        camera={{ position: [0, 0, 4.2], fov: 45 }}
        dpr={[1, isMobile ? 1.5 : 2]}
        gl={{ antialias: !isMobile, alpha: true, powerPreference: 'low-power' }}
        frameloop={reducedMotion ? 'demand' : 'always'}
      >
        <OrbContent
          state={state}
          emotion={emotion}
          level={level}
          reducedMotion={reducedMotion}
          isMobile={isMobile}
        />
      </Canvas>
    </div>
  )
}
