import * as macos from './service/macos.js'
import * as windows from './service/windows.js'

function getPlatform() {
  if (process.platform === 'darwin') return macos
  if (process.platform === 'win32') return windows
  console.error('Service management is only supported on macOS and Windows.')
  process.exit(1)
}

export function serviceInstall() {
  getPlatform().install()
}

export function serviceUninstall() {
  getPlatform().uninstall()
}

export function serviceStart() {
  getPlatform().start()
}

export function serviceStop() {
  getPlatform().stop()
}

export function serviceStatus() {
  getPlatform().status()
}

export function serviceRestart() {
  getPlatform().restart()
}

export function serviceLogs() {
  getPlatform().logs()
}
