import React from 'react'
import { cn } from '../../lib/utils'

export interface TabOption {
  value: string
  label: string
  icon?: React.ReactNode
  disabled?: boolean
}

export interface TabsProps {
  options: TabOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  variant?: 'underline' | 'pills'
}

export const Tabs: React.FC<TabsProps> = ({
  options,
  value,
  onChange,
  className,
  variant = 'underline'
}) => {
  const [indicatorStyle, setIndicatorStyle] = React.useState<React.CSSProperties>({})
  const tabsRef = React.useRef<HTMLDivElement>(null)
  const activeTabRef = React.useRef<HTMLButtonElement>(null)
  
  React.useEffect(() => {
    if (variant === 'underline' && activeTabRef.current && tabsRef.current) {
      const tabsRect = tabsRef.current.getBoundingClientRect()
      const activeRect = activeTabRef.current.getBoundingClientRect()
      
      setIndicatorStyle({
        width: activeRect.width,
        transform: `translateX(${activeRect.left - tabsRect.left}px)`
      })
    }
  }, [value, variant])
  
  if (variant === 'pills') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 p-1 rounded-[var(--radius-sm)] bg-surface border border-border',
          className
        )}
        role="tablist"
      >
        {options.map((option) => {
          const isActive = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-disabled={option.disabled}
              onClick={() => !option.disabled && onChange(option.value)}
              disabled={option.disabled}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-[var(--radius-xs)]',
                'text-sm font-medium transition-all duration-200',
                'hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-ring focus-visible:ring-offset-0',
                'disabled:opacity-50 disabled:cursor-not-allowed',
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
  
  // Underline variant
  return (
    <div className={cn('relative', className)}>
      <div
        ref={tabsRef}
        className="flex items-center border-b border-border"
        role="tablist"
      >
        {options.map((option) => {
          const isActive = value === option.value
          return (
            <button
              key={option.value}
              ref={isActive ? activeTabRef : null}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-disabled={option.disabled}
              onClick={() => !option.disabled && onChange(option.value)}
              disabled={option.disabled}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-200',
                'hover:text-foreground focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-ring focus-visible:ring-offset-0',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                isActive
                  ? 'text-foreground'
                  : 'text-foreground-secondary'
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
      
      {/* Animated underline indicator */}
      <div
        className="absolute bottom-0 h-0.5 bg-primary transition-all duration-300"
        style={indicatorStyle}
      />
    </div>
  )
}

Tabs.displayName = 'Tabs'
