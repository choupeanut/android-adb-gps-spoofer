import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { is } from '@electron-toolkit/utils'
import { log } from '../logger'
import type { AdbConnectResult, AdbDiagnostics, DeviceInfo, LocationUpdate } from '@shared/types'

const execFileAsync = promisify(execFile)

interface AdbResolution {
  adbPath: string
  bundledPath?: string
  bundledExists: boolean
  usingBundled: boolean
  usingSystemAdb: boolean
}

function resolveAdb(): AdbResolution {
  if (process.env.ADB_PATH) {
    console.log('[ADB] Using ADB_PATH from env:', process.env.ADB_PATH)
    return {
      adbPath: process.env.ADB_PATH,
      bundledExists: false,
      usingBundled: false,
      usingSystemAdb: false
    }
  }

  const adbExe = process.platform === 'win32' ? 'adb.exe' : 'adb'
  console.log('[ADB] Platform:', process.platform, 'Looking for:', adbExe)

  if (!is.dev && process.resourcesPath) {
    const bundled = join(process.resourcesPath, 'platform-tools', adbExe)
    const bundledExists = existsSync(bundled)
    console.log('[ADB] Checking bundled path:', bundled, 'exists:', bundledExists)
    if (bundledExists) {
      return {
        adbPath: bundled,
        bundledPath: bundled,
        bundledExists,
        usingBundled: true,
        usingSystemAdb: false
      }
    }

    log(
      'error',
      `[ADB] packaged app is missing bundled ${adbExe} at ${bundled}; falling back to system adb`
    )
    return {
      adbPath: 'adb',
      bundledPath: bundled,
      bundledExists,
      usingBundled: false,
      usingSystemAdb: true
    }
  }

  if (is.dev) {
    const devBundled = join(__dirname, '../../../resources/platform-tools', adbExe)
    const bundledExists = existsSync(devBundled)
    console.log('[ADB] Checking dev bundled path:', devBundled, 'exists:', bundledExists)
    if (bundledExists) {
      return {
        adbPath: devBundled,
        bundledPath: devBundled,
        bundledExists,
        usingBundled: true,
        usingSystemAdb: false
      }
    }
  }

  console.log('[ADB] Falling back to system adb')
  return {
    adbPath: 'adb',
    bundledExists: false,
    usingBundled: false,
    usingSystemAdb: true
  }
}

export class AdbService {
  private adbPath: string
  private adbResolution: AdbResolution
  private adbVersion: string | undefined
  /** Track last successful push per serial for health monitoring. */
  private lastPushSuccess = new Map<string, number>()
  /** Cache which WiFi serials have been hardened this session. */
  private wifiHardened = new Set<string>()
  /** Serials for which master location was force-disabled by experimental mode. */
  private masterLocationForcedOff = new Set<string>()

  constructor() {
    this.adbResolution = resolveAdb()
    this.adbPath = this.adbResolution.adbPath
    log('info', `[AdbService] using adb: ${this.adbPath}`)
    // Health-check: run `adb version` immediately so any spawn/path errors surface in logs
    this.healthCheck()
  }

  private healthCheck(): void {
    const opts = this.execOpts()
    execFileAsync(this.adbPath, ['version'], opts)
      .then(({ stdout }) => {
        this.adbVersion = stdout.split('\n')[0].trim()
        log('info', `[AdbService] health-check OK — ${this.adbVersion}`)
      })
      .catch((err: any) => log('error', `[AdbService] health-check FAILED (code=${err.code ?? 'none'} signal=${err.signal ?? 'none'}): ${err.message}`))
  }

  /** Common options for execFileAsync: correct cwd so Windows DLL load order works. */
  private execOpts(timeoutMs = 5000): { timeout: number; cwd?: string } {
    const cwd = this.adbPath !== 'adb' ? dirname(this.adbPath) : undefined
    return { timeout: timeoutMs, ...(cwd ? { cwd } : {}) }
  }

  getDiagnostics(): AdbDiagnostics {
    return {
      adbPath: this.adbPath,
      adbVersion: this.adbVersion,
      bundledPath: this.adbResolution.bundledPath,
      bundledExists: this.adbResolution.bundledExists,
      usingBundled: this.adbResolution.usingBundled,
      usingSystemAdb: this.adbResolution.usingSystemAdb
    }
  }

  /**
   * Best-effort WiFi stability tweaks for TCP ADB devices.
   * No-op for USB serials.
   */
  async hardenWifiConnection(serial: string): Promise<void> {
    if (!serial.includes(':')) return
    if (this.wifiHardened.has(serial)) return
    try {
      await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'settings', 'put', 'global', 'wifi_sleep_policy', '2'],
        this.execOpts(3000)
      ).catch(() => {})
      await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'dumpsys', 'deviceidle', 'whitelist', '+com.android.shell'],
        this.execOpts(3000)
      ).catch(() => {})
      this.wifiHardened.add(serial)
      log('info', `[ADB] WiFi hardened for ${serial}`)
    } catch (err: any) {
      log('warn', `[ADB] WiFi harden failed for ${serial}: ${err.message}`)
    }
  }

  /** Milliseconds since last successful pushLocation for this serial. */
  getLastPushAge(serial: string): number {
    const last = this.lastPushSuccess.get(serial)
    return last ? Date.now() - last : Infinity
  }

  /** Attempt to reconnect a WiFi ADB device. */
  async reconnectWifi(serial: string): Promise<boolean> {
    if (!serial.includes(':')) return false
    const ip = serial.split(':')[0]
    const port = serial.split(':')[1] || '5555'
    try {
      await execFileAsync(this.adbPath, ['disconnect', serial], this.execOpts(3000)).catch(() => {})
      const { stdout } = await execFileAsync(this.adbPath, ['connect', `${ip}:${port}`], this.execOpts(8000))
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
        this.execOpts(4000)
      )
      return true
    } catch {
      try {
        // Fallback for devices requiring explicit user argument.
        await execFileAsync(
          this.adbPath,
          ['-s', serial, 'shell', 'cmd', 'location', 'set-location-enabled', String(enabled), '--user', '0'],
          this.execOpts(4000)
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

  // ─── Device discovery ────────────────────────────────────────────────────

  async listDevices(): Promise<DeviceInfo[]> {
    try {
      const { stdout } = await execFileAsync(this.adbPath, ['devices', '-l'], this.execOpts(5000))
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
              this.execOpts(3000)
            )
            androidVersion = ver.trim()
          } catch (err: any) {
            androidVersion = 'unknown'
            log('warn', `[ADB] getprop ${serial}: ${err.code ?? ''} ${err.message}`)
          }
        }

        devices.push({ serial, model, androidVersion, connectionType, status, mockLocationActive: false })
      }

      return devices
    } catch (err: any) {
      log('error', `[ADB] listDevices failed (code=${err.code ?? 'none'}): ${err.message}`)
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
        this.execOpts(8000)
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
        this.execOpts(5000)
      )
      log.push('✓ appops mock_location allow')
    } catch (err: any) {
      // Try legacy op name (older Android builds)
      try {
        await execFileAsync(
          this.adbPath,
          ['-s', serial, 'shell', 'appops', 'set', 'com.android.shell', 'mock_location', 'allow'],
          this.execOpts(5000)
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
        this.execOpts(5000)
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
        this.execOpts(5000)
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
        this.execOpts(3000)
      )
      this.lastPushSuccess.set(serial, Date.now())
      return true
    } catch (err: any) {
      // Fallback for older Android builds that only accept raw "lat,lng" arg.
      try {
        await execFileAsync(
          this.adbPath,
          [
            '-s', serial, 'shell',
            'cmd', 'location', 'providers', 'set-test-provider-location', 'gps',
            `${loc.lat},${loc.lng}`
          ],
          this.execOpts(3000)
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
        this.execOpts(5000)
      )
    } catch {
      // ignore — provider may already be gone
    }
  }

  // ─── Wi-Fi ADB ────────────────────────────────────────────────────────────

  async connectWifi(ip: string, port = 5555): Promise<AdbConnectResult> {
    log('info', `[ADB] connect ${ip}:${port}`)
    try {
      const { stdout, stderr } = await execFileAsync(this.adbPath, ['connect', `${ip}:${port}`], this.execOpts(10000))
      const ok = stdout.includes('connected')
      log(ok ? 'ok' : 'warn', `[ADB] connect ${ip}:${port} → ${stdout.trim()}`)
      return {
        ...this.getDiagnostics(),
        ok,
        message: stdout.trim() || stderr.trim() || (ok ? 'Connected' : 'Connection failed'),
        stdout,
        stderr
      }
    } catch (err: any) {
      log('error', `[ADB] connectWifi failed (code=${err.code ?? 'none'}): ${err.message}`)
      return {
        ...this.getDiagnostics(),
        ok: false,
        message: err.message ?? 'Connection failed',
        stdout: err.stdout,
        stderr: err.stderr
      }
    }
  }

  async enableTcpip(serial: string, port = 5555): Promise<boolean> {
    try {
      await execFileAsync(this.adbPath, ['-s', serial, 'tcpip', String(port)], this.execOpts(5000))
      return true
    } catch (err: any) {
      log('warn', `[ADB] enableTcpip ${serial}: ${err.message}`)
      return false
    }
  }

  async getDeviceIp(serial: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        this.adbPath,
        ['-s', serial, 'shell', 'ip', 'route'],
        this.execOpts(5000)
      )
      const match = stdout.match(/src (\d+\.\d+\.\d+\.\d+)/)
      return match ? match[1] : null
    } catch (err: any) {
      log('warn', `[ADB] getDeviceIp ${serial}: ${err.message}`)
      return null
    }
  }

  // ─── Real GPS ─────────────────────────────────────────────────────────────

  /**
   * Read the phone's real GPS position from dumpsys location.
   * When spoofing is active, only the `network` provider is trustworthy — `passive`,
   * `fused`, and `gps` are all contaminated by the mock GPS test provider.
   * Returns null if unavailable or parsing fails.
   */
  async getRealLocation(serial: string): Promise<{ lat: number; lng: number } | null> {
    // Run a shell command but never throw — return stdout even on non-zero exit
    const safeRun = async (args: string[]): Promise<string> => {
      try {
        const { stdout } = await execFileAsync(this.adbPath, args, this.execOpts(6000))
        return stdout
      } catch (err: any) {
        // execFileAsync throws on non-zero exit code; salvage any stdout it captured
        return err.stdout ?? ''
      }
    }

    const c = '(-?\\d+\\.?\\d*)'
    const sep = ',\\s*'
    const allowContaminatedFallback = process.env.ALLOW_CONTAMINATED_REAL_GPS === '1'

    // Only trust `network` provider — fused/gps/passive are all contaminated by mock GPS.
    // Network provider uses cell towers + WiFi, never affected by GPS test provider.
    const SAFE_PROVIDERS = ['network']
    // Contaminated providers — only used as last resort when no network is available
    const ALL_PROVIDERS = ['network', 'passive', 'fused', 'gps']

    // Parse location from text, optionally restricted to safe providers only
    const parseProviders = (text: string, label: string, providers: string[]): { lat: number; lng: number } | null => {
      // Format A: "provider: Location[provider LAT,LNG ...]"
      for (const name of providers) {
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

      // Format C: bare "provider: LAT,LNG" (possible Android 16 format)
      for (const name of providers) {
        const bareRe = new RegExp(`${name}:\\s+(-?\\d{1,3}\\.\\d{4,}),\\s*(-?\\d{1,3}\\.\\d{4,})`)
        const bareMatch = text.match(bareRe)
        if (bareMatch) {
          const lat = parseFloat(bareMatch[1]), lng = parseFloat(bareMatch[2])
          if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            log('info', `[getRealLocation] ${label}: bare-${name} → ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
            return { lat, lng }
          }
        }
      }

      // Format D: "Location[provider LAT,LNG ...]" without leading "provider:" prefix
      for (const name of providers) {
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

    // ── Pass 1: Try safe (network-only) providers first ─────────────────────

    // Method 1: cmd location get-last-location
    for (const userArgs of [[], ['--user', '0'], ['--user', '11']]) {
      const label = `cmd${userArgs.length ? userArgs.join('') : ''}`
      const out = await safeRun([
        '-s', serial, 'shell',
        'cmd', 'location', 'get-last-location', ...userArgs
      ])
      log('info', `[getRealLocation] ${label}: ${out.slice(0, 400).replace(/\n/g, ' ')}`)
      const r = parseProviders(out, label, SAFE_PROVIDERS)
      if (r) return r
    }

    // Method 2: dumpsys location (network only)
    const dump = await safeRun(['-s', serial, 'shell', 'dumpsys', 'location'])
    const safeResult = parseProviders(dump, 'dumpsys-safe', SAFE_PROVIDERS)
    if (safeResult) return safeResult

    if (allowContaminatedFallback) {
      // ── Pass 2: Optional contaminated fallback for diagnostics only ────────
      for (const userArgs of [[], ['--user', '0'], ['--user', '11']]) {
        const label = `cmd-fallback${userArgs.length ? userArgs.join('') : ''}`
        const out = await safeRun([
          '-s', serial, 'shell',
          'cmd', 'location', 'get-last-location', ...userArgs
        ])
        const r = parseProviders(out, label, ALL_PROVIDERS)
        if (r) {
          log('warn', `[getRealLocation] using fallback provider (may be contaminated by mock GPS)`)
          return r
        }
      }

      const fallbackResult = parseProviders(dump, 'dumpsys-fallback', ALL_PROVIDERS)
      if (fallbackResult) {
        log('warn', `[getRealLocation] using fallback provider (may be contaminated by mock GPS)`)
        return fallbackResult
      }

      // Format B: JSON "latitude":LAT "longitude":LNG (newer Android / some cmd outputs)
      const jLat = dump.match(/"latitude":\s*(-?\d+\.?\d*)/)
      const jLng = dump.match(/"longitude":\s*(-?\d+\.?\d*)/)
      if (jLat && jLng) {
        const lat = parseFloat(jLat[1]), lng = parseFloat(jLng[1])
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          log('warn', `[getRealLocation] json fallback → ${lat.toFixed(6)}, ${lng.toFixed(6)} (may be contaminated)`)
          return { lat, lng }
        }
      }

      // Method 3: full-dump coordinate scan (Android 16 fallback)
      const latKv = dump.match(/\blat(?:itude)?[=:\s]+(-?\d{1,2}\.\d{4,})/i)
      const lngKv = dump.match(/\blon(?:g(?:itude)?)?[=:\s]+(-?\d{1,3}\.\d{4,})/i)
      if (latKv && lngKv) {
        const lat = parseFloat(latKv[1]), lng = parseFloat(lngKv[1])
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          log('warn', `[getRealLocation] kv-scan → ${lat.toFixed(6)}, ${lng.toFixed(6)} (may be contaminated)`)
          return { lat, lng }
        }
      }
    } else {
      log('warn', '[getRealLocation] no trusted provider available (strict mode), returning null')
    }

    // Log diagnostic windows so we can identify the actual Android 16 format
    const dumpLower = dump.toLowerCase()
    const knownIdx = dumpLower.indexOf('last known')
    if (knownIdx >= 0) {
      log('warn', `[getRealLocation] Last Known section: ${dump.slice(knownIdx, knownIdx + 800).replace(/\n/g, ' ')}`)
    } else {
      for (let i = 0; i < Math.min(dump.length, 3000); i += 600) {
        log('warn', `[getRealLocation] dump[${i}–${i + 600}]: ${dump.slice(i, i + 600).replace(/\n/g, ' ')}`)
      }
    }
    return null
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  closeShell(_serial: string): void {
    this.lastPushSuccess.delete(_serial)
    this.wifiHardened.delete(_serial)
    this.masterLocationForcedOff.delete(_serial)
  }

  dispose(): void {
    if (this.masterLocationForcedOff.size > 0) {
      for (const serial of this.masterLocationForcedOff) {
        // Best-effort restore during shutdown.
        void this.setMasterLocationEnabled(serial, true)
      }
    }
    this.lastPushSuccess.clear()
    this.wifiHardened.clear()
    this.masterLocationForcedOff.clear()
  }
}
