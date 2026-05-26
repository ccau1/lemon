import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { startServer, resolveDataDir } from '@lemon/server'
import { checkVersions, getInstallGuide, isServerRunning } from './version-check.js'

app.name = 'Lemon'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged

async function createWindow(resolvedPort: number) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Lemon',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../node_modules/@lemon/web/dist/index.html'))
  }
}

app.whenReady().then(async () => {
  let resolvedPort: number

  const existingServer = await isServerRunning()
  if (existingServer) {
    resolvedPort = 3456
    console.log('Existing server detected on port 3456')
  } else {
    const dataDir = resolveDataDir()
    resolvedPort = await startServer({ dataDir })
    console.log(`Server listening on port ${resolvedPort}`)
  }

  createWindow(resolvedPort)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(resolvedPort)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.filePaths[0] || null
})

ipcMain.on('notify', (_event, title: string, body: string) => {
  new Notification({ title, body }).show()
})

ipcMain.handle('check-versions', async () => {
  return checkVersions()
})

ipcMain.handle('get-install-guide', async () => {
  return getInstallGuide(process.platform)
})
