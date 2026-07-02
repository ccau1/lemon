import { execSync, exec } from 'child_process'
import { app } from 'electron'
import * as https from 'https'
import * as http from 'http'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const REPO = 'ccau1/lemon'
const SERVER_PORT = 3456
const __dirname = dirname(fileURLToPath(import.meta.url))

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

function getJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Lemon-Desktop' } }, (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(e)
          }
        })
      })
      .on('error', reject)
  })
}

function execPromise(cmd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error)
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
      }
    })
  })
}

export async function detectCliVersion(): Promise<string | null> {
  try {
    const whichCmd = process.platform === 'win32' ? 'where lemon' : 'which lemon'
    await execPromise(whichCmd)
    const { stdout } = await execPromise('lemon -V')
    return stdout.trim()
  } catch {
    return null
  }
}

export async function getLatestCliVersion(): Promise<string | null> {
  try {
    const releases = await getJson<any[]>(
      `https://api.github.com/repos/${REPO}/releases?per_page=20`
    )
    const cliRelease = releases.find((r) => r.tag_name?.startsWith('cli-'))
    return cliRelease ? cliRelease.tag_name.replace('cli-', '') : null
  } catch {
    return null
  }
}

export async function getLatestDesktopVersion(): Promise<string | null> {
  try {
    const releases = await getJson<any[]>(
      `https://api.github.com/repos/${REPO}/releases?per_page=20`
    )
    const desktopRelease = releases.find((r) => r.tag_name?.startsWith('desktop-'))
    return desktopRelease ? desktopRelease.tag_name.replace('desktop-', '') : null
  } catch {
    return null
  }
}

export async function isServerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${SERVER_PORT}/server-info`, { timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200)
      req.destroy()
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

function getBundledCliVersion(): string {
  const pkgPath = join(__dirname, '..', 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  return pkg.cliVersion || app.getVersion()
}

export async function getInstallGuide(platform: string): Promise<{ cli: string; desktop: string }> {
  const latestDesktop = await getLatestDesktopVersion()
  const cliV = getBundledCliVersion()
  const desktopV = latestDesktop || app.getVersion()

  if (platform === 'darwin') {
    return {
      cli: `curl -LO https://github.com/${REPO}/releases/download/cli-${cliV}/lemon-cli-${cliV}-macos-arm64.tar.gz && tar xzf lemon-cli-${cliV}-macos-arm64.tar.gz && sudo mv lemon-cli-macos-arm64 /usr/local/bin/lemon && lemon service install`,
      desktop: `Download lemon-desktop-${desktopV}-macos-arm64.dmg from the releases page and drag Lemon to Applications.`,
    }
  }
  return {
    cli: `Download lemon-cli-${cliV}-win-x64.zip from the releases page, extract, add lemon-cli-win-x64.exe to your PATH, then run \`lemon service install\`.`,
    desktop: `Download lemon-desktop-${desktopV}-win-x64.exe from the releases page and run the installer.`,
  }
}

export async function checkVersions(): Promise<VersionInfo> {
  const [cliVersion, latestCliVersion, latestDesktopVersion, serverRunning] = await Promise.all([
    detectCliVersion(),
    getLatestCliVersion(),
    getLatestDesktopVersion(),
    isServerRunning(),
  ])

  return {
    desktopVersion: app.getVersion(),
    latestDesktopVersion,
    cliInstalled: cliVersion !== null,
    cliVersion,
    latestCliVersion,
    serverRunning,
    isElectron: true,
    platform: process.platform,
  }
}
