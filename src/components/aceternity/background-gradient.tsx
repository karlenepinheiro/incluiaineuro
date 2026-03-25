'use client'
import React from 'react'
'use client'

import { cn } from '@/src/lib/utils'
import { motion } from 'framer-motion'

export function BackgroundGradient({
  children,
  className,
  containerClassName,
  animate = true,
}: {
  children?: React.ReactNode
  className?: string
  containerClassName?: string
  animate?: boolean
}) {
  const variants = {
    initial: { backgroundPosition: '0 50%' },
    animate: { backgroundPosition: ['0, 50%', '100% 50%', '0 50%'] },
  }

  return (
    <div className={cn('group relative p-[2px]', containerClassName)}>
      <motion.div
        variants={animate ? variants : undefined}
        initial={animate ? 'initial' : undefined}
        animate={animate ? 'animate' : undefined}
        transition={
          animate
            ? {
                duration: 5,
                repeat: Infinity,
                repeatType: 'reverse',
              }
            : undefined
        }
        style={{ backgroundSize: animate ? '400% 400%' : undefined }}
        className={cn(
          'absolute inset-0 z-[1] rounded-2xl opacity-60 blur-xl transition duration-500 group-hover:opacity-100',
          'bg-[radial-gradient(circle_farthest-side_at_0_100%,#C69214,transparent),radial-gradient(circle_farthest-side_at_100%_0,#1F4E5F,transparent),radial-gradient(circle_farthest-side_at_100%_100%,#2E3A59,transparent),radial-gradient(circle_farthest-side_at_0_0,#C69214,#1F4E5F)]'
        )}
      />
      <motion.div
        variants={animate ? variants : undefined}
        initial={animate ? 'initial' : undefined}
        animate={animate ? 'animate' : undefined}
        transition={
          animate
            ? {
                duration: 5,
                repeat: Infinity,
                repeatType: 'reverse',
              }
            : undefined
        }
        style={{ backgroundSize: animate ? '400% 400%' : undefined }}
        className={cn(
          'absolute inset-0 z-[1] rounded-2xl',
          'bg-[radial-gradient(circle_farthest-side_at_0_100%,#C69214,transparent),radial-gradient(circle_farthest-side_at_100%_0,#1F4E5F,transparent),radial-gradient(circle_farthest-side_at_100%_100%,#2E3A59,transparent),radial-gradient(circle_farthest-side_at_0_0,#C69214,#1F4E5F)]'
        )}
      />
      <div className={cn('relative z-10', className)}>{children}</div>
    </div>
  )
}
