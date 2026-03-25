import { cn } from '@/src/lib/utils'
import { CSSProperties } from 'react'

interface BorderBeamProps {
  className?: string
  size?: number
  duration?: number
  borderWidth?: number
  anchor?: number
  colorFrom?: string
  colorTo?: string
  delay?: number
}

export const BorderBeam = ({
  className,
  size = 200,
  duration = 15,
  anchor = 90,
  borderWidth = 1.5,
  colorFrom = '#C69214',
  colorTo = '#1F4E5F',
  delay = 0,
}: BorderBeamProps) => {
  return (
    <div
      style={
        {
          '--size': size,
          '--duration': duration,
          '--anchor': anchor,
          '--border-width': borderWidth,
          '--color-from': colorFrom,
          '--color-to': colorTo,
          '--delay': `-${delay}s`,
        } as CSSProperties
      }
      className={cn(
        'pointer-events-none absolute inset-0 rounded-[inherit] [border:calc(var(--border-width)*1px)_solid_transparent]',
        '[background:linear-gradient(white,white)_padding-box,linear-gradient(calc(var(--angle)+90deg),var(--color-from),var(--color-to),transparent)_border-box]',
        '[mask:linear-gradient(transparent,transparent),linear-gradient(white,white)]',
        '[animation:border-beam_calc(var(--duration)*1s)_infinite_linear]',
        '[animation-delay:var(--delay)]',
        '@[supports(offset-path:rect(0_auto_auto_0))]:animate-border-beam',
        className
      )}
    />
  )
}
