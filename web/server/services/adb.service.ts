/**
 * Standalone ADB service — no Electron dependencies.
 * Uses findAdb() that doesn't depend on @electron-toolkit/utils.
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join } from 'path'
import { log } from '../logger'
import type { DeviceInfo, LocationUpdate } from '@shared/types'

const execFileAsync = promisify(execFile)

function findAdb(): string {
  if (process.env.ADB_PATH) return process.env.ADB_PATH
  // Docker: android-tools installed via apk
  return 'adb'
}

export class AdbService {
  private adbPath: string
  /** Track last successful push per serial for health monitoring */
  private lastPushSuccess = new Map<string, number>()
  /** Cache which serials have been WiFi-hardened this session */
  private wifiHardened = new Set<string>()
  /** Serials for which master location was force-disabled by experimental mode. */
  private masterLocationForcedOff = new Set<string>()

  constructor() {
    this.adbPath = findAdb()
    log('info', `[AdbService] using adb: ${this.adbPath}`)
  }

  /**
   * Apply WiFi stability settings to prevent Android WiFi sleep
   * from killing the ADB TCP connection.
   */
  async hardenWifiConnection(serial: string): Promise<void> {
    if (this.wifiHardened.has(serial)) return
    if (!serial.includes(':')) return // USB device, skip
    try {
      // Prevent WiFi from sleeping when screen is off
      await execFileAsync(this.adbPath, ['-s', serial, 'shell', 'settings', 'put', 'global', 'wifi_sleep_policy', '2'], { timeout: 3000 }).catch(() => {})
      // Keep WiFi active during Doze (best-effort, may not work on all ROMs)
      await execFileAsync(this.adbPath, ['-s', serial, 'shell', 'dumpsys', 'deviceidle', 'whitelist', '+com.android.shell'], { timeout: 3000 }).catch(() => {})
      this.wifiHardened.add(serial)
      log('info', `[ADB] WiFi hardened for ${serial}`)
    } catch (err: any) {
      log('warn', `[ADB] WiFi harden failed for ${serial}: ${err.message}`)
    }
  }

  /** Milliseconds since last successful pushLocation for this serial */
  getLastPushAge(serial: string): number {
    const last = this.lastPushSuccess.get(serial)
    return last ? Date.now() - last : Infinity
  }

  /** Attempt to reconnect a WiFi ADB device */
  async reconnectWifi(serial: string): Promise<boolean> {
    if (!serial.includes(':')) return false
    const ip = serial.split(':')[0]
    const port = serial.split(':')[1] || '5555'
    try {
      await execFileAsync(this.adbPath, ['disconnect', serial], { timeout: 3000 }).catch(() => {})
      const { stdout } = await execFileAsync(this.adbPath, ['connect', `${ip}:${port}`], { timeout: 8000 })
      const ok = stdout.includes('connected')
      if (ok) log('info', `[ADB] Reconnected WiFi: ${serial}`)
      return ok
    } catch {
      return false
    }
  }

  private isExperimentalMasterLocationToggleEnabled(): boolean {
    return process.env.EXPERIMENTAL_DISABLE_REAL_GPS_ON_FAKE === '1'
  }

  async setMasterLocationEnabled(serial: string, enabled: boolean): Promise<boolean> {
    try {
      await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'cmd', 'location', 'set-location-enabled', String(enabled)],
        { timeout: 4000 }
      )
      return true
    } catch {
      try {
        await execFileAsync(
          this.adbPath,
          ['-s', serial, 'shell', 'cmd', 'location', 'set-location-enabled', String(enabled), '--user', '0'],
          { timeout: 4000 }
        )
        return true
      } catch (err: any) {
        log('warn', `[ADB] set-location-enabled ${enabled} failed for ${serial}: ${err.message}`)
        return false
      }
    }
  }

  async maybeDisableMasterLocationForSpoof(serial: string): Promise<void> {
    if (!this.isExperimentalMasterLocationToggleEnabled()) return
    if (this.masterLocationForcedOff.has(serial)) return
    const ok = await this.setMasterLocationEnabled(serial, false)
    if (ok) {
      this.masterLocationForcedOff.add(serial)
      log('warn', `[ADB] Experimental mode: master location disabled for ${serial}`)
    }
  }

  async maybeRestoreMasterLocation(serial: string): Promise<void> {
    if (!this.masterLocationForcedOff.has(serial)) return
    const ok = await this.setMasterLocationEnabled(serial, true)
    if (ok) {
      this.masterLocationForcedOff.delete(serial)
      log('info', `[ADB] Experimental mode: master location restored for ${serial}`)
    }
  }

  async listDevices(): Promise<DeviceInfo[]> {
    try {
      const { stdout } = await execFileAsync(this.adbPath, ['devices', '-l'], { timeout: 5000 })
      log('info', `[ADB] devices output:\n${stdout}`)
      const lines = stdout.trim().split('\n').slice(1)
      const devices: DeviceInfo[] = []

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        const parts = trimmed.split(/\s+/)
        const serial = parts[0]
        const statusStr = parts[1]

        let status: DeviceInfo['status'] = 'offline'
        if (statusStr === 'device') status = 'connected'
        else if (statusStr === 'unauthorized') status = 'unauthorized'

        const modelMatch = trimmed.match(/model:(\S+)/)
        const model = modelMatch ? modelMatch[1].replace(/_/g, ' ') : 'Unknown'
        const connectionType = serial.includes(':') ? 'wifi' : 'usb'

        let androidVersion = ''
        if (status === 'connected') {
          try {
            const { stdout: ver } = await execFileAsync(
              this.adbPath,
              ['-s', serial, 'shell', 'getprop', 'ro.build.version.release'],
              { timeout: 3000 }
            )
            androidVersion = ver.trim()
          } catch {
            androidVersion = 'unknown'
          }
        }

        devices.push({ serial, model, androidVersion, connectionType, status, mockLocationActive: false })
      }

      return devices
    } catch {
      return []
    }
  }

  async testConnection(serial: string): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const start = Date.now()
    log('info', `[TestADB] pinging ${serial}...`)
    try {
      const { stdout } = await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'echo', 'pong'],
        { timeout: 8000 }
      )
      const latencyMs = Date.now() - start
      const ok = stdout.trim() === 'pong'
      const message = ok ? `OK (${latencyMs}ms)` : `Unexpected output: "${stdout.trim()}"`
      log(ok ? 'ok' : 'warn', `[TestADB] ${serial}: ${message}`)
      return { ok, latencyMs, message }
    } catch (err: any) {
      const message = err.message ?? 'Timeout'
      log('error', `[TestADB] ${serial}: ${message}`)
      return { ok: false, latencyMs: Date.now() - start, message }
    }
  }

  async enableMockLocation(serial: string): Promise<{ ok: boolean; log: string[] }> {
    const logLines: string[] = []
    let ok = true

    try {
      await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'appops', 'set', 'com.android.shell', 'android:mock_location', 'allow'],
        { timeout: 5000 }
      )
      logLines.push('✓ appops mock_location allow')
    } catch {
      try {
        await execFileAsync(
          this.adbPath,
          ['-s', serial, 'shell', 'appops', 'set', 'com.android.shell', 'mock_location', 'allow'],
          { timeout: 5000 }
        )
        logLines.push('✓ appops mock_location allow (legacy)')
      } catch (err2: any) {
        logLines.push(`⚠ appops warning: ${err2.message}`)
      }
    }

    try {
      const { stdout } = await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'cmd', 'location', 'providers', 'add-test-provider', 'gps'],
        { timeout: 5000 }
      )
      logLines.push(`✓ add-test-provider gps${stdout.trim() ? ': ' + stdout.trim() : ''}`)
    } catch (err: any) {
      logLines.push(`✗ add-test-provider failed: ${err.message}`)
      ok = false
    }

    try {
      await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'cmd', 'location', 'providers', 'set-test-provider-enabled', 'gps', 'true'],
        { timeout: 5000 }
      )
      logLines.push('✓ set-test-provider-enabled gps true')
    } catch (err: any) {
      logLines.push(`✗ set-test-provider-enabled failed: ${err.message}`)
      ok = false
    }

    return { ok, log: logLines }
  }

  async pushLocation(serial: string, loc: LocationUpdate): Promise<boolean> {
    try {
      await execFileAsync(
        this.adbPath,
        [
          '-s', serial, 'shell',
          'cmd', 'location', 'providers', 'set-test-provider-location', 'gps',
          '--location', `${loc.lat},${loc.lng}`,
          '--accuracy', String(loc.accuracy),
          '--time', String(loc.timestamp)
        ],
        { timeout: 4000 }
      )
      this.lastPushSuccess.set(serial, Date.now())
      return true
    } catch (err: any) {
      // W6 fallback: try simplified format for older Android versions
      try {
        await execFileAsync(
          this.adbPath,
          [
            '-s', serial, 'shell',
            'cmd', 'location', 'providers', 'set-test-provider-location', 'gps',
            `${loc.lat},${loc.lng}`
          ],
          { timeout: 4000 }
        )
        this.lastPushSuccess.set(serial, Date.now())
        return true
      } catch {
        log('error', `[pushLocation] ${serial}: ${err.message}`)
        return false
      }
    }
  }

  async removeTestProvider(serial: string): Promise<void> {
    try {
      await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'cmd', 'location', 'providers', 'remove-test-provider', 'gps'],
        { timeout: 5000 }
      )
    } catch { /* ignore */ }
  }

  async connectWifi(ip: string, port = 5555): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(this.adbPath, ['connect', `${ip}:${port}`], { timeout: 10000 })
      log('info', `[ADB] connect ${ip}:${port} → ${stdout.trim()}`)
      return stdout.includes('connected')
    } catch (err: any) {
      log('error', `[ADB] connect failed: ${err.message}`)
      return false
    }
  }

  async enableTcpip(serial: string, port = 5555): Promise<boolean> {
    try {
      await execFileAsync(this.adbPath, ['-s', serial, 'tcpip', String(port)], { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  async getDeviceIp(serial: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'ip', 'route'],
        { timeout: 5000 }
      )
      const match = stdout.match(/src (\d+\.\d+\.\d+\.\d+)/)
      return match ? match[1] : null
    } catch {
      return null
    }
  }

  async getRealLocation(serial: string): Promise<{ lat: number; lng: number } | null> {
    const safeRun = async (args: string[]): Promise<string> => {
      try {
        const { stdout } = await execFileAsync(this.adbPath, args, { timeout: 6000 })
        return stdout
      } catch (err: any) {
        return err.stdout ?? ''
      }
    }

    const c = '(-?\\d+\\.?\\d*)'
    const sep = ',\\s*'
    const allowContaminatedFallback = process.env.ALLOW_CONTAMINATED_REAL_GPS === '1'

    // Only trust `network` provider — fused/gps/passive are contaminated by mock GPS.
    const SAFE_PROVIDERS = ['network']
    const ALL_PROVIDERS = ['network', 'passive', 'fused', 'gps']

    const parseProviders = (text: string, providers: string[]): { lat: number; lng: number } | null => {
      // Format A: "provider: Location[provider LAT,LNG ...]"
      for (const name of providers) {
        const re = new RegExp(`${name}:\\s*Location\\[${name}\\s+${c}${sep}${c}`)
        const m = text.match(re)
        if (m) {
          const lat = parseFloat(m[1]), lng = parseFloat(m[2])
          if (!isNaN(lat) && Math.abs(lat) <= 90) return { lat, lng }
        }
      }

      // Format C: bare "provider: LAT,LNG"
      for (const name of providers) {
        const bareRe = new RegExp(`${name}:\\s+(-?\\d{1,3}\\.\\d{4,}),\\s*(-?\\d{1,3}\\.\\d{4,})`)
        const bareMatch = text.match(bareRe)
        if (bareMatch) {
          const lat = parseFloat(bareMatch[1]), lng = parseFloat(bareMatch[2])
          if (!isNaN(lat) && Math.abs(lat) <= 90) return { lat, lng }
        }
      }

      // Format D: "Location[provider LAT,LNG ...]" without prefix
      for (const name of providers) {
        const re = new RegExp(`Location\\[${name}\\s+${c}${sep}${c}`)
        const m = text.match(re)
        if (m) {
          const lat = parseFloat(m[1]), lng = parseFloat(m[2])
          if (!isNaN(lat) && Math.abs(lat) <= 90) return { lat, lng }
        }
      }

      return null
    }

    // Pass 1: network-only (safe)
    for (const userArgs of [[], ['--user', '0'], ['--user', '11']]) {
      const out = await safeRun(['-s', serial, 'shell', 'cmd', 'location', 'get-last-location', ...userArgs])
      const r = parseProviders(out, SAFE_PROVIDERS)
      if (r) return r
    }

    const dump = await safeRun(['-s', serial, 'shell', 'dumpsys', 'location'])
    const safeResult = parseProviders(dump, SAFE_PROVIDERS)
    if (safeResult) return safeResult

    if (allowContaminatedFallback) {
      // Pass 2: optional contaminated fallback for diagnostics only
      for (const userArgs of [[], ['--user', '0'], ['--user', '11']]) {
        const out = await safeRun(['-s', serial, 'shell', 'cmd', 'location', 'get-last-location', ...userArgs])
        const r = parseProviders(out, ALL_PROVIDERS)
        if (r) {
          log('warn', `[getRealLocation] using fallback provider (may be contaminated by mock GPS)`)
          return r
        }
      }

      const fallbackResult = parseProviders(dump, ALL_PROVIDERS)
      if (fallbackResult) {
        log('warn', `[getRealLocation] using fallback provider (may be contaminated by mock GPS)`)
        return fallbackResult
      }

      const jLat = dump.match(/"latitude":\s*(-?\d+\.?\d*)/)
      const jLng = dump.match(/"longitude":\s*(-?\d+\.?\d*)/)
      if (jLat && jLng) {
        const lat = parseFloat(jLat[1]), lng = parseFloat(jLng[1])
        if (!isNaN(lat) && Math.abs(lat) <= 90) return { lat, lng }
      }

      const latKv = dump.match(/\blat(?:itude)?[=:\s]+(-?\d{1,2}\.\d{4,})/i)
      const lngKv = dump.match(/\blon(?:g(?:itude)?)?[=:\s]+(-?\d{1,3}\.\d{4,})/i)
      if (latKv && lngKv) {
        const lat = parseFloat(latKv[1]), lng = parseFloat(lngKv[1])
        if (!isNaN(lat) && Math.abs(lat) <= 90) return { lat, lng }
      }
    } else {
      log('warn', '[getRealLocation] no trusted provider available (strict mode), returning null')
    }

    return null
  }

  closeShell(_serial: string): void {
    this.lastPushSuccess.delete(_serial)
    this.wifiHardened.delete(_serial)
    this.masterLocationForcedOff.delete(_serial)
  }
  dispose(): void {
    if (this.masterLocationForcedOff.size > 0) {
      for (const serial of this.masterLocationForcedOff) {
        void this.setMasterLocationEnabled(serial, true)
      }
    }
    this.lastPushSuccess.clear()
    this.wifiHardened.clear()
    this.masterLocationForcedOff.clear()
  }
}
