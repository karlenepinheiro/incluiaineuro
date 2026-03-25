'use client'
import React from 'react'

import { AnimatePresence, motion, Variants } from 'framer-motion'
import { cn } from '@/src/lib/utils'

type AnimationType = 'text' | 'word' | 'character' | 'line'
type AnimationVariant =
  | 'fadeIn'
  | 'blurIn'
  | 'blurInUp'
  | 'blurInDown'
  | 'slideUp'
  | 'slideDown'
  | 'slideLeft'
  | 'slideRight'
  | 'scaleUp'
  | 'scaleDown'

const defaultVariants: Record<AnimationVariant, Variants> = {
  fadeIn: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  blurIn: {
    hidden: { opacity: 0, filter: 'blur(10px)' },
    visible: { opacity: 1, filter: 'blur(0px)' },
  },
  blurInUp: {
    hidden: { opacity: 0, filter: 'blur(10px)', y: 20 },
    visible: { opacity: 1, filter: 'blur(0px)', y: 0 },
  },
  blurInDown: {
    hidden: { opacity: 0, filter: 'blur(10px)', y: -20 },
    visible: { opacity: 1, filter: 'blur(0px)', y: 0 },
  },
  slideUp: {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  },
  slideDown: {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0 },
  },
  slideLeft: {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 },
  },
  slideRight: {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  },
  scaleUp: {
    hidden: { opacity: 0, scale: 0.5 },
    visible: { opacity: 1, scale: 1 },
  },
  scaleDown: {
    hidden: { opacity: 0, scale: 1.5 },
    visible: { opacity: 1, scale: 1 },
  },
}

interface TextAnimateProps {
  children: string
  className?: string
  segmentClassName?: string
  delay?: number
  duration?: number
  variants?: Variants
  as?: React.ElementType
  by?: AnimationType
  startOnView?: boolean
  once?: boolean
  animation?: AnimationVariant
}

export function TextAnimate({
  children,
  delay = 0,
  duration = 0.3,
  variants,
  className,
  segmentClassName,
  as: Component = 'p',
  startOnView = true,
  once = true,
  by = 'word',
  animation = 'blurInUp',
  ...props
}: TextAnimateProps) {
  const MotionComponent = motion.create(Component as React.ElementType)

  const selectedVariants = variants || defaultVariants[animation]

  let segments: string[] = []
  switch (by) {
    case 'word':
      segments = children.split(' ')
      break
    case 'character':
      segments = children.split('')
      break
    case 'line':
      segments = children.split('\n')
      break
    case 'text':
    default:
      segments = [children]
      break
  }

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: delay,
        staggerChildren: duration / segments.length,
      },
    },
  }

  return (
    <AnimatePresence mode="popLayout">
      <MotionComponent
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={cn('whitespace-pre-wrap', className)}
        {...props}
      >
        {segments.map((segment, i) => (
          <motion.span
            key={`${segment}-${i}`}
            variants={selectedVariants}
            className={cn(
              by === 'line' ? 'block' : 'inline-block whitespace-pre',
              segmentClassName
            )}
          >
            {segment}
            {by === 'word' && i < segments.length - 1 ? ' ' : ''}
          </motion.span>
        ))}
      </MotionComponent>
    </AnimatePresence>
  )
}
