import React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './Button'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
  showCloseButton?: boolean
}

/** Native modal dialogs make the page inert, trap Tab and restore trigger focus. */
export const Modal: React.FC<ModalProps> = ({
  isOpen, onClose, title, description, children, className, showCloseButton = true
}) => {
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const titleId = React.useId()
  const descriptionId = React.useId()
  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!isOpen || !dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      dialog.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [isOpen])
  if (!isOpen) return null
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : 'Dialog'}
      aria-describedby={description ? descriptionId : undefined}
      className="fixed inset-0 m-0 h-full w-full max-h-none max-w-none bg-transparent p-4 text-foreground open:flex items-center justify-center backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'))
          .filter((element) => element.getClientRects().length > 0)
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className={cn('w-full max-w-lg max-h-full overflow-y-auto rounded-[var(--radius-lg)] bg-surface border border-border shadow-elevation-xl', className)}>
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between p-5 border-b border-border">
            <div className="space-y-1">
              {title && <h2 id={titleId} className="text-lg font-semibold leading-none tracking-tight">{title}</h2>}
              {description && <p id={descriptionId} className="text-sm text-foreground-secondary">{description}</p>}
            </div>
            {showCloseButton && <Button variant="icon" size="sm" onClick={onClose} className="ml-4 shrink-0" aria-label="Close"><X className="h-4 w-4" /></Button>}
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </dialog>, document.body
  )
}
Modal.displayName = 'Modal'
