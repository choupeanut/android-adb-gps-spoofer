import { useState } from 'react'
import { useDeviceStore } from '../../stores/device.store'
import { DeviceCard } from './DeviceCard'
import { ConnectionDialog } from './ConnectionDialog'

export function DeviceList(): JSX.Element {
  const devices = useDeviceStore((s) => s.devices)
  const activeDevice = useDeviceStore((s) => s.activeDevice)
  const selectedSerials = useDeviceStore((s) => s.selectedSerials)
  const selectDevice = useDeviceStore((s) => s.selectDevice)
  const toggleSelectSerial = useDeviceStore((s) => s.toggleSelectSerial)
  const selectAll = useDeviceStore((s) => s.selectAll)
  const clearSelection = useDeviceStore((s) => s.clearSelection)
  const [showDialog, setShowDialog] = useState(false)

  const connectedCount = devices.filter((d) => d.status === 'connected').length

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Devices
          </h3>
          {selectedSerials.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary rounded-full">
              {selectedSerials.length} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {connectedCount > 1 && (
            <>
              <button
                onClick={selectAll}
                className="text-[10px] text-primary hover:underline"
                title="Select all connected devices"
              >
                All
              </button>
              <button
                onClick={clearSelection}
                className="text-[10px] text-muted-foreground hover:underline"
                title="Clear selection"
              >
                None
              </button>
            </>
          )}
          <button
            onClick={() => setShowDialog(true)}
            className="text-xs text-primary hover:underline"
            title="Add Wi-Fi device"
          >
            + Wi-Fi
          </button>
        </div>
      </div>

      {devices.length === 0 ? (
        <p className="text-xs text-muted-foreground">No devices. Connect Android via USB.</p>
      ) : (
        <div className="space-y-1.5">
          {devices.map((device) => (
            <DeviceCard
              key={device.serial}
              device={device}
              isActive={device.serial === activeDevice}
              isSelected={selectedSerials.includes(device.serial)}
              onSelect={() => selectDevice(device.serial)}
              onToggleSelect={() => toggleSelectSerial(device.serial)}
            />
          ))}
        </div>
      )}

      {selectedSerials.length > 1 ? (
        <div className="mt-2 text-[10px] px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
          Broadcast → {selectedSerials.length} devices
        </div>
      ) : (
        <div className="mt-2 text-[10px] text-muted-foreground">
          Individual control
        </div>
      )}

      {showDialog && (
        <ConnectionDialog
          onClose={() => setShowDialog(false)}
          onConnected={() => {}}
        />
      )}
    </div>
  )
}
