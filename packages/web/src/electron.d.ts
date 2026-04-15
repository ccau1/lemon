export interface ElectronAPI {
  selectFolder: () => Promise<string | null>
  notify: (title: string, body: string) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
