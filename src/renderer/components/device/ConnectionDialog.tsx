import { useState, useEffect } from 'react'
import { useDeviceStore } from '../../stores/device.store'

interface Props {
  onClose: () => void
  onConnected: () => void
}

type Step = 'method' | 'wifi-ip' | 'usb-tcpip'

export function ConnectionDialog({ onClose, onConnected }: Props): JSX.Element {
  const devices = useDeviceStore((s) => s.devices)
  const [step, setStep] = useState<Step>('method')
  const [ip, setIp] = useState('')
  const [port, setPort] = useState('5555')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  // Auto-detect client LAN IP (web only)
  useEffect(() => {
    const api = (window as any).api
    if (api?.getClientIp) {
      api.getClientIp().then((detectedIp: string | null) => {
        if (detectedIp && !ip) setIp(detectedIp)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnectWifi = async (): Promise<void> => {
    if (!ip.trim()) return
    setLoading(true)
    setStatus('Connecting...')
    try {
      const result = await window.api.connectWifi(ip.trim(), parseInt(port) || 5555)
      const connected = typeof result === 'boolean' ? result : result.ok
      if (connected) {
        setStatus('Connected! Waiting for device…')
        // Wait for the device to appear as 'connected' in the devices list
        const targetSerial = `${ip.trim()}:${parseInt(port) || 5555}`
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
          setStatus('Device ready!')
          setTimeout(() => { onConnected(); onClose() }, 500)
        } else {
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
        if (result.ip) setIp(result.ip)
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
