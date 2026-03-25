'use client'
import React from 'react'
'use client'

import { cn } from '@/src/lib/utils'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'

export const HoverEffect = ({
  items,
  className,
}: {
  items: {
    title: string
    description: string
    icon?: React.ReactNode
  }[]
  className?: string
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3', className)}>
      {items.map((item, idx) => (
        <div
          key={idx}
          className="group relative block h-full w-full p-2"
          onMouseEnter={() => setHoveredIndex(idx)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <AnimatePresence>
            {hoveredIndex === idx && (
              <motion.span
                className="absolute inset-0 block h-full w-full rounded-2xl bg-petrol/10"
                layoutId="hoverBackground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.15 } }}
                exit={{ opacity: 0, transition: { duration: 0.15, delay: 0.2 } }}
              />
            )}
          </AnimatePresence>
          <div
            className={cn(
              'relative z-20 h-full w-full overflow-hidden rounded-2xl border border-border bg-surface p-6',
              'group-hover:border-petrol/30 transition-colors duration-300'
            )}
          >
            {item.icon && (
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-petrol/10 text-petrol">
                {item.icon}
              </div>
            )}
            <h3 className="mb-2 font-semibold text-dark">{item.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
