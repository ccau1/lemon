import { contextBridge, ipcRenderer, shell } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  notify: (title: string, body: string) => ipcRenderer.send('notify', title, body),
  checkVersions: () => ipcRenderer.invoke('check-versions'),
  getInstallGuide: () => ipcRenderer.invoke('get-install-guide'),
  openExternal: (url: string) => shell.openExternal(url),
})
