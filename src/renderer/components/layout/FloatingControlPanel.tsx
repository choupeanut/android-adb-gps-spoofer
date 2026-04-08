import React from 'react'
import { ChevronUp } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'
import { TeleportPanel } from '../controls/TeleportPanel'
import { RoutePanel } from '../controls/RoutePanel'
import { LogPanel } from '../sidebar/LogPanel'
import { useUiStore } from '../../stores/ui.store'

export const FloatingControlPanel: React.FC = () => {
  const mapClickMode = useUiStore((s) => s.mapClickMode)
  const [logsExpanded, setLogsExpanded] = React.useState(false)
  
  return (
    <FloatingPanel width={300} glass className="left-3 top-3 bottom-3">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar min-h-0">
        {mapClickMode === 'teleport' && <TeleportPanel />}
        {mapClickMode === 'route' && <RoutePanel />}
      </div>
      
      {/* Logs section at bottom */}
      <div className="flex-shrink-0 border-t border-border/50">
        <button
          onClick={() => setLogsExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-foreground-secondary hover:text-foreground hover:bg-surface-hover/50 transition-colors"
        >
          <span>Logs</span>
          <ChevronUp
            size={14}
            className={`transition-transform duration-200 ${logsExpanded ? 'rotate-0' : 'rotate-180'}`}
          />
        </button>
        {logsExpanded && (
          <div className="h-[200px] border-t border-border/30">
            <LogPanel />
          </div>
        )}
      </div>
    </FloatingPanel>
  )
}
