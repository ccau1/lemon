import { execSync, exec } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const PLIST_NAME = 'com.lemon.server.plist'
const PLIST_PATH = path.join(os.homedir(), 'Library/LaunchAgents', PLIST_NAME)
const LOG_DIR = path.join(os.homedir(), 'Library/Logs/lemon')

function getLemonPath(): string {
  try {
    return execSync('which lemon', { encoding: 'utf-8' }).trim()
  } catch {
    return 'lemon'
  }
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

function getPlistContent(lemonPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.lemon.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>${lemonPath}</string>
    <string>serve</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/server.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/server.error.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>`
}

function getUid(): number {
  return typeof process.getuid === 'function' ? process.getuid() : 0
}

function getGuiDomain(): string {
  return `gui/${getUid()}`
}

function isRoot(): boolean {
  return getUid() === 0
}

function bootout(): void {
  try {
    execSync(`launchctl bootout ${getGuiDomain()} "${PLIST_PATH}"`, { stdio: 'pipe' })
  } catch {
    // may not be loaded
  }
}

export function install(): void {
  if (isRoot()) {
    console.error('Do not run service install as root. This is a user LaunchAgent.')
    process.exit(1)
  }
  const lemonPath = getLemonPath()
  if (lemonPath === 'lemon') {
    console.error('lemon not found in PATH. Install the CLI first.')
    process.exit(1)
  }
  ensureLogDir()
  bootout()
  fs.writeFileSync(PLIST_PATH, getPlistContent(lemonPath), 'utf-8')
  try {
    execSync(`launchctl bootstrap ${getGuiDomain()} "${PLIST_PATH}"`, { stdio: 'inherit' })
    console.log('Service installed and started.')
  } catch {
    console.log('Service installed. Run `lemon service start` to start it.')
  }
}

export function uninstall(): void {
  if (isRoot()) {
    console.error('Do not run service uninstall as root. This is a user LaunchAgent.')
    process.exit(1)
  }
  if (!fs.existsSync(PLIST_PATH)) {
    console.log('Service not installed.')
    return
  }
  bootout()
  fs.unlinkSync(PLIST_PATH)
  console.log('Service uninstalled.')
}

export function start(): void {
  if (isRoot()) {
    console.error('Do not run service start as root. This is a user LaunchAgent.')
    process.exit(1)
  }
  if (!fs.existsSync(PLIST_PATH)) {
    console.error('Service not installed. Run `lemon service install` first.')
    process.exit(1)
  }
  bootout()
  try {
    execSync(`launchctl bootstrap ${getGuiDomain()} "${PLIST_PATH}"`, { stdio: 'inherit' })
    console.log('Service started.')
  } catch (e: any) {
    console.error('Failed to start service:', e.message)
    process.exit(1)
  }
}

export function stop(): void {
  if (isRoot()) {
    console.error('Do not run service stop as root. This is a user LaunchAgent.')
    process.exit(1)
  }
  try {
    execSync(`launchctl bootout ${getGuiDomain()} "${PLIST_PATH}"`, { stdio: 'inherit' })
    console.log('Service stopped.')
  } catch (e: any) {
    console.error('Failed to stop service:', e.message)
    process.exit(1)
  }
}

export function status(): void {
  if (!fs.existsSync(PLIST_PATH)) {
    console.log('Status: not installed')
    return
  }
  try {
    const out = execSync('launchctl list | grep com.lemon.server', { encoding: 'utf-8' }).trim()
    if (out) {
      const parts = out.split(/\s+/)
      const pid = parts[0]
      if (pid !== '-') {
        console.log('Status: running (PID ' + pid + ')')
      } else {
        console.log('Status: installed but not running')
      }
    } else {
      console.log('Status: installed but not running')
    }
  } catch {
    console.log('Status: installed but not running')
  }
}

export function restart(): void {
  bootout()
  start()
}

export function logs(): void {
  const logPath = path.join(LOG_DIR, 'server.log')
  const errPath = path.join(LOG_DIR, 'server.error.log')
  if (fs.existsSync(logPath)) {
    console.log('--- stdout ---')
    console.log(fs.readFileSync(logPath, 'utf-8'))
  }
  if (fs.existsSync(errPath)) {
    console.log('--- stderr ---')
    console.log(fs.readFileSync(errPath, 'utf-8'))
  }
}
