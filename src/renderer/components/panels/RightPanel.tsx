import { useState } from 'react'
import { MonitorSmartphone, ScrollText } from 'lucide-react'
import { RoutePanel } from '../controls/RoutePanel'
import { DeviceList } from '../device/DeviceList'
import { LogPanel } from '../sidebar/LogPanel'

type BottomTab = 'devices' | 'logs'

export function RightPanel(): JSX.Element {
  const [bottomTab, setBottomTab] = useState<BottomTab | null>(null)

  return (
    <aside className="w-80 bg-card border-l border-border flex flex-col h-full shrink-0 overflow-hidden">
      {/* Route section */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <RoutePanel />
      </div>

      {/* Bottom toggle tabs */}
      <div className="shrink-0 border-t border-border">
        <div className="flex">
          <button
            onClick={() => setBottomTab((t) => t === 'devices' ? null : 'devices')}
            className={`flex-1 py-2 text-xs flex items-center justify-center gap-1.5 transition-colors ${
              bottomTab === 'devices'
                ? 'text-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MonitorSmartphone size={14} />
            Devices
          </button>
          <button
            onClick={() => setBottomTab((t) => t === 'logs' ? null : 'logs')}
            className={`flex-1 py-2 text-xs flex items-center justify-center gap-1.5 transition-colors ${
              bottomTab === 'logs'
                ? 'text-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ScrollText size={14} />
            Logs
          </button>
        </div>

        {/* Expandable content */}
        {bottomTab && (
          <div className="max-h-64 overflow-y-auto border-t border-border">
            {bottomTab === 'devices' && <DeviceList />}
            {bottomTab === 'logs' && <LogPanel />}
          </div>
        )}
      </div>
    </aside>
  )
}
