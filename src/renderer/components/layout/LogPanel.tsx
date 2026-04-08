import React from 'react'
import { CollapsiblePanel } from './CollapsiblePanel'
import { LogPanel as LogPanelContent } from '../sidebar/LogPanel'

export const LogPanel: React.FC = () => {
  return (
    <div className="absolute left-3 bottom-3 w-72 max-h-[280px] z-[20]">
      <CollapsiblePanel title="Logs" defaultCollapsed={true} glass>
        <div className="max-h-[220px]">
          <LogPanelContent />
        </div>
      </CollapsiblePanel>
    </div>
  )
}
