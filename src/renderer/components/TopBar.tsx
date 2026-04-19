import { useState, useRef, useEffect } from 'react'
import {
  Square, ChevronDown, Footprints, Bike, Car, TrainFront, Plane, SlidersHorizontal, Check, HelpCircle, Plus
} from 'lucide-react'
import { useDeviceStore } from '../stores/device.store'
import { useLocationStore } from '../stores/location.store'
import { useRouteStore } from '../stores/route.store'
import { StopAllModal } from './StopAllModal'
import { ConnectionDialog } from './device/ConnectionDialog'
import { SPEED_PRESETS } from '@shared/constants'
import type { SpeedMode } from '@shared/types'

function toKph(ms: number): string {
  return (ms * 3.6).toFixed(0)
}

const SPEED_ITEMS: { mode: SpeedMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'walk', label: 'Walk', icon: <Footprints size={14} /> },
  { mode: 'cycle', label: 'Cycle', icon: <Bike size={14} /> },
  { mode: 'drive', label: 'Drive', icon: <Car size={14} /> },
  { mode: 'hsr', label: 'HSR', icon: <TrainFront size={14} /> },
  { mode: 'plane', label: 'Plane', icon: <Plane size={14} /> },
  { mode: 'custom', label: 'Custom', icon: <SlidersHorizontal size={14} /> }
]

export function TopBar(): JSX.Element {
  const devices = useDeviceStore((s) => s.devices)
  const activeDevice = useDeviceStore((s) => s.activeDevice)
  const selectedSerials = useDeviceStore((s) => s.selectedSerials)
  const selectDevice = useDeviceStore((s) => s.selectDevice)
  const toggleSelectSerial = useDeviceStore((s) => s.toggleSelectSerial)
  const mode = useLocationStore((s) => s.mode)

  const speedMs = useRouteStore((s) => s.speedMs)
  const setSpeedMs = useRouteStore((s) => s.setSpeedMs)
  const playing = useRouteStore((s) => s.playing)

  const [speedMode, setSpeedMode] = useState<SpeedMode>('walk')
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false)
  const [showStopModal, setShowStopModal] = useState(false)
  const [showCustomSlider, setShowCustomSlider] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showConnectionDialog, setShowConnectionDialog] = useState(false)
  const [deviceStates, setDeviceStates] = useState<Record<string, { mode: string }>>({})
  const [appVersion, setAppVersion] = useState<string>('')

  useEffect(() => {
    window.api.getAppVersion().then((v: string) => setAppVersion(v)).catch(() => {})
  }, [])  
  const [appVersion, setAppVersion] = useState<string>('')

  useEffect(() => {
    window.api.getAppVersion().then((v: string) => setAppVersion(v)).catch(() => {})
  }, [])
  const deviceDropdownRef = useRef<HTMLDivElement>(null)
  const customSliderRef = useRef<HTMLDivElement>(null)
  const shortcutsRef = useRef<HTMLDivElement>(null)

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (deviceDropdownRef.current && !deviceDropdownRef.current.contains(e.target as Node)) {
        setShowDeviceDropdown(false)
      }
      if (customSliderRef.current && !customSliderRef.current.contains(e.target as Node)) {
        setShowCustomSlider(false)
      }
      if (shortcutsRef.current && !shortcutsRef.current.contains(e.target as Node)) {
        setShowShortcuts(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Fetch per-device states when dropdown is open
  useEffect(() => {
    if (!showDeviceDropdown) return
    let cancelled = false
    const fetch = async (): Promise<void> => {
      const states = await window.api.getAllDeviceStates()
      if (!cancelled) setDeviceStates(states)
    }
    fetch()
    const t = setInterval(fetch, 3000)
    return () => { cancelled = true; clearInterval(t) }
  }, [showDeviceDropdown])

  const handleSpeedChange = (mode: SpeedMode): void => {
    if (mode === 'custom') {
      setSpeedMode('custom')
      setShowCustomSlider(true)
      return
    }
    setShowCustomSlider(false)
    setSpeedMode(mode)
    const ms = SPEED_PRESETS[mode]
    setSpeedMs(ms)
    if (playing) window.api.routeSetSpeed(ms)
  }

  const handleCustomSpeedChange = (ms: number): void => {
    setSpeedMs(ms)
    if (playing) window.api.routeSetSpeed(ms)
  }

  const availableDevices = devices.filter((d) => d.status === 'connected' || d.status === 'unauthorized')
  const activeDeviceInfo = devices.find((d) => d.serial === activeDevice)
  const selectedCount = selectedSerials.length

  const modeColor: Record<string, string> = {
    idle: 'bg-foreground-muted',
    teleport: 'bg-secondary',
    joystick: 'bg-success',
    route: 'bg-warning'
  }

  return (
    <>
      <header className="h-11 glass border-b border-white/10 flex items-center px-3 gap-3 shrink-0 z-[30]">
        {/* Device selector */}
        <div className="relative" ref={deviceDropdownRef}>
          <button
            onClick={() => setShowDeviceDropdown((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-surface-elevated border border-border rounded-[var(--radius-sm)] hover:bg-surface-hover transition-colors min-w-[140px]"
          >
            <div className={`w-2 h-2 rounded-full ${modeColor[mode] ?? 'bg-foreground-muted'}`} />
            <span className="truncate text-foreground">
              {activeDeviceInfo?.model || activeDevice || 'No device'}
            </span>
            {selectedCount > 1 && (
              <span className="text-xs text-primary">({selectedCount})</span>
            )}
            <ChevronDown size={14} className="text-foreground-muted shrink-0" />
          </button>

          {showDeviceDropdown && (
            <div className="absolute top-full mt-1 left-0 w-64 bg-surface border border-border rounded-[var(--radius-md)] shadow-elevation-lg py-1 z-[1200]">
              {availableDevices.length === 0 && (
                <p className="px-3 py-2 text-xs text-foreground-muted">No devices connected</p>
              )}
              {availableDevices.length > 0 && (
                availableDevices.map((dev) => {
                  const isActive = dev.serial === activeDevice
                  const isSelected = selectedSerials.includes(dev.serial)
                  const devState = deviceStates[dev.serial]
                  const devModeColor = devState ? (modeColor[devState.mode] ?? 'bg-foreground-muted') : 'bg-foreground-muted'
                  return (
                    <div
                      key={dev.serial}
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-hover/50 transition-colors ${isActive ? 'bg-primary/10' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectSerial(dev.serial)}
                        className="rounded shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className={`w-2 h-2 rounded-full shrink-0 ${devModeColor}`} />
                      <button
                        className="flex-1 text-left"
                        onClick={() => {
                          if (dev.status === 'unauthorized') return
                          selectDevice(dev.serial)
                          setShowDeviceDropdown(false)
                        }}
                        disabled={dev.status === 'unauthorized'}
                      >
                        <p className="text-sm text-foreground flex items-center gap-1.5">
                          {dev.model || dev.serial}
                          {isActive && <Check size={12} className="text-primary" />}
                          {dev.status === 'unauthorized' && <span className="text-xs text-warning">⚠ Unauthorized</span>}
                        </p>
                        <p className="text-xs text-foreground-secondary">
                          {dev.serial} · {dev.connectionType}
                          {dev.status === 'unauthorized' && ' · Tap "Allow" on phone'}
                        </p>
                      </button>
                    </div>
                  )
                })
              )}
              {/* Add Device button */}
              <button
                onClick={() => {
                  setShowDeviceDropdown(false)
                  setShowConnectionDialog(true)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-surface-hover/50 border-t border-border transition-colors"
              >
                <Plus size={14} />
                Add Device
              </button>
            </div>
          )}
        </div>

        {/* Speed pills */}
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {SPEED_ITEMS.map(({ mode: m, label, icon }) => (
            <button
              key={m}
              onClick={() => handleSpeedChange(m)}
              title={m !== 'custom' ? `${SPEED_PRESETS[m]} m/s (${toKph(SPEED_PRESETS[m])} km/h)` : 'Custom speed'}
              className={`h-9 px-3 text-xs rounded-[var(--radius-sm)] flex items-center gap-1.5 whitespace-nowrap transition-all ${
                speedMode === m
                  ? 'bg-primary text-primary-foreground shadow-elevation-sm'
                  : 'bg-surface-elevated text-foreground-secondary border border-border hover:bg-surface-hover hover:text-foreground'
              }`}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
          <span className="text-xs text-foreground-muted ml-1 whitespace-nowrap hidden md:block text-mono">
            {speedMs.toFixed(1)} m/s ({toKph(speedMs)} km/h)
          </span>
        </div>

        {/* Custom speed slider popover */}
        {showCustomSlider && (
          <div
            ref={customSliderRef}
            className="absolute top-12 left-1/2 -translate-x-1/2 glass-light rounded-[var(--radius-md)] shadow-elevation-lg p-4 z-[1200] w-64"
          >
            <p className="text-xs text-foreground-secondary mb-2 font-medium">Custom Speed</p>
            <input
              type="range"
              min={0.5}
              max={300}
              step={0.5}
              value={speedMs}
              onChange={(e) => handleCustomSpeedChange(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="text-xs text-foreground text-center mt-2 text-mono">
              {speedMs.toFixed(1)} m/s ({toKph(speedMs)} km/h)
            </p>
          </div>
        )}

        {/* Keyboard shortcuts help */}
        <div className="relative" ref={shortcutsRef}>
          <button
            onClick={() => setShowShortcuts((v) => !v)}
            className="p-1.5 text-foreground-muted hover:text-foreground hover:bg-surface-elevated rounded-[var(--radius-xs)] transition-colors"
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
          >
            <HelpCircle size={16} />
          </button>
          {showShortcuts && (
            <div className="absolute top-full mt-1 right-0 w-56 glass-light rounded-[var(--radius-md)] shadow-elevation-lg p-3 z-[1200]">
              <p className="text-xs font-semibold text-foreground mb-2">Keyboard Shortcuts</p>
              <div className="space-y-1 text-xs text-foreground-secondary">
                <div className="flex justify-between"><span>Move</span><kbd className="text-foreground bg-surface-elevated px-1.5 py-0.5 rounded text-mono">W A S D</kbd></div>
                <div className="flex justify-between"><span>Move (alt)</span><kbd className="text-foreground bg-surface-elevated px-1.5 py-0.5 rounded text-mono">Arrow keys</kbd></div>
              </div>
            </div>
          )}
        </div>

        {/* Version badge */}
        {appVersion && (
          <span className="text-[10px] text-foreground-muted hidden md:block font-mono shrink-0 select-none">
            v{appVersion}
          </span>
        )}

        {/* Stop All */}
        <button
          onClick={() => setShowStopModal(true)}
          className="h-9 px-3 text-sm bg-danger text-white rounded-[var(--radius-sm)] hover:brightness-110 flex items-center gap-1.5 shrink-0 transition-all shadow-elevation-sm"
        >
          <Square size={14} />
          <span className="hidden sm:inline">Stop All</span>
        </button>
      </header>

      <StopAllModal isOpen={showStopModal} onClose={() => setShowStopModal(false)} />
      {showConnectionDialog && (
        <ConnectionDialog
          onClose={() => setShowConnectionDialog(false)}
          onConnected={() => setShowConnectionDialog(false)}
        />
      )}
    </>
  )
}
