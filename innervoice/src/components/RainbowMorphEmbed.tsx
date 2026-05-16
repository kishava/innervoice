import { motion } from 'framer-motion'

const SKETCHFAB_MODEL_ID = '18c96b42cf7d433ca72df475cd6ec4d8'
const EMBED_SRC = `https://sketchfab.com/models/${SKETCHFAB_MODEL_ID}/embed?autostart=1&preload=1&transparent=1&ui_theme=dark&ui_infos=0&ui_hint=0&ui_stop=0&ui_watermark=0`

interface Props {
  className?: string
}

/** Sketchfab "Rainbow morph animation" by SenYul — embedded 3D hero. */
export function RainbowMorphEmbed({ className = '' }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      className={`relative overflow-hidden ${className}`}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-8 rounded-[inherit] bg-[conic-gradient(from_120deg_at_50%_50%,rgb(127_157_255_/_0.35),rgb(168_85_247_/_0.28),rgb(95_143_139_/_0.32),rgb(127_157_255_/_0.35))] blur-3xl opacity-70 dark:opacity-90"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10 dark:ring-white/15"
      />
      <iframe
        title="Rainbow morph animation"
        src={EMBED_SRC}
        className="relative z-10 h-full w-full border-0"
        allow="autoplay; fullscreen; xr-spatial-tracking"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <p className="pointer-events-none absolute bottom-1 right-2 z-20 max-w-[min(100%,280px)] truncate text-[9px] text-text-tertiary/80 sm:text-[10px]">
        <a
          href={`https://sketchfab.com/3d-models/rainbow-morph-animation-${SKETCHFAB_MODEL_ID}`}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto font-medium text-accent/80 hover:text-accent"
        >
          Rainbow morph
        </a>
        {' · '}
        <a
          href="https://sketchfab.com/senyul"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto hover:text-text-secondary"
        >
          SenYul
        </a>
        {' on '}
        <a
          href="https://sketchfab.com"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto hover:text-text-secondary"
        >
          Sketchfab
        </a>
      </p>
    </motion.div>
  )
}
