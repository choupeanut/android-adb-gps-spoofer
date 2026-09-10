import { AdbService } from './adb.service'
import { LocationEngine } from './location-engine'
import { RouteEngine } from './route-engine'
import { log } from '../logger'
import { SharedDeviceEngineManager } from '@shared/device-engine-manager'

export interface DeviceEngines { location: LocationEngine; route: RouteEngine }

export class DeviceEngineManager extends SharedDeviceEngineManager<LocationEngine, RouteEngine> {
  constructor(adb: AdbService) {
    super(adb, (serial) => new LocationEngine(adb, serial),
      (serial) => new RouteEngine(adb, serial), (message) => log('warn', message))
  }
}
