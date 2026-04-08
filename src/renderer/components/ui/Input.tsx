import React from 'react'
import { cn } from '../../lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  mono?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, mono, leftIcon, rightIcon, type = 'text', ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)
    const [hasValue, setHasValue] = React.useState(false)
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasValue(e.target.value.length > 0)
      props.onChange?.(e)
    }
    
    return (
      <div className="relative w-full">
        <div
          className={cn(
            'relative flex items-center rounded-[var(--radius-sm)] border transition-all duration-200',
            'bg-input border-border-elevated',
            isFocused && 'border-primary ring-2 ring-ring ring-offset-0',
            error && 'border-danger ring-2 ring-danger/50',
            className
          )}
        >
          {leftIcon && (
            <div className="absolute left-3 text-foreground-muted flex items-center">
              {leftIcon}
            </div>
          )}
          
          <input
            ref={ref}
            type={type}
            className={cn(
              'w-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-foreground-muted',
              'disabled:cursor-not-allowed disabled:opacity-50',
              mono && 'text-mono',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              label && 'pt-4 pb-1'
            )}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={handleChange}
            {...props}
          />
          
          {label && (
            <label
              className={cn(
                'absolute left-3 transition-all duration-200 pointer-events-none',
                'text-foreground-muted',
                isFocused || hasValue || props.value
                  ? 'text-xs top-1.5'
                  : 'text-sm top-1/2 -translate-y-1/2',
                leftIcon && 'left-10'
              )}
            >
              {label}
            </label>
          )}
          
          {rightIcon && (
            <div className="absolute right-3 text-foreground-muted flex items-center">
              {rightIcon}
            </div>
          )}
        </div>
        
        {error && (
          <p className="mt-1.5 text-xs text-danger">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
