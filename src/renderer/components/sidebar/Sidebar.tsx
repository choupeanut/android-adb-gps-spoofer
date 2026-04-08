import { DeviceList } from '../device/DeviceList'
import { Joystick } from '../controls/Joystick'
import { RoutePanel } from '../controls/RoutePanel'
import { CooldownTimer } from '../controls/CooldownTimer'
import { SavedLocations } from './SavedLocations'
import { LocationHistory } from './LocationHistory'
import { LogPanel } from './LogPanel'
import { useLocationStore } from '../../stores/location.store'
import { useDeviceStore } from '../../stores/device.store'
import { useUiStore } from '../../stores/ui.store'
import { useRouteStore } from '../../stores/route.store'
import type { Tab } from '../../stores/ui.store'

export function Sidebar(): JSX.Element {
  const activeTab = useUiStore((s) => s.activeTab)
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const mode = useLocationStore((s) => s.mode)
  const setMode = useLocationStore((s) => s.setMode)
  const activeDevice = useDeviceStore((s) => s.activeDevice)

  const handleTabChange = (tab: Tab): void => {
    setActiveTab(tab)
    if (tab === 'route') setMode('route')
    else if (mode === 'route') setMode('idle')
  }

  const handleStopAll = async (): Promise<void> => {
    const targetSerials = useDeviceStore.getState().getTargetSerials()
    if (targetSerials.length === 0) return
    await window.api.stopJoystick()
    const realGps = useLocationStore.getState().realGpsLocation
    const currentMode = useLocationStore.getState().mode
    if (currentMode === 'route') {
      // RouteEngine owns the current position — let it handle the walk-back
      if (realGps) {
        const routeSpeedMs = useRouteStore.getState().speedMs
        window.api.routeReturnToGps(realGps.lat, realGps.lng, routeSpeedMs)
      } else {
        await window.api.routeStop()
      }
    } else {
      await window.api.routeStop()
      if (realGps) {
        window.api.stopSpoofingGraceful(targetSerials, realGps.lat, realGps.lng)
      } else {
        await window.api.stopSpoofing(targetSerials)
      }
    }
  }

  const modeColors: Record<string, string> = {
    idle: 'bg-muted-foreground',
    teleport: 'bg-blue-400',
    joystick: 'bg-green-400',
    route: 'bg-yellow-400'
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'teleport', label: 'Teleport' },
    { id: 'joystick', label: 'Move' },
    { id: 'route', label: 'Route' },
    { id: 'tools', label: 'Tools' },
    { id: 'logs', label: 'Logs' }
  ]

  return (
    <aside className="w-72 bg-card border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-foreground">GPS Spoofer</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={`w-1.5 h-1.5 rounded-full ${modeColors[mode] ?? 'bg-muted-foreground'}`} />
            <span className="text-[11px] text-muted-foreground capitalize">{mode}</span>
          </div>
        </div>
        {mode !== 'idle' && (
          <button
            onClick={handleStopAll}
            className="text-xs px-2 py-1 bg-destructive text-destructive-foreground rounded hover:opacity-80"
          >
            Stop All
          </button>
        )}
      </div>

      {/* Device list */}
      <div className="flex-shrink-0 border-b border-border">
        <DeviceList />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — scrollable (logs tab manages its own scroll) */}
      <div className={`flex-1 ${activeTab === 'logs' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
        {activeTab === 'teleport' && (
          <div>
            <div className="p-4 border-b border-border">
              <p className="text-xs text-muted-foreground">
                Click the map to teleport, or use the panel at top-right. The <span className="text-yellow-400">★</span> button saves a location.
              </p>
            </div>
            <SavedLocations />
            <LocationHistory />
          </div>
        )}

        {activeTab === 'joystick' && (
          <div>
            <Joystick />
          </div>
        )}

        {activeTab === 'route' && (
          <div>
            <div className="px-4 pt-3 pb-1">
              <p className="text-xs text-muted-foreground">
                Click map to add waypoints, import GPX, then press Play.
              </p>
            </div>
            <RoutePanel />
          </div>
        )}

        {activeTab === 'tools' && (
          <div>
            <CooldownTimer />
            <div className="px-4 pt-3 border-t border-border">
              <p className="text-xs font-semibold text-foreground mb-1">Quick Start</p>
              <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
                <li>Enable Developer Options on Android</li>
                <li>Enable USB Debugging</li>
                <li>Connect via USB cable</li>
                <li>Authorize the computer on phone prompt</li>
                <li>Select device &amp; click map to teleport</li>
              </ol>
              <p className="text-xs text-muted-foreground mt-3">
                Requires <span className="text-foreground">Android 12+</span>
              </p>
            </div>
          </div>
        )}

        {activeTab === 'logs' && <LogPanel />}
      </div>
    </aside>
  )
}
