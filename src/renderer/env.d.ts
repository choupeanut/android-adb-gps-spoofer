/// <reference types="vite/client" />

import type { GpsSpoofApi } from '../preload/index'

declare global {
  interface Window {
    api: GpsSpoofApi
  }
}
