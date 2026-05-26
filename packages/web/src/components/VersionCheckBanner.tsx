import { useEffect, useState } from 'react'
import type { VersionInfo, InstallGuide } from '../electron.d.ts'

interface BannerState {
  info: VersionInfo | null
  guide: InstallGuide | null
  loading: boolean
  dismissed: boolean
}

export default function VersionCheckBanner() {
  const [state, setState] = useState<BannerState>({
    info: null,
    guide: null,
    loading: true,
    dismissed: false,
  })

  useEffect(() => {
    if (!window.electronAPI) {
      setState((s) => ({ ...s, loading: false }))
      return
    }

    Promise.all([window.electronAPI.checkVersions(), window.electronAPI.getInstallGuide()])
      .then(([info, guide]) => {
        setState({ info, guide, loading: false, dismissed: false })
      })
      .catch(() => {
        setState((s) => ({ ...s, loading: false }))
      })
  }, [])

  if (state.loading || state.dismissed || !state.info) return null

  const { info, guide } = state
  const needsCliInstall = !info.cliInstalled
  const needsCliUpgrade =
    info.cliInstalled && info.cliVersion && info.latestCliVersion && info.cliVersion !== info.latestCliVersion
  const needsDesktopUpgrade =
    info.latestDesktopVersion && info.desktopVersion !== info.latestDesktopVersion

  if (!needsCliInstall && !needsCliUpgrade && !needsDesktopUpgrade) return null

  return (
    <div className="bg-indigo-50 border-b border-indigo-200 px-6 py-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          {needsCliInstall && guide && (
            <div>
              <span className="font-semibold text-indigo-800">CLI not installed.</span>{' '}
              <span className="text-indigo-700">
                Install the CLI to use Lemon from the terminal and manage the server as a background service.
              </span>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="bg-indigo-100 text-indigo-900 px-2 py-1 rounded text-xs font-mono">
                  {guide.cli}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(guide.cli)}
                  className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
          {needsCliUpgrade && (
            <div>
              <span className="font-semibold text-indigo-800">CLI upgrade available.</span>{' '}
              <span className="text-indigo-700">
                You have <code className="font-mono">{info.cliVersion}</code>. Latest is{' '}
                <code className="font-mono">{info.latestCliVersion}</code>.
              </span>{' '}
              <button
                type="button"
                onClick={() =>
                  window.electronAPI?.openExternal(
                    `https://github.com/ccau1/lemon/releases/tag/cli-${info.latestCliVersion}`
                  )
                }
                className="text-indigo-600 hover:text-indigo-800 font-medium underline"
              >
                Download
              </button>
            </div>
          )}
          {needsDesktopUpgrade && (
            <div>
              <span className="font-semibold text-indigo-800">Desktop update available.</span>{' '}
              <span className="text-indigo-700">
                You have <code className="font-mono">{info.desktopVersion}</code>. Latest is{' '}
                <code className="font-mono">{info.latestDesktopVersion}</code>.
              </span>{' '}
              <button
                type="button"
                onClick={() =>
                  window.electronAPI?.openExternal(
                    `https://github.com/ccau1/lemon/releases/tag/desktop-${info.latestDesktopVersion}`
                  )
                }
                className="text-indigo-600 hover:text-indigo-800 font-medium underline"
              >
                Download
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setState((s) => ({ ...s, dismissed: true }))}
          className="text-indigo-400 hover:text-indigo-600"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
