import { app, BrowserWindow, dialog, ipcMain, Notification } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { startServer } from '@lemon/server'
import os from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged

async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../web/dist/index.html'))
  }
}

app.whenReady().then(async () => {
  const dataDir = path.join(os.homedir(), '.lemon')
  await startServer({ port: 3000, dataDir })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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
