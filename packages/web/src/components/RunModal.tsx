export interface RunModalProps {
  run: {
    id: string
    workspaceId: string
    status: string
    response: string
    createdAt: string
  }
  workspaceName?: string
  onClose: () => void
}

function statusDot(status: string) {
  switch (status) {
    case 'done':
      return <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
    case 'running':
      return <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
    case 'error':
      return <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
    default:
      return <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-400" />
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'done':
      return <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs font-medium">Done</span>
    case 'running':
      return <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs font-medium">Running</span>
    case 'error':
      return <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded text-xs font-medium">Error</span>
    default:
      return <span className="text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-xs font-medium">Pending</span>
  }
}

export default function RunModal({ run, workspaceName, onClose }: RunModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden shadow-xl">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            {statusDot(run.status)}
            <h2 className="font-semibold text-lg">Run {run.id.slice(0, 8)}</h2>
            {statusLabel(run.status)}
          </div>
          <button className="text-gray-500 hover:text-gray-800" onClick={onClose}>Close</button>
        </div>
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span><span className="font-medium">Workspace:</span> {workspaceName || run.workspaceId}</span>
            <span><span className="font-medium">Started:</span> {new Date(run.createdAt).toLocaleString()}</span>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">Response</h3>
            <pre className="whitespace-pre-wrap text-sm font-mono bg-gray-50 p-4 rounded border">
              {run.response || (run.status === 'running' ? 'Running…' : run.status === 'pending' ? 'Pending…' : 'No response')}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
