import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.ts'
import { useState, useEffect, useMemo } from 'react'
import { DropdownSelect } from '../components/Dropdown.tsx'
import ResizablePanels from '../components/ResizablePanels.tsx'
import RunModal from '../components/RunModal.tsx'
import { useSelectedWorkspace } from '../WorkspaceContext.tsx'

function displayActionName(fullName: string) {
  const idx = fullName.indexOf('/')
  return idx > 0 ? fullName.slice(idx + 1) : fullName
}

function actionWorkspaceName(fullName: string): string | null {
  const idx = fullName.indexOf('/')
  return idx > 0 ? fullName.slice(0, idx) : null
}

function statusDot(status: string) {
  switch (status) {
    case 'done':
      return <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
    case 'running':
      return <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
    case 'error':
      return <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
    default:
      return <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
  }
}

export default function ActionsPage() {
  const { selectedWorkspaceId } = useSelectedWorkspace()
  const queryClient = useQueryClient()
  const { data: workspaces } = useQuery({ queryKey: ['workspaces'], queryFn: api.getWorkspaces })
  const [searchQuery, setSearchQuery] = useState('')

  const { data: actions } = useQuery({
    queryKey: ['actions'],
    queryFn: () => api.getActions(),
  })

  const actionEntries = useMemo(() => {
    if (!actions) return []
    const q = searchQuery.trim().toLowerCase()
    return Object.entries(actions).filter(([name]) => {
      if (!q) return true
      return displayActionName(name).toLowerCase().includes(q)
    })
  }, [actions, searchQuery])

  const actionNames = actionEntries.map(([name]) => name)
  const [selectedAction, setSelectedAction] = useState<string>('')

  useEffect(() => {
    if (actionNames.length > 0 && !selectedAction) {
      setSelectedAction(actionNames[0])
    }
  }, [actionNames, selectedAction])

  useEffect(() => {
    if (selectedAction && !actionNames.includes(selectedAction)) {
      setSelectedAction(actionNames[0] || '')
    }
  }, [actionNames, selectedAction])

  const defaultWorkspaceIdForAction = useMemo(() => {
    if (!workspaces) return ''
    const prefix = actionWorkspaceName(selectedAction)
    if (prefix) {
      const ws = workspaces.find((w: any) => w.name === prefix)
      if (ws) return ws.id
    }
    return workspaces[0]?.id || ''
  }, [selectedAction, workspaces])

  const [runFilterWorkspaceId, setRunFilterWorkspaceId] = useState<string>('')

  useEffect(() => {
    if (selectedWorkspaceId !== 'all') {
      setRunFilterWorkspaceId(selectedWorkspaceId)
    } else {
      setRunFilterWorkspaceId(defaultWorkspaceIdForAction)
    }
  }, [selectedWorkspaceId, defaultWorkspaceIdForAction])

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ['actionRuns', selectedAction, runFilterWorkspaceId],
    queryFn: () => api.getActionRuns(runFilterWorkspaceId || undefined, selectedAction),
    enabled: !!selectedAction,
    refetchInterval: (query: any) => {
      const data = query.state.data as any[] | undefined
      return data?.some((r) => r.status === 'running') ? 2000 : false
    },
  })

  const [optimisticRuns, setOptimisticRuns] = useState<Array<any>>([])
  const [selectedRun, setSelectedRun] = useState<any | null>(null)

  const [showRunForm, setShowRunForm] = useState(false)
  const [runFormWorkspaceId, setRunFormWorkspaceId] = useState<string>('')

  useEffect(() => {
    if (selectedWorkspaceId !== 'all') {
      setRunFormWorkspaceId(selectedWorkspaceId)
    } else {
      setRunFormWorkspaceId(defaultWorkspaceIdForAction)
    }
  }, [selectedWorkspaceId, defaultWorkspaceIdForAction])

  const runMutation = useMutation({
    mutationFn: () => api.runAction({ workspaceId: runFormWorkspaceId, actionName: selectedAction }),
    onMutate: async () => {
      const tempId = `temp-${Math.random().toString(36).slice(2)}`
      const tempRun = {
        id: tempId,
        workspaceId: runFormWorkspaceId,
        actionName: selectedAction,
        status: 'pending',
        response: '',
        createdAt: new Date().toISOString(),
      }
      setOptimisticRuns((prev) => [tempRun, ...prev])
      return { tempId }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actionRuns', selectedAction] })
      setShowRunForm(false)
    },
    onError: (_err, _vars, context) => {
      if (context?.tempId) {
        setOptimisticRuns((prev) =>
          prev.map((r) => (r.id === context.tempId ? { ...r, status: 'error', response: 'Run failed' } : r))
        )
      }
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.tempId) {
        setTimeout(() => {
          setOptimisticRuns((prev) => prev.filter((r) => r.id !== context.tempId))
        }, 500)
      }
    },
  })

  const displayRuns = useMemo(() => {
    return [...optimisticRuns, ...(runs || [])]
  }, [optimisticRuns, runs])

  const runCount = displayRuns.length

  const workspaceNameById = (id: string) =>
    workspaces?.find((w: any) => w.id === id)?.name || id

  const RunsList = (
    <>
      {runsLoading && displayRuns.length === 0 ? (
        <p className="text-sm text-gray-500">Loading runs...</p>
      ) : displayRuns.length === 0 ? (
        <p className="text-sm text-gray-500">No runs yet.</p>
      ) : (
        <div className="space-y-2">
          {displayRuns.map((run: any) => (
            <button
              key={run.id}
              onClick={() => setSelectedRun(run)}
              className="w-full text-left bg-white border rounded p-3 hover:border-indigo-300 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                {statusDot(run.status)}
                <span className="text-xs text-gray-500">{new Date(run.createdAt).toLocaleString()}</span>
                {run.status === 'pending' && <span className="text-[10px] text-gray-600 bg-gray-100 px-1.5 rounded">pending</span>}
                {run.status === 'running' && <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 rounded">running</span>}
              </div>
              <p className="text-sm text-gray-700 line-clamp-2 font-mono">
                {run.response || (run.status === 'running' ? 'Running…' : 'No response yet')}
              </p>
            </button>
          ))}
        </div>
      )}
    </>
  )

  const RunPanel = (
    <>
      {selectedAction ? (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-4 bg-white border rounded p-3 shadow-sm">
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-semibold">{displayActionName(selectedAction)}</h2>
              <span className="text-sm text-gray-500">
                {runCount} run{runCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectedWorkspaceId === 'all' && (
                <DropdownSelect
                  className="w-auto"
                  options={(workspaces || []).map((w: any) => ({ value: w.id, label: w.name }))}
                  value={runFilterWorkspaceId}
                  onChange={setRunFilterWorkspaceId}
                />
              )}
              <button
                className="bg-indigo-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
                onClick={() => setShowRunForm((v) => !v)}
              >
                {showRunForm ? 'Cancel' : 'Run action'}
              </button>
            </div>
          </div>

          {showRunForm && (
            <div className="bg-gray-50 border rounded p-3 mb-4">
              {selectedWorkspaceId === 'all' && (
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Workspace</label>
                  <DropdownSelect
                    className="w-full max-w-xs"
                    options={(workspaces || []).map((w: any) => ({ value: w.id, label: w.name }))}
                    value={runFormWorkspaceId}
                    onChange={setRunFormWorkspaceId}
                  />
                </div>
              )}
              <div className="flex justify-end">
                <button
                  className="bg-indigo-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
                  disabled={!runFormWorkspaceId || runMutation.isPending}
                  onClick={() => runMutation.mutate()}
                >
                  {runMutation.isPending ? 'Running...' : 'Run'}
                </button>
              </div>
            </div>
          )}

          <div className="overflow-auto flex-1 min-h-0">{RunsList}</div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Select an action to view runs.</p>
      )}
    </>
  )

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Actions</h1>
      </div>

      <div className="flex flex-col flex-1 min-h-0">
        {/* Mobile search + dropdown */}
        <div className="md:hidden mb-4 space-y-2">
          <input
            type="text"
            placeholder="Search actions..."
            className="w-full border px-3 py-2 rounded text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <DropdownSelect
            className="w-full"
            options={actionNames.map((name) => ({ value: name, label: displayActionName(name) }))}
            value={selectedAction}
            onChange={(name) => setSelectedAction(name)}
          />
        </div>

        {/* Mobile run panel */}
        <section className="md:hidden flex-1 overflow-auto min-h-0">
          {RunPanel}
        </section>

        {/* Desktop resizable panels */}
        <div className="hidden md:block flex-1 min-h-0">
          <ResizablePanels
            className="h-full"
            defaultLeftWidth={280}
            minLeftWidth={180}
            maxLeftWidth={480}
            left={
              <aside className="h-full pr-4 flex flex-col">
                <input
                  type="text"
                  placeholder="Search actions..."
                  className="w-full border px-3 py-2 rounded text-sm mb-2"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="space-y-1 overflow-auto flex-1">
                  {actionNames.map((name) => (
                    <button
                      key={name}
                      onClick={() => setSelectedAction(name)}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${
                        selectedAction === name
                          ? 'bg-indigo-50 text-indigo-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {displayActionName(name)}
                    </button>
                  ))}
                  {actionNames.length === 0 && (
                    <p className="text-sm text-gray-500 px-3">
                      {Object.keys(actions || {}).length === 0 ? 'No actions configured.' : 'No actions match.'}
                    </p>
                  )}
                </div>
              </aside>
            }
            right={
              <section className="h-full pl-4 flex flex-col min-h-0">
                {RunPanel}
              </section>
            }
          />
        </div>
      </div>

      {selectedRun && (
        <RunModal
          run={selectedRun}
          workspaceName={workspaceNameById(selectedRun.workspaceId)}
          onClose={() => setSelectedRun(null)}
        />
      )}
    </div>
  )
}
