import { execSync } from 'child_process'

const TASK_NAME = 'LemonServer'

export function install(): void {
  try {
    execSync('where lemon', { stdio: 'pipe' })
  } catch {
    console.error('lemon not found in PATH. Install the CLI first.')
    process.exit(1)
  }

  try {
    // Delete existing task silently
    execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { stdio: 'pipe' })
  } catch {
    // ignore
  }

  try {
    execSync(
      `schtasks /create /tn "${TASK_NAME}" /tr "lemon serve" /sc onlogon /rl highest /f`,
      { stdio: 'inherit' }
    )
    console.log('Service installed. Run `lemon service start` to start it.')
  } catch (e: any) {
    console.error('Failed to install service:', e.message)
    process.exit(1)
  }
}

export function uninstall(): void {
  try {
    execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { stdio: 'inherit' })
    console.log('Service uninstalled.')
  } catch (e: any) {
    console.error('Failed to uninstall service:', e.message)
    process.exit(1)
  }
}

export function start(): void {
  try {
    execSync(`schtasks /run /tn "${TASK_NAME}"`, { stdio: 'inherit' })
    console.log('Service started.')
  } catch (e: any) {
    console.error('Failed to start service:', e.message)
    process.exit(1)
  }
}

export function stop(): void {
  try {
    execSync(`taskkill /f /im lemon.exe`, { stdio: 'pipe' })
    console.log('Service stopped.')
  } catch (e: any) {
    console.error('Failed to stop service:', e.message)
    process.exit(1)
  }
}

export function status(): void {
  try {
    const out = execSync(`schtasks /query /tn "${TASK_NAME}" /fo list`, { encoding: 'utf-8', stdio: 'pipe' })
    const lines = out.split(/\r?\n/)
    const taskNameLine = lines.find((l) => l.includes('TaskName:'))
    const statusLine = lines.find((l) => l.includes('Status:'))
    if (taskNameLine) {
      console.log('Status: installed')
      if (statusLine) {
        const status = statusLine.split(':')[1]?.trim()
        console.log('State:', status || 'unknown')
      }
    } else {
      console.log('Status: not installed')
    }
  } catch {
    console.log('Status: not installed')
  }
}

export function restart(): void {
  try {
    execSync(`taskkill /f /im lemon.exe`, { stdio: 'pipe' })
  } catch {
    // ignore
  }
  start()
}

export function logs(): void {
  console.log('Windows service logs are not yet supported. Use Event Viewer or run `lemon serve` directly.')
}
