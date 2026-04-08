/**
 * Web entry point — loads the API adapter (window.api) before loading the React app.
 * This replaces the Electron preload/contextBridge mechanism.
 */
import './web-api'
import '../../src/renderer/main'
