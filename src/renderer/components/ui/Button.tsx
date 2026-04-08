import React from 'react'
import { cn } from '../../lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  children: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-ring'
    
    const variants = {
      primary: 'bg-primary text-primary-foreground hover:brightness-110 shadow-elevation-sm',
      secondary: 'bg-surface-elevated text-foreground border border-border hover:bg-surface-hover',
      ghost: 'bg-transparent text-primary border border-primary hover:bg-primary/10',
      danger: 'bg-danger text-white hover:brightness-110 shadow-elevation-sm',
      icon: 'bg-transparent text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
    }
    
    const sizes = {
      sm: 'h-8 px-3 text-xs rounded-[var(--radius-xs)]',
      md: 'h-9 px-4 text-sm rounded-[var(--radius-sm)]',
      lg: 'h-10 px-5 text-[15px] rounded-[var(--radius-sm)]'
    }
    
    const iconSizes = {
      sm: 'h-8 w-8 rounded-[var(--radius-xs)]',
      md: 'h-9 w-9 rounded-[var(--radius-xs)]',
      lg: 'h-10 w-10 rounded-[var(--radius-sm)]'
    }
    
    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          variant === 'icon' ? iconSizes[size] : sizes[size],
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
