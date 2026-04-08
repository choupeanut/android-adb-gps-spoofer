import React from 'react'
import { cn } from '../../utils/cn'

export interface FloatingPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: number | string
  glass?: boolean
  children: React.ReactNode
}

export const FloatingPanel = React.forwardRef<HTMLDivElement, FloatingPanelProps>(
  ({ className, width = 360, glass = true, children, ...props }, ref) => {
    const widthStyle = typeof width === 'number' ? `${width}px` : width
    
    return (
      <div
        ref={ref}
        className={cn(
          'absolute z-[20] flex flex-col',
          'rounded-[var(--radius-md)] overflow-hidden',
          'shadow-elevation-lg panel-enter',
          glass ? 'glass' : 'bg-surface border border-border',
          className
        )}
        style={{ width: widthStyle }}
        {...props}
      >
        {children}
      </div>
    )
  }
)

FloatingPanel.displayName = 'FloatingPanel'
