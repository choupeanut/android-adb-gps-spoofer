import React from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface CollapsiblePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  isCollapsed?: boolean
  onToggle?: () => void
  defaultCollapsed?: boolean
  glass?: boolean
  children: React.ReactNode
}

export const CollapsiblePanel = React.forwardRef<HTMLDivElement, CollapsiblePanelProps>(
  ({ className, title, isCollapsed: controlledCollapsed, onToggle, defaultCollapsed = false, glass = true, children, ...props }, ref) => {
    const [internalCollapsed, setInternalCollapsed] = React.useState(defaultCollapsed)
    
    const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed
    
    const handleToggle = () => {
      if (onToggle) {
        onToggle()
      } else {
        setInternalCollapsed(!internalCollapsed)
      }
    }
    
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col transition-all duration-spring ease-spring',
          'rounded-[var(--radius-md)] shadow-elevation-md',
          glass ? 'glass' : 'bg-surface border border-border',
          className
        )}
        {...props}
      >
        {/* Header */}
        <button
          onClick={handleToggle}
          className={cn(
            'flex items-center justify-between px-4 py-3',
            'text-sm font-semibold hover:bg-surface-hover/50 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <span>{title}</span>
          <ChevronRight
            className={cn(
              'h-4 w-4 transition-transform duration-200',
              isCollapsed ? 'rotate-0' : 'rotate-90'
            )}
          />
        </button>
        
        {/* Content */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-spring ease-spring',
            isCollapsed ? 'max-h-0' : 'max-h-[600px]'
          )}
        >
          <div className="px-4 pb-4">
            {children}
          </div>
        </div>
      </div>
    )
  }
)

CollapsiblePanel.displayName = 'CollapsiblePanel'
