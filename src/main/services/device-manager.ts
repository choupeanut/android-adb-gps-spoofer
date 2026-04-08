import { AdbService } from './adb.service'
import { broadcast } from './broadcast'
import { ADB_POLL_INTERVAL_MS } from '@shared/constants'
import type { DeviceInfo } from '@shared/types'

export class DeviceManager {
  private adb: AdbService
  private devices: DeviceInfo[] = []
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private activeDevice: string | null = null
  private changeListeners: Array<(connectedSerials: Set<string>) => void> = []

  constructor() {
    this.adb = new AdbService()
    this.startPolling()
  }

  get adbService(): AdbService {
    return this.adb
  }

  getDevices(): DeviceInfo[] {
    return this.devices
  }

  getActiveDevice(): string | null {
    return this.activeDevice
  }

  setActiveDevice(serial: string | null): void {
    this.activeDevice = serial
  }

  private startPolling(): void {
    this.pollDevices()
    this.pollTimer = setInterval(() => this.pollDevices(), ADB_POLL_INTERVAL_MS)
  }

  private async pollDevices(): Promise<void> {
    const newDevices = await this.adb.listDevices()

    const oldSerials = new Set(this.devices.map((d) => d.serial))
    const newSerials = new Set(newDevices.map((d) => d.serial))

    const added = newDevices.filter((d) => !oldSerials.has(d.serial))
    const removed = this.devices.filter((d) => !newSerials.has(d.serial))

    if (added.length > 0 || removed.length > 0 || this.hasStatusChanges(newDevices)) {
      this.devices = newDevices

      if (this.activeDevice && !newSerials.has(this.activeDevice)) {
        this.activeDevice = newDevices.length > 0 ? newDevices[0].serial : null
      }

      if (!this.activeDevice && newDevices.length > 0) {
        this.activeDevice = newDevices[0].serial
      }

      this.notifyRenderer()
    }

    for (const device of removed) {
      this.adb.closeShell(device.serial)
    }
  }

  private hasStatusChanges(newDevices: DeviceInfo[]): boolean {
    if (newDevices.length !== this.devices.length) return true
    for (const newDev of newDevices) {
      const oldDev = this.devices.find((d) => d.serial === newDev.serial)
      if (!oldDev || oldDev.status !== newDev.status) return true
    }
    return false
  }

  private notifyRenderer(): void {
    broadcast('devices-changed', {
      devices: this.devices,
      activeDevice: this.activeDevice
    })
    // Notify engine manager to prune disconnected device engines
    const connectedSerials = new Set(
      this.devices.filter((d) => d.status === 'connected').map((d) => d.serial)
    )
    for (const listener of this.changeListeners) {
      listener(connectedSerials)
    }
  }

  /** Force an immediate device poll (e.g. after WiFi connect). */
  async forcePoll(): Promise<void> {
    await this.pollDevices()
  }

  /**
   * Register a callback that fires when connected devices change.
   * Receives the set of currently-connected serials.
   */
  onDevicesChanged(cb: (connectedSerials: Set<string>) => void): void {
    this.changeListeners.push(cb)
  }

  dispose(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.adb.dispose()
  }
}
