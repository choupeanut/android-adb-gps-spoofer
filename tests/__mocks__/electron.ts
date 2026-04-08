export const app = {
  getPath: () => '/tmp',
  on: () => {}
}
export const BrowserWindow = {
  getAllWindows: () => []
}
export const ipcMain = {
  handle: () => {},
  on: () => {}
}
export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] })
}
export const shell = {}
