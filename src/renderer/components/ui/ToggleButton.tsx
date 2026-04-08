import React from 'react'
import { cn } from '../../utils/cn'

interface ToggleButtonProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}

export const ToggleButton: React.FC<ToggleButtonProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  className
}) => {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-all duration-200',
        'border border-border',
        checked
          ? 'bg-primary/10 border-primary/40 text-primary'
          : 'bg-surface-elevated text-foreground-secondary hover:bg-surface-hover hover:text-foreground',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <div
        className={cn(
          'w-4 h-4 rounded border-2 transition-all duration-200 flex items-center justify-center',
          checked
            ? 'bg-primary border-primary'
            : 'bg-surface border-border'
        )}
      >
        {checked && (
          <svg
            className="w-2.5 h-2.5 text-white"
            fill="currentColor"
            viewBox="0 0 12 12"
          >
            <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        )}
      </div>
      <span>{label}</span>
    </button>
  )
}
