import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  notify: (title: string, body: string) => ipcRenderer.send('notify', title, body),
})
