'use client'
import React from 'react'

import { cn } from '@/src/lib/utils'
import { motion } from 'framer-motion'

export const HeroHighlight = ({
  children,
  className,
  containerClassName,
}: {
  children: React.ReactNode
  className?: string
  containerClassName?: string
}) => {
  return (
    <div
      className={cn(
        'relative flex h-[40rem] w-full items-center justify-center bg-bg-app',
        containerClassName
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #1F4E5F22 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }}
      />
      <div className={cn('relative z-20', className)}>{children}</div>
    </div>
  )
}

export const Highlight = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => {
  return (
    <motion.span
      initial={{ backgroundSize: '0% 100%' }}
      animate={{ backgroundSize: '100% 100%' }}
      transition={{ duration: 2, ease: 'linear', delay: 0.5 }}
      style={{
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'left center',
        display: 'inline',
      }}
      className={cn(
        `relative inline-block rounded-sm pb-1 px-1 bg-gradient-to-r from-gold/40 to-petrol/30`,
        className
      )}
    >
      {children}
    </motion.span>
  )
}
