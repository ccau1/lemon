import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.ts'
import { useEffect, useRef, useState } from 'react'

function QrIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h7v7h-7z" />
      <path d="M14 17h4" />
      <path d="M17 14v7" />
    </svg>
  )
}

function ConnectionHint({ source, url }: { source: string; url: string }) {
  const port = (() => {
    try {
      return new URL(url).port || '3456'
    } catch {
      return '3456'
    }
  })()

  switch (source) {
    case 'upnp':
      return (
        <div className="text-xs text-green-700 bg-green-50 rounded p-3 space-y-1">
          <p className="font-medium">Router auto-configured via UPnP.</p>
          <p>Your router opened port {port} automatically. You should be able to connect from outside the network.</p>
          <p className="text-green-600">If it still does not work, check your OS firewall (Windows Defender / macOS Firewall / ufw) and allow port {port}.</p>
        </div>
      )
    case 'public':
      return (
        <div className="text-xs text-amber-700 bg-amber-50 rounded p-3 space-y-1">
          <p className="font-medium">Public IP detected. Manual setup required.</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Forward port <span className="font-mono">{port}</span> on your router to this machine&apos;s LAN IP.</li>
            <li>Allow port <span className="font-mono">{port}</span> through your OS firewall (Windows Defender / macOS Firewall / ufw).</li>
            <li>If it still fails, your ISP may use CGNAT (shared public IP). Contact your ISP or use a tunnel service.</li>
          </ol>
        </div>
      )
    case 'lan':
      return (
        <div className="text-xs text-gray-600 bg-gray-50 rounded p-3 space-y-1">
          <p className="font-medium">Local network only.</p>
          <p>This machine does not appear to have a public IP. Connect your phone to the same WiFi, or set up port forwarding / a tunnel if you need remote access.</p>
        </div>
      )
    case 'manual':
      return (
        <div className="text-xs text-gray-600 bg-gray-50 rounded p-3 space-y-1">
          <p className="font-medium">Using custom URL.</p>
          <p>Make sure your OS firewall and router allow inbound traffic on the configured address.</p>
        </div>
      )
    default:
      return null
  }
}

function QrModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'local' | 'external'>('local')
  const [codes, setCodes] = useState<Record<string, { base64Png: string; url: string; source: string } | null>>({
    local: null,
    external: null,
  })
  const [loading, setLoading] = useState(false)
  const initialized = useRef(false)

  const active = codes[tab]

  const fetchQr = (targetTab: 'local' | 'external') => {
    if (codes[targetTab]) return
    setLoading(true)
    api.getConnectionQr(targetTab)
      .then((data) => {
        setCodes((prev) => ({ ...prev, [targetTab]: data }))
      })
      .catch(() => {
        setCodes((prev) => ({ ...prev, [targetTab]: null }))
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    fetchQr('local')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchTab = (nextTab: 'local' | 'external') => {
    setTab(nextTab)
    fetchQr(nextTab)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-sm flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Connect Mobile App</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex border-b">
          <button
            type="button"
            onClick={() => switchTab('local')}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              tab === 'local'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            This Network
          </button>
          <button
            type="button"
            onClick={() => switchTab('external')}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              tab === 'external'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Remote
          </button>
        </div>

        <div className="p-6 flex flex-col items-center gap-4">
          {active ? (
            <>
              <img
                src={active.base64Png}
                alt="Connection QR Code"
                className="w-64 h-64 border rounded"
              />
              <div className="text-center space-y-1">
                <p className="text-sm text-gray-600">Scan with the Lemon mobile app.</p>
                <p className="text-xs text-gray-500 font-mono break-all">{active.url}</p>
              </div>
              <ConnectionHint source={active.source} url={active.url} />
            </>
          ) : loading ? (
            <div className="text-sm text-gray-500 py-8">Loading QR code…</div>
          ) : (
            <div className="text-sm text-red-500 py-8">Failed to load QR code.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function DeviceGroup({
  title,
  devices,
  actions,
  onRename,
}: {
  title: string
  devices: Array<{ id: string; name: string; status: string; createdAt: string; make?: string; model?: string; macAddress?: string }>
  actions: (device: { id: string; name: string; status: string; make?: string; model?: string; macAddress?: string }) => React.ReactNode
  onRename?: (id: string, name: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  if (devices.length === 0) return null

  const startEdit = (d: typeof devices[0]) => {
    setEditingId(d.id)
    setDraft(d.name)
  }

  const save = () => {
    if (editingId && draft.trim()) {
      onRename?.(editingId, draft.trim())
    }
    setEditingId(null)
  }

  const cancel = () => setEditingId(null)

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      <div className="space-y-2">
        {devices.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between bg-white border rounded-lg px-4 py-3"
          >
            <div className="flex-1 min-w-0 mr-4">
              {editingId === d.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') save()
                      if (e.key === 'Escape') cancel()
                    }}
                    className="text-sm border rounded px-2 py-1 w-full max-w-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={save}
                    className="px-2 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancel}
                    className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-sm font-medium text-gray-900">{d.name}</div>
                  <div className="text-xs text-gray-500 font-mono">{d.id}</div>
                  {(d.make || d.model || d.macAddress) && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      {[d.make, d.model].filter(Boolean).join(' ')}
                      {d.macAddress && (
                        <span className="ml-2 font-mono text-gray-500">{d.macAddress}</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onRename && editingId !== d.id && (
                <button
                  type="button"
                  onClick={() => startEdit(d)}
                  className="px-3 py-1 rounded bg-gray-100 text-gray-700 text-xs hover:bg-gray-200"
                >
                  Rename
                </button>
              )}
              {actions(d)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ConnectionsTab() {
  const queryClient = useQueryClient()
  const [qrOpen, setQrOpen] = useState(false)

  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: api.getDevices,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['devices'] })

  const approve = useMutation({ mutationFn: api.approveDevice, onSuccess: invalidate })
  const reject = useMutation({ mutationFn: api.rejectDevice, onSuccess: invalidate })
  const remove = useMutation({ mutationFn: api.removeDevice, onSuccess: invalidate })
  const rename = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api.renameDevice(id, name), onSuccess: invalidate })

  const pending = devices?.filter((d) => d.status === 'pending') || []
  const approved = devices?.filter((d) => d.status === 'approved') || []

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded shadow space-y-4">
        <h2 className="font-semibold">This Machine</h2>
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700"
          title="Show QR Code"
        >
          <QrIcon className="w-5 h-5" />
          <span>Connect Mobile</span>
        </button>
        {qrOpen && (
          <QrModal onClose={() => setQrOpen(false)} />
        )}
      </div>

      <div className="bg-white p-4 rounded shadow space-y-6">
        <h2 className="font-semibold">Connected Devices</h2>

        <DeviceGroup
          title={`Pending (${pending.length})`}
          devices={pending}
          actions={(d) => (
            <>
              <button
                type="button"
                onClick={() => approve.mutate(d.id)}
                className="px-3 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => reject.mutate(d.id)}
                className="px-3 py-1 rounded bg-gray-100 text-gray-700 text-xs hover:bg-gray-200"
              >
                Reject
              </button>
            </>
          )}
          onRename={(id, name) => rename.mutate({ id, name })}
        />

        <DeviceGroup
          title={`Approved (${approved.length})`}
          devices={approved}
          actions={(d) => (
            <button
              type="button"
              onClick={() => remove.mutate(d.id)}
              className="px-3 py-1 rounded bg-gray-100 text-gray-700 text-xs hover:bg-gray-200"
            >
              Remove
            </button>
          )}
          onRename={(id, name) => rename.mutate({ id, name })}
        />

        {pending.length === 0 && approved.length === 0 && (
          <p className="text-sm text-gray-500">No devices have connected yet.</p>
        )}
      </div>
    </div>
  )
}
