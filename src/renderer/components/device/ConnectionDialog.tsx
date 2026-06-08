import { useState, useEffect } from 'react'
import { useDeviceStore } from '../../stores/device.store'
import {
  mergeWifiIpHistory,
  recordWifiIpLocally,
  sortWifiIpHistory
} from '../../utils/wifi-ip-history'
import type { WifiIpHistoryEntry } from '@shared/types'

interface Props {
  onClose: () => void
  onConnected: () => void
}

type Step = 'method' | 'wifi-ip' | 'usb-tcpip'

const WIFI_HISTORY_KEY = 'gps-spoofer:wifi-ip-history'
const QUICK_HISTORY_LIMIT = 5

function readLocalHistory(): WifiIpHistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(WIFI_HISTORY_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry) =>
      typeof entry.ip === 'string' &&
      typeof entry.port === 'number' &&
      typeof entry.useCount === 'number' &&
      typeof entry.lastUsedAt === 'string'
    )
  } catch {
    return []
  }
}

function writeLocalHistory(entries: WifiIpHistoryEntry[]): void {
  localStorage.setItem(WIFI_HISTORY_KEY, JSON.stringify(sortWifiIpHistory(entries).slice(0, 20)))
}

export function ConnectionDialog({ onClose, onConnected }: Props): JSX.Element {
  const devices = useDeviceStore((s) => s.devices)
  const selectSerial = useDeviceStore((s) => s.selectSerial)
  const setActiveDevice = useDeviceStore((s) => s.setActiveDevice)
  const [step, setStep] = useState<Step>('method')
  const [ip, setIp] = useState('')
  const [port, setPort] = useState('5555')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [ipHistory, setIpHistory] = useState<WifiIpHistoryEntry[]>([])

  useEffect(() => {
    const local = readLocalHistory()
    setIpHistory(local)
    window.api.getWifiIpHistory()
      .then((serverHistory: WifiIpHistoryEntry[]) => {
        const merged = mergeWifiIpHistory(local, serverHistory)
        setIpHistory(merged)
        writeLocalHistory(merged)
      })
      .catch(() => {})
  }, [])

  // Auto-detect client LAN IP (web only)
  useEffect(() => {
    const api = (window as any).api
    if (api?.getClientIp) {
      api.getClientIp().then((detectedIp: string | null) => {
        if (detectedIp && !ip) setIp(detectedIp)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const recordIp = async (nextIp: string, nextPort: number): Promise<void> => {
    const local = readLocalHistory()
    const localNext = recordWifiIpLocally(local, nextIp, nextPort)
    setIpHistory(localNext)
    writeLocalHistory(localNext)

    try {
      const serverNext = await window.api.recordWifiIp(nextIp, nextPort)
      const merged = mergeWifiIpHistory(localNext, serverNext)
      setIpHistory(merged)
      writeLocalHistory(merged)
    } catch {
      // Local history is still useful if the shared database is unavailable.
    }
  }

  const deleteIpHistory = async (entry: WifiIpHistoryEntry): Promise<void> => {
    const next = readLocalHistory().filter((item) => item.ip !== entry.ip || item.port !== entry.port)
    setIpHistory(next)
    writeLocalHistory(next)
    await window.api.deleteWifiIpHistory(entry.ip, entry.port).catch(() => {})
  }

  const markDeviceSelected = (serial: string): void => {
    selectSerial(serial)
    if (!useDeviceStore.getState().activeDevice) {
      setActiveDevice(serial)
      window.api.setActiveDevice(serial).catch(() => {})
    }
  }

  const handleConnectWifi = async (): Promise<void> => {
    if (!ip.trim()) return
    const cleanIp = ip.trim()
    const cleanPort = parseInt(port) || 5555
    setLoading(true)
    setStatus('Connecting...')
    try {
      const result = await window.api.connectWifi(cleanIp, cleanPort)
      const connected = typeof result === 'boolean' ? result : result.ok
      if (connected) {
        await recordIp(cleanIp, cleanPort)
        setStatus('Connected! Waiting for device…')
        // Wait for the device to appear as 'connected' in the devices list
        const targetSerial = `${cleanIp}:${cleanPort}`
        let found = false
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 1000))
          const current = useDeviceStore.getState().devices
          if (current.some((d) => d.serial === targetSerial && d.status === 'connected')) {
            found = true
            break
          }
        }
        if (found) {
          markDeviceSelected(targetSerial)
          setStatus('Device ready!')
          setTimeout(() => { onConnected(); onClose() }, 500)
        } else {
          markDeviceSelected(targetSerial)
          setStatus('Device connected but not fully ready. It may appear shortly.')
          setTimeout(() => { onConnected(); onClose() }, 2000)
        }
      } else {
        if (typeof result === 'boolean') {
          setStatus('Connection failed. Check IP and that adb tcpip was run.')
        } else {
          const adbHint = result.usingSystemAdb
            ? ` Using system adb: ${result.adbPath}.`
            : ` Using bundled adb: ${result.adbPath}.`
          setStatus(`${result.message || 'Connection failed. Check IP and that adb tcpip was run.'}${adbHint}`)
        }
      }
    } catch {
      setStatus('Error connecting.')
    }
    setLoading(false)
  }

  const handleEnableTcpip = async (): Promise<void> => {
    const usbDevice = devices.find((d) => d.connectionType === 'usb' && d.status === 'connected')
    if (!usbDevice) {
      setStatus('No USB device connected. Connect your Android device via USB first.')
      return
    }
    setLoading(true)
    setStatus('Enabling TCP/IP mode on USB device...')
    try {
      const result = await window.api.enableTcpip(usbDevice.serial)
      if (result.success) {
        setStatus(`Ready. Device IP: ${result.ip ?? 'unknown'}. Now unplug USB and connect via Wi-Fi.`)
        if (result.ip) {
          setIp(result.ip)
          await recordIp(result.ip, parseInt(port) || 5555)
        }
        setStep('wifi-ip')
      } else {
        setStatus('Failed. Make sure a device is connected via USB.')
      }
    } catch {
      setStatus('Error.')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl p-6 w-96 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Add Device</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
        </div>

        {step === 'method' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">How do you want to connect?</p>
            <button
              onClick={() => setStep('wifi-ip')}
              className="w-full py-3 text-sm bg-secondary text-secondary-foreground rounded-lg hover:opacity-80 text-left px-4"
            >
              <span className="font-medium">Wi-Fi (direct IP)</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Enter device IP — requires adb tcpip already enabled
              </span>
            </button>
            <button
              onClick={() => setStep('usb-tcpip')}
              className="w-full py-3 text-sm bg-secondary text-secondary-foreground rounded-lg hover:opacity-80 text-left px-4"
            >
              <span className="font-medium">USB → Wi-Fi setup</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Enable TCP/IP on USB-connected device, then switch to Wi-Fi
              </span>
            </button>
          </div>
        )}

        {step === 'wifi-ip' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Enter the Android device's local IP address (find it in Settings → Wi-Fi → device info).
            </p>
            {ipHistory.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ipHistory.slice(0, QUICK_HISTORY_LIMIT).map((entry) => (
                  <span
                    key={`${entry.ip}:${entry.port}`}
                    className="inline-flex items-center rounded-md border border-border bg-secondary/10 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setIp(entry.ip)
                        setPort(String(entry.port))
                      }}
                      className="px-2 py-1 text-xs text-primary hover:bg-secondary/15"
                      title={`Used ${entry.useCount} time${entry.useCount === 1 ? '' : 's'}`}
                    >
                      {entry.ip}:{entry.port}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteIpHistory(entry)}
                      className="px-1.5 py-1 text-xs text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${entry.ip}:${entry.port}`}
                      title="Remove from quick list"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="192.168.1.100"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnectWifi()}
                className="flex-1 px-3 py-2 text-sm bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground"
                autoFocus
              />
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-20 px-3 py-2 text-sm bg-input border border-border rounded-md text-foreground"
              />
            </div>
            <button
              onClick={handleConnectWifi}
              disabled={loading || !ip.trim()}
              className="w-full py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        )}

        {step === 'usb-tcpip' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Connect the device via USB first, then click below to enable wireless ADB.
            </p>
            <button
              onClick={handleEnableTcpip}
              disabled={loading}
              className="w-full py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Enabling...' : 'Enable TCP/IP on USB device'}
            </button>
          </div>
        )}

        {status && (
          <p className={`mt-3 text-xs ${status.includes('fail') || status.includes('Error') ? 'text-destructive' : 'text-green-400'}`}>
            {status}
          </p>
        )}

        <button
          onClick={() => { if (step !== 'method') setStep('method'); else onClose() }}
          className="mt-4 text-xs text-muted-foreground hover:text-foreground"
        >
          {step !== 'method' ? '← Back' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
