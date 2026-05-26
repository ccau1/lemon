export interface VersionInfo {
  desktopVersion: string
  latestDesktopVersion: string | null
  cliInstalled: boolean
  cliVersion: string | null
  latestCliVersion: string | null
  serverRunning: boolean
  isElectron: boolean
  platform: string
}

export interface InstallGuide {
  cli: string
  desktop: string
}

export interface ElectronAPI {
  selectFolder: () => Promise<string | null>
  notify: (title: string, body: string) => void
  checkVersions: () => Promise<VersionInfo>
  getInstallGuide: () => Promise<InstallGuide>
  openExternal: (url: string) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
