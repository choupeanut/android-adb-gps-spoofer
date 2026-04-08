import { app, shell, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc/register'
import { DeviceManager } from './services/device-manager'
import { startWebServer } from './server/index'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let deviceManager: DeviceManager | null = null

function createTray(): void {
  // Use a blank 16x16 image as placeholder icon (no external file needed for dev)
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('Android ADB GPS Spoofer')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    {
      label: 'Hide',
      click: () => mainWindow?.hide()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        deviceManager?.dispose()
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Android ADB GPS Spoofer',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (tray && !app.isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Extend app with isQuitting flag
declare module 'electron' {
  interface App {
    isQuitting?: boolean
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.peanutchou.android-adb-gps-spoofer')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  deviceManager = new DeviceManager()
  registerIpcHandlers(deviceManager)

  createWindow()
  createTray()

  // Start embedded web server for phone browser access
  const rendererDir = join(__dirname, '../renderer')
  startWebServer(rendererDir)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  app.isQuitting = true
})

app.on('window-all-closed', () => {
  deviceManager?.dispose()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
