import { useState } from 'react'
import { Plug, MapPin } from 'lucide-react'
import type { DeviceInfo } from '@shared/types'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'

interface Props {
  device: DeviceInfo
  isActive: boolean
  isSelected: boolean
  onSelect: () => void
  onToggleSelect: () => void
}

const statusColors = {
  connected: 'bg-green-500',
  unauthorized: 'bg-yellow-500',
  offline: 'bg-red-500'
}

const statusLabels = {
  connected: 'Connected',
  unauthorized: 'Auth required',
  offline: 'Offline'
}

type TestResult = { ok: boolean; latencyMs: number; message: string } | null

const getBadgeVariant = (status: DeviceInfo['status']) => {
  if (status === 'connected') return 'success'
  if (status === 'unauthorized') return 'warning'
  return 'danger'
}

export function DeviceCard({ device, isActive, isSelected, onSelect, onToggleSelect }: Props): JSX.Element {
  const [testResult, setTestResult] = useState<TestResult>(null)
  const [testing, setTesting] = useState(false)
  const [setupLog, setSetupLog] = useState<string[]>([])
  const [showLog, setShowLog] = useState(false)

  const handleTest = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    setTesting(true)
    setTestResult(null)
    const result = await window.api.testAdb(device.serial)
    setTestResult(result)
    setTesting(false)
  }

  const handleSetup = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    setTesting(true)
    setSetupLog([])
    const result = await window.api.enableMockLocation(device.serial)
    setSetupLog(result.log ?? [])
    setShowLog(true)
    setTesting(false)
  }

  return (
    <Card
      onClick={onSelect}
      className={`cursor-pointer transition-all hover:-translate-y-0.5 ${
        isActive
          ? 'border-primary bg-primary/10 shadow-elevation-md'
          : 'hover:shadow-elevation-sm'
      }`}
    >
      {/* Main row */}
      <div className="flex items-center gap-2">
        {/* Multi-select checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 accent-primary cursor-pointer"
          title="Include in multi-device commands"
        />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{device.model}</p>
          <p className="text-xs text-foreground-secondary truncate text-mono">
            {device.serial} · {device.connectionType.toUpperCase()}
            {device.androidVersion ? ` · Android ${device.androidVersion}` : ''}
          </p>
        </div>

        <Badge variant={getBadgeVariant(device.status)} className="flex-shrink-0">
          {statusLabels[device.status]}
        </Badge>
      </div>

      {/* Test buttons — only show for connected devices */}
      {device.status === 'connected' && (
        <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            disabled={testing}
            isLoading={testing}
            className="flex-1"
          >
            <Plug size={14} />
            Test ADB
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSetup}
            disabled={testing}
            isLoading={testing}
            className="flex-1"
          >
            <MapPin size={14} />
            Setup GPS
          </Button>
        </div>
      )}

      {testResult && (
        <Card
          glass
          elevation="flat"
          className={`mt-3 p-2 text-xs ${
            testResult.ok ? 'border-success/40 bg-success/10' : 'border-danger/40 bg-danger/10'
          }`}
        >
          <p className={testResult.ok ? 'text-success' : 'text-danger'}>
            {testResult.ok ? '✓' : '✗'} {testResult.message}
          </p>
        </Card>
      )}

      {showLog && setupLog.length > 0 && (
        <Card glass className="mt-3 p-3 max-h-32 overflow-y-auto custom-scrollbar">
          <p className="text-xs font-medium text-foreground-secondary mb-1.5">Setup Log:</p>
          <div className="space-y-0.5 text-[11px] text-mono">
            {setupLog.map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith('✓') ? 'text-success' :
                  line.startsWith('✗') ? 'text-danger' :
                  'text-warning'
                }
              >
                {line}
              </div>
            ))}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowLog(false) }}
            className="mt-2 text-xs text-foreground-secondary hover:text-foreground transition-colors"
          >
            close
          </button>
        </Card>
      )}
    </Card>
  )
}
