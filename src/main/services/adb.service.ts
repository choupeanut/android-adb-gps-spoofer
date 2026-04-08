import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { log } from '../logger'
import type { DeviceInfo, LocationUpdate } from '@shared/types'

const execFileAsync = promisify(execFile)

function findAdb(): string {
  if (process.env.ADB_PATH) return process.env.ADB_PATH

  const adbExe = process.platform === 'win32' ? 'adb.exe' : 'adb'

  if (!is.dev && process.resourcesPath) {
    const bundled = join(process.resourcesPath, 'platform-tools', adbExe)
    if (existsSync(bundled)) return bundled
  }

  if (is.dev) {
    const devBundled = join(__dirname, '../../../resources/platform-tools', adbExe)
    if (existsSync(devBundled)) return devBundled
  }

  return 'adb'
}

export class AdbService {
  private adbPath: string

  constructor() {
    this.adbPath = findAdb()
    log('info', `[AdbService] using adb: ${this.adbPath}`)
  }

  // ─── Device discovery ────────────────────────────────────────────────────

  async listDevices(): Promise<DeviceInfo[]> {
    try {
      const { stdout } = await execFileAsync(this.adbPath, ['devices', '-l'], { timeout: 5000 })
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

  // ─── Connection test ──────────────────────────────────────────────────────

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

  // ─── Mock location setup ─────────────────────────────────────────────────

  async enableMockLocation(serial: string): Promise<{ ok: boolean; log: string[] }> {
    const log: string[] = []
    let ok = true

    // Grant android.permission.ACCESS_MOCK_LOCATION to the shell user
    // Android 12+ uses appops op name "android:mock_location"
    try {
      await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'appops', 'set', 'com.android.shell', 'android:mock_location', 'allow'],
        { timeout: 5000 }
      )
      log.push('✓ appops mock_location allow')
    } catch (err: any) {
      // Try legacy op name (older Android builds)
      try {
        await execFileAsync(
          this.adbPath,
          ['-s', serial, 'shell', 'appops', 'set', 'com.android.shell', 'mock_location', 'allow'],
          { timeout: 5000 }
        )
        log.push('✓ appops mock_location allow (legacy)')
      } catch (err2: any) {
        log.push(`⚠ appops warning: ${err2.message}`)
        // Non-fatal — continue anyway, adb shell may already have permission
      }
    }

    // Add the GPS test provider (correct syntax: just the provider name)
    try {
      const { stdout, stderr } = await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'cmd', 'location', 'providers', 'add-test-provider', 'gps'],
        { timeout: 5000 }
      )
      log.push(`✓ add-test-provider gps${stdout.trim() ? ': ' + stdout.trim() : ''}`)
    } catch (err: any) {
      log.push(`✗ add-test-provider failed: ${err.message}`)
      ok = false
    }

    // Enable the test provider
    try {
      await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'cmd', 'location', 'providers', 'set-test-provider-enabled', 'gps', 'true'],
        { timeout: 5000 }
      )
      log.push('✓ set-test-provider-enabled gps true')
    } catch (err: any) {
      log.push(`✗ set-test-provider-enabled failed: ${err.message}`)
      ok = false
    }

    console.log('[MockLocation setup]', log.join('\n'))
    return { ok, log }
  }

  // ─── Location push ────────────────────────────────────────────────────────

  /**
   * Push a single location update to the device.
   * Uses correct Android 12+ cmd syntax:
   *   cmd location providers set-test-provider-location gps --lat X --lng Y [options]
   */
  async pushLocation(serial: string, loc: LocationUpdate): Promise<boolean> {
    // AOSP LocationShellCommand (Android 14+) only accepts:
    //   --location <lat>,<lng>   (required, comma-separated)
    //   --accuracy <float>       (optional)
    //   --time <ms>              (optional)
    // Flags --lat/--lng/--altitude/--speed/--bearing do NOT exist.
    try {
      await execFileAsync(
        this.adbPath,
        [
          '-s', serial, 'shell',
          'cmd', 'location', 'providers', 'set-test-provider-location', 'gps',
          '--location', `${loc.lat},${loc.lng}`,
          '--accuracy', String(loc.accuracy),
          '--time',     String(loc.timestamp)
        ],
        { timeout: 4000 }
      )
      return true
    } catch (err: any) {
      log('error', `[pushLocation] ${serial}: ${err.message}`)
      return false
    }
  }

  async removeTestProvider(serial: string): Promise<void> {
    try {
      await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'cmd', 'location', 'providers', 'remove-test-provider', 'gps'],
        { timeout: 5000 }
      )
    } catch {
      // ignore — provider may already be gone
    }
  }

  // ─── Wi-Fi ADB ────────────────────────────────────────────────────────────

  async connectWifi(ip: string, port = 5555): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(this.adbPath, ['connect', `${ip}:${port}`], { timeout: 10000 })
      return stdout.includes('connected')
    } catch {
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

  // ─── Real GPS ─────────────────────────────────────────────────────────────

  /**
   * Read the phone's real GPS position from dumpsys location.
   * Returns null if unavailable or parsing fails.
   */
  async getRealLocation(serial: string): Promise<{ lat: number; lng: number } | null> {
    // Run a shell command but never throw — return stdout even on non-zero exit
    const safeRun = async (args: string[]): Promise<string> => {
      try {
        const { stdout } = await execFileAsync(this.adbPath, args, { timeout: 6000 })
        return stdout
      } catch (err: any) {
        // execFileAsync throws on non-zero exit code; salvage any stdout it captured
        return err.stdout ?? ''
      }
    }

    // Shared parser — handles multiple output formats across Android versions
    const parse = (text: string, label: string): { lat: number; lng: number } | null => {
      const c = '(-?\\d+\\.?\\d*)'
      const sep = ',\\s*'

      // Format A: "provider: Location[provider LAT,LNG ...]"
      // network/passive are checked first — they are unaffected by the GPS test provider.
      // fused/gps are checked last because they reflect the mocked position when spoofing is active.
      for (const name of ['network', 'passive', 'fused', 'gps']) {
        const re = new RegExp(`${name}:\\s*Location\\[${name}\\s+${c}${sep}${c}`)
        const m = text.match(re)
        if (m) {
          const lat = parseFloat(m[1]), lng = parseFloat(m[2])
          if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            log('info', `[getRealLocation] ${label}: ${name} → ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
            return { lat, lng }
          }
        }
      }

      // Format B: JSON "latitude":LAT "longitude":LNG (newer Android / some cmd outputs)
      const jLat = text.match(/"latitude":\s*(-?\d+\.?\d*)/)
      const jLng = text.match(/"longitude":\s*(-?\d+\.?\d*)/)
      if (jLat && jLng) {
        const lat = parseFloat(jLat[1]), lng = parseFloat(jLng[1])
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          log('info', `[getRealLocation] ${label}: json → ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
          return { lat, lng }
        }
      }

      // Format C: bare "provider: LAT,LNG" (possible Android 16 format)
      const bareMatch = text.match(
        /(?:fused|gps|network|passive):\s+(-?\d{1,3}\.\d{4,}),\s*(-?\d{1,3}\.\d{4,})/
      )
      if (bareMatch) {
        const lat = parseFloat(bareMatch[1]), lng = parseFloat(bareMatch[2])
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          log('info', `[getRealLocation] ${label}: bare → ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
          return { lat, lng }
        }
      }

      // Format D: "Location[provider LAT,LNG ...]" without leading "provider:" prefix
      // Matches Android 16 passive-provider format: "last location=Location[fused 25.078,121.499 ..."
      // network/passive checked first for same reason as Format A.
      for (const name of ['network', 'passive', 'fused', 'gps']) {
        const re = new RegExp(`Location\\[${name}\\s+${c}${sep}${c}`)
        const m = text.match(re)
        if (m) {
          const lat = parseFloat(m[1]), lng = parseFloat(m[2])
          if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            log('info', `[getRealLocation] ${label}: loc-bracket-${name} → ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
            return { lat, lng }
          }
        }
      }

      return null
    }

    // ── Method 1: cmd location get-last-location (try default + user 0 + user 11) ──
    // Note: execFileAsync throws on non-zero exit; safeRun salvages stdout regardless.
    for (const userArgs of [[], ['--user', '0'], ['--user', '11']]) {
      const label = `cmd${userArgs.length ? userArgs.join('') : ''}`
      const out = await safeRun([
        '-s', serial, 'shell',
        'cmd', 'location', 'get-last-location', ...userArgs
      ])
      log('info', `[getRealLocation] ${label}: ${out.slice(0, 400).replace(/\n/g, ' ')}`)
      const r = parse(out, label)
      if (r) return r
    }

    // ── Method 2: dumpsys location ────────────────────────────────────────────
    const dump = await safeRun(['-s', serial, 'shell', 'dumpsys', 'location'])
    const r = parse(dump, 'dumpsys')
    if (r) return r

    // ── Method 3: full-dump coordinate scan (Android 16 fallback) ─────────────
    // Search the entire dumpsys output for lat/lng key=value patterns
    const latKv = dump.match(/\blat(?:itude)?[=:\s]+(-?\d{1,2}\.\d{4,})/i)
    const lngKv = dump.match(/\blon(?:g(?:itude)?)?[=:\s]+(-?\d{1,3}\.\d{4,})/i)
    if (latKv && lngKv) {
      const lat = parseFloat(latKv[1]), lng = parseFloat(lngKv[1])
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        log('info', `[getRealLocation] kv-scan → ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
        return { lat, lng }
      }
    }

    // Log diagnostic windows so we can identify the actual Android 16 format
    const dumpLower = dump.toLowerCase()
    const knownIdx = dumpLower.indexOf('last known')
    if (knownIdx >= 0) {
      log('warn', `[getRealLocation] Last Known section: ${dump.slice(knownIdx, knownIdx + 800).replace(/\n/g, ' ')}`)
    } else {
      // Dump in 600-char windows covering first 3000 chars
      for (let i = 0; i < Math.min(dump.length, 3000); i += 600) {
        log('warn', `[getRealLocation] dump[${i}–${i + 600}]: ${dump.slice(i, i + 600).replace(/\n/g, ' ')}`)
      }
    }
    return null
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  closeShell(_serial: string): void {
    // no-op — we no longer use persistent shells
  }

  dispose(): void {
    // no-op
  }
}
