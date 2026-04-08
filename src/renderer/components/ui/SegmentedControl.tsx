import React from 'react'
import { cn } from '../../lib/utils'

export interface SegmentedControlOption {
  value: string
  label: string
  icon?: React.ReactNode
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  fullWidth?: boolean
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  className,
  fullWidth = false
}) => {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 p-1 rounded-[var(--radius-sm)] bg-surface border border-border',
        fullWidth && 'w-full',
        className
      )}
      role="radiogroup"
    >
      {options.map((option) => {
        const isActive = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-1.5 rounded-[var(--radius-xs)]',
              'text-sm font-medium transition-all duration-200',
              'hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-ring focus-visible:ring-offset-0',
              fullWidth && 'flex-1',
              isActive
                ? 'bg-primary text-primary-foreground shadow-elevation-sm'
                : 'text-foreground-secondary hover:text-foreground'
            )}
          >
            {option.icon && (
              <span className="shrink-0">{option.icon}</span>
            )}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

SegmentedControl.displayName = 'SegmentedControl'
