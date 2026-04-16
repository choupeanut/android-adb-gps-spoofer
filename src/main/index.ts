import { app, shell, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc/register'
import { DeviceManager } from './services/device-manager'
import { startWebServer } from './server/index'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let deviceManager: DeviceManager | null = null

// Safe logging wrapper - never crash if logging fails
function setupLogging(): void {
  try {
    const { appendFileSync, existsSync, mkdirSync } = require('fs')
    const logDir = join(app.getPath('userData'), 'logs')
    const logFile = join(logDir, `main-${Date.now()}.log`)
    
    try {
      if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
    } catch (e) {
      // Can't create log dir - continue without file logging
    }
    
    const writeLog = (level: string, ...args: any[]) => {
      const msg = `[${new Date().toISOString()}] [${level}] ${args.join(' ')}\n`
      try {
        appendFileSync(logFile, msg)
      } catch {
        // Silent fail - don't let logging break the app
      }
    }

    // Capture all console output
    const originalLog = console.log
    const originalError = console.error
    const originalWarn = console.warn
    
    console.log = (...args) => { originalLog(...args); try { writeLog('INFO', ...args) } catch {} }
    console.error = (...args) => { originalError(...args); try { writeLog('ERROR', ...args) } catch {} }
    console.warn = (...args) => { originalWarn(...args); try { writeLog('WARN', ...args) } catch {} }

    // Capture uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error.stack || error)
    })

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled Promise Rejection:', reason)
    })

    console.log('=== Android ADB GPS Spoofer Starting ===')
    console.log('App version:', app.getVersion())
    console.log('Electron version:', process.versions.electron)
    console.log('Node version:', process.versions.node)
    console.log('Platform:', process.platform, process.arch)
    console.log('User data path:', app.getPath('userData'))
    console.log('Log file:', logFile)
    console.log('Is dev:', is.dev)
  } catch (e) {
    // If logging setup fails entirely, continue without it
    console.error('Failed to setup logging:', e)
  }
}

setupLogging()

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
  console.log('Creating main window...')
  
  try {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 960,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      title: 'Android ADB GPS Spoofer',
      backgroundColor: '#1a1a1a',  // Prevent white flash
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    console.log('BrowserWindow created successfully')

    // Monitor renderer process crashes
    mainWindow.webContents.on('render-process-gone', (_, details) => {
      console.error('Renderer process gone:', details)
    })

    mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
      console.error('Failed to load renderer:', errorCode, errorDescription)
    })

    mainWindow.webContents.on('crashed', () => {
      console.error('Renderer crashed!')
    })

    mainWindow.webContents.on('console-message', (_, level, message) => {
      console.log(`[Renderer Console ${level}]:`, message)
    })

    // Log when page finishes loading
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('Renderer loaded successfully')
    })

    mainWindow.on('ready-to-show', () => {
      console.log('Window ready to show')
      mainWindow!.show()
    })

    // If renderer doesn't load in 5 seconds, open DevTools automatically
    const devToolsTimeout = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.warn('Renderer load timeout - opening DevTools')
        mainWindow.webContents.openDevTools()
      }
    }, 5000)

    mainWindow.webContents.on('did-finish-load', () => {
      clearTimeout(devToolsTimeout)
    })

    // Allow opening DevTools in production (F12 or Ctrl+Shift+I)
    mainWindow.webContents.on('before-input-event', (_, input) => {
      if (input.type === 'keyDown') {
        if (input.key === 'F12' || 
            (input.control && input.shift && input.key === 'I')) {
          mainWindow?.webContents.toggleDevTools()
        }
      }
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

    const htmlPath = join(__dirname, '../renderer/index.html')
    console.log('Loading renderer from:', htmlPath)

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      console.log('Loading dev server URL:', process.env['ELECTRON_RENDERER_URL'])
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']).catch(err => {
        console.error('Failed to load dev URL:', err)
      })
    } else {
      console.log('Loading production HTML from:', htmlPath)
      mainWindow.loadFile(htmlPath).catch(err => {
        console.error('Failed to load HTML file:', err)
      })
    }
  } catch (error) {
    console.error('Error creating window:', error)
    throw error
  }
}

// Extend app with isQuitting flag
declare module 'electron' {
  interface App {
    isQuitting?: boolean
  }
}

app.whenReady().then(() => {
  console.log('App ready, initializing...')
  
  try {
    electronApp.setAppUserModelId('com.peanutchou.android-adb-gps-spoofer')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    console.log('Creating DeviceManager...')
    deviceManager = new DeviceManager()
    
    console.log('Registering IPC handlers...')
    registerIpcHandlers(deviceManager)

    console.log('Creating window and tray...')
    createWindow()
    createTray()

    // Start embedded web server for phone browser access
    try {
      const rendererDir = join(__dirname, '../renderer')
      console.log('Starting web server with renderer dir:', rendererDir)
      startWebServer(rendererDir)
    } catch (error) {
      console.warn('Failed to start web server (non-fatal):', error)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
    
    console.log('Initialization complete')
  } catch (error) {
    console.error('Fatal error during initialization:', error)
    app.quit()
  }
}).catch((error) => {
  console.error('App failed to start:', error)
  app.quit()
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
