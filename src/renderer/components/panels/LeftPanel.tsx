import { TeleportPanel } from '../controls/TeleportPanel'
import { Joystick } from '../controls/Joystick'

export function LeftPanel(): JSX.Element {
  return (
    <aside className="w-72 bg-card border-r border-border flex flex-col h-full shrink-0 overflow-hidden">
      {/* Teleport section */}
      <div className="flex-1 overflow-y-auto border-b border-border min-h-0">
        <TeleportPanel />
      </div>

      {/* Move/Joystick section */}
      <div className="shrink-0">
        <Joystick />
      </div>
    </aside>
  )
}
