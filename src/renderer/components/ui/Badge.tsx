import React from 'react'
import { cn } from '../../lib/utils'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  pulse?: boolean
  children: React.ReactNode
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', pulse = false, children, ...props }, ref) => {
    const variants = {
      default: 'bg-surface-elevated text-foreground border-border',
      success: 'bg-success/10 text-success border-success/30',
      warning: 'bg-warning/10 text-warning border-warning/30',
      danger: 'bg-danger/10 text-danger border-danger/30',
      info: 'bg-info/10 text-info border-info/30',
      outline: 'bg-transparent text-foreground border-border'
    }
    
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[var(--radius-pill)] border text-xs font-medium',
          'transition-colors duration-200',
          variants[variant],
          className
        )}
        {...props}
      >
        {pulse && (
          <span className={cn(
            'h-2 w-2 rounded-full animate-pulse',
            variant === 'success' && 'bg-success',
            variant === 'warning' && 'bg-warning',
            variant === 'danger' && 'bg-danger',
            variant === 'info' && 'bg-info',
            variant === 'default' && 'bg-foreground-muted'
          )} />
        )}
        {children}
      </span>
    )
  }
)

Badge.displayName = 'Badge'
