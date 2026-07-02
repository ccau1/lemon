import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { startServer, resolveDataDir } from '@lemon/server'
import { checkVersions, getInstallGuide, isServerRunning } from './version-check.js'

app.name = 'Lemon'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged

function getAppRoot() {
  return isDev ? path.resolve(__dirname, '..') : app.getAppPath()
}

async function createWindow(resolvedPort: number) {
  console.log(`[main] createWindow called, port=${resolvedPort}, appPath=${app.getAppPath()}, __dirname=${__dirname}`)
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Lemon',
    show: true,
    webPreferences: {
      preload: path.join(getAppRoot(), 'dist', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.webContents.on('did-finish-load', () => {
    console.log('[main] renderer did-finish-load')
  })
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[main] renderer did-fail-load: ${errorCode} ${errorDescription}`)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] render-process-gone', details)
  })
  win.webContents.on('console-message', (_event, level, message) => {
    console.log(`[renderer:${level}] ${message}`)
  })

  if (isDev) {
    await win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    const indexPath = path.join(getAppRoot(), 'node_modules', '@lemon', 'web', 'dist', 'index.html')
    console.log(`[main] loading file: ${indexPath}`)
    await win.loadFile(indexPath)
  }
}

app.whenReady().then(async () => {
  console.log('[main] app ready')
  let resolvedPort: number

  try {
    const existingServer = await isServerRunning()
    if (existingServer) {
      resolvedPort = 3456
      console.log('Existing server detected on port 3456')
    } else {
      const dataDir = resolveDataDir()
      console.log(`[main] starting server, dataDir=${dataDir}`)
      resolvedPort = await startServer({ dataDir })
      console.log(`Server listening on port ${resolvedPort}`)
    }
  } catch (err) {
    console.error('[main] failed to start server:', err)
    dialog.showErrorBox('Server Error', String(err))
    app.quit()
    return
  }

  try {
    await createWindow(resolvedPort)
  } catch (err) {
    console.error('[main] failed to create window:', err)
    dialog.showErrorBox('Window Error', String(err))
    app.quit()
    return
  }

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
