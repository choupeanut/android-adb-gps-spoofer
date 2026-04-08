import { useRef, useCallback, useState } from 'react'
import { Navigation, Route, ChevronUp } from 'lucide-react'
import { TeleportPanel } from '../controls/TeleportPanel'
import { Joystick } from '../controls/Joystick'
import { RoutePanel } from '../controls/RoutePanel'
import { useUiStore, type Tab } from '../../stores/ui.store'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'teleport', label: 'Teleport', icon: <Navigation size={16} /> },
  { id: 'route', label: 'Route', icon: <Route size={16} /> }
]

/** Minimum drag distance (px) to trigger snap. */
const SNAP_THRESHOLD = 40

export function BottomSheet(): JSX.Element {
  const activeTab = useUiStore((s) => s.activeTab)
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const setMapClickMode = useUiStore((s) => s.setMapClickMode)

  const [minimized, setMinimized] = useState(false)
  const [dragOffset, setDragOffset] = useState(0) // positive = dragging down
  const dragStartY = useRef<number | null>(null)
  const isDragging = useRef(false)

  const handleTabChange = (tab: Tab): void => {
    setActiveTab(tab)
    if (tab === 'route') setMapClickMode('route')
    else setMapClickMode('teleport')
  }

  // ─── Touch gestures on handle area ──────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    isDragging.current = false
    setDragOffset(0)
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    const dy = e.touches[0].clientY - dragStartY.current
    isDragging.current = true
    if (minimized) {
      // When minimized, allow dragging up (negative dy)
      setDragOffset(Math.min(0, dy))
    } else {
      // When expanded, allow dragging down (positive dy)
      setDragOffset(Math.max(0, dy))
    }
  }, [minimized])

  const onTouchEnd = useCallback(() => {
    if (dragStartY.current === null) return
    if (isDragging.current) {
      if (minimized) {
        // Swipe up to expand
        if (dragOffset < -SNAP_THRESHOLD) setMinimized(false)
      } else {
        // Swipe down to minimize
        if (dragOffset > SNAP_THRESHOLD) setMinimized(true)
      }
    }
    dragStartY.current = null
    isDragging.current = false
    setDragOffset(0)
  }, [minimized, dragOffset])

  const handleToggle = (): void => setMinimized((v) => !v)

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[1050] bg-card border-t border-border rounded-t-xl shadow-2xl flex flex-col"
      style={{
        maxHeight: minimized ? 'auto' : '45vh',
        transform: dragOffset !== 0 ? `translateY(${dragOffset}px)` : undefined,
        transition: dragOffset !== 0 ? 'none' : 'transform 0.3s ease'
      }}
    >
      {/* Drag handle — swipeable + tappable */}
      <div
        className="flex justify-center items-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleToggle}
      >
        <div className="w-10 h-1 rounded-full bg-muted-foreground/40" />
      </div>

      {minimized ? (
        /* Minimized: just show tab pills as a compact bar */
        <div className="flex items-center px-2 pb-2 gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                handleTabChange(tab.id)
                setMinimized(false)
              }}
              className={`flex-1 py-1.5 text-xs font-medium flex items-center justify-center gap-1 rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          <button
            onClick={() => setMinimized(false)}
            className="p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Expand panel"
          >
            <ChevronUp size={16} />
          </button>
        </div>
      ) : (
        <>
          {/* Tab switcher */}
          <div className="flex border-b border-border shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  activeTab === tab.id
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === 'teleport' && <TeleportPanel />}
            {activeTab === 'route' && <RoutePanel />}
            
            {/* Joystick always available at bottom */}
            <div className="border-t border-border pt-4 mt-4">
              <p className="text-xs text-foreground-secondary mb-3 text-center">Manual Control</p>
              <Joystick />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
