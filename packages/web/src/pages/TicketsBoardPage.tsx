import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../api.ts'
import { useSelectedWorkspace } from '../WorkspaceContext.tsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import TicketModal from '../components/TicketModal.tsx'
import { DropdownFilter, DropdownSelect } from '../components/Dropdown.tsx'
import Checkbox from '../components/common/Checkbox.tsx'
import { formatStatus } from '../utils.ts'
import IntegrationImportButtons from '../components/IntegrationImportButtons.tsx'

const stepOrder = ['spec', 'plan', 'tasks', 'implement', 'done'] as const
const metaStatuses = ['active', 'awaiting_review', 'queued', 'error'] as const
const views = ['board', 'list', 'cards'] as const

type View = (typeof views)[number]

function statusBadgeClasses(status: string) {
  switch (status) {
    case 'awaiting_review':
      return 'bg-yellow-100 text-yellow-800'
    case 'queued':
      return 'bg-blue-100 text-blue-800'
    case 'running':
      return 'bg-indigo-100 text-indigo-800'
    case 'error':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

function deriveDisplayStatus(rawStatus: string) {
  if (stepOrder.includes(rawStatus as any) || rawStatus === 'running') return 'active'
  return rawStatus
}

const LS_KEY = 'tickets_board_new_ticket'

function readLs() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}') as {
      workspaceId?: string
      projectId?: string
      title?: string
      description?: string
    }
  } catch {
    return {}
  }
}

function writeLs(values: { workspaceId?: string; projectId?: string; title?: string; description?: string }) {
  localStorage.setItem(LS_KEY, JSON.stringify(values))
}

export default function TicketsBoardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { selectedWorkspaceId } = useSelectedWorkspace()
  const { data: workspaces } = useQuery({ queryKey: ['workspaces'], queryFn: api.getWorkspaces })
  const paramArchived = searchParams.get('archived') === 'true'
  const [showArchived, setShowArchived] = useState(paramArchived)

  const { data: tickets } = useQuery({
    queryKey: selectedWorkspaceId === 'all' ? ['allTickets', showArchived] : ['tickets', selectedWorkspaceId, showArchived],
    queryFn: selectedWorkspaceId === 'all' ? () => api.getAllTickets(showArchived) : () => api.getTickets(selectedWorkspaceId, undefined, showArchived),
  })

  const paramWorkspaces = searchParams.get('workspace')?.split(',').filter(Boolean) || []
  const paramProjects = searchParams.get('project')?.split(',').filter(Boolean) || []
  const paramSteps = searchParams.get('step')?.split(',').filter(Boolean) || searchParams.get('column')?.split(',').filter(Boolean) || []
  const paramStatuses = searchParams.get('status')?.split(',').filter(Boolean) || []
  const paramView = views.includes(searchParams.get('view') as any) ? (searchParams.get('view') as View) : 'board'

  const [selectedWorkspaces, setSelectedWorkspaces] = useState<Set<string>>(new Set(paramWorkspaces))
  const [selectedSteps, setSelectedSteps] = useState<Set<string>>(new Set(paramSteps.length ? paramSteps : stepOrder))
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(paramStatuses.length ? paramStatuses : metaStatuses))
  const [selectedProjects] = useState<Set<string>>(new Set(paramProjects))
  const [view, setView] = useState<View>(paramView)

  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [modalWorkspaceId, setModalWorkspaceId] = useState('')
  const [modalProjectId, setModalProjectId] = useState('')
  const [modalTitle, setModalTitle] = useState('')
  const [modalDescription, setModalDescription] = useState('')

  const { data: modalProjects } = useQuery({
    queryKey: ['projects', modalWorkspaceId],
    queryFn: () => api.getProjects(modalWorkspaceId),
    enabled: !!modalWorkspaceId,
  })

  useEffect(() => {
    if (!showModal) return
    const saved = readLs()
    let wsId: string
    if (selectedWorkspaceId !== 'all') {
      wsId = selectedWorkspaceId
    } else {
      wsId = saved.workspaceId && workspaces?.some((w: any) => w.id === saved.workspaceId)
        ? saved.workspaceId
        : workspaces?.[0]?.id || ''
    }
    setModalWorkspaceId(wsId)
    setModalTitle(saved.title || '')
    setModalDescription(saved.description || '')
  }, [showModal, workspaces, selectedWorkspaceId])

  useEffect(() => {
    if (!showModal) return
    const saved = readLs()
    if (!modalProjects) return
    const projId = saved.projectId && modalProjects.some((p: any) => p.id === saved.projectId)
      ? saved.projectId
      : modalProjects[0]?.id || ''
    setModalProjectId(projId)
  }, [modalProjects, showModal])

  useEffect(() => {
    if (!showModal) return
    writeLs({ workspaceId: modalWorkspaceId, projectId: modalProjectId, title: modalTitle, description: modalDescription })
  }, [modalWorkspaceId, modalProjectId, modalTitle, modalDescription, showModal])

  const createTicket = useMutation({
    mutationFn: async () => {
      if (!modalWorkspaceId || !modalProjectId || !modalTitle.trim()) throw new Error('Incomplete')
      return api.createTicket(modalWorkspaceId, { projectId: modalProjectId, title: modalTitle.trim(), description: modalDescription.trim() })
    },
    onSuccess: () => {
      if (selectedWorkspaceId === 'all') {
        queryClient.invalidateQueries({ queryKey: ['allTickets'] })
      } else {
        queryClient.invalidateQueries({ queryKey: ['tickets', selectedWorkspaceId] })
      }
      if (modalWorkspaceId) {
        queryClient.invalidateQueries({ queryKey: ['tickets', modalWorkspaceId] })
        if (modalProjectId) {
          queryClient.invalidateQueries({ queryKey: ['tickets', modalWorkspaceId, modalProjectId] })
        }
      }
      setModalTitle('')
      setModalDescription('')
      writeLs({ workspaceId: modalWorkspaceId, projectId: modalProjectId, title: '', description: '' })
      setShowModal(false)
    },
  })

  useEffect(() => {
    if (selectedWorkspaceId === 'all' && workspaces?.length && selectedWorkspaces.size === 0 && paramWorkspaces.length === 0) {
      setSelectedWorkspaces(new Set(workspaces.map((w: any) => w.id)))
    }
  }, [selectedWorkspaceId, workspaces, paramWorkspaces.length])

  const updateQuery = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const setSetAndQuery = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    key: string,
    allValues: string[],
    nextSet: Set<string>
  ) => {
    setter(nextSet)
    if (nextSet.size === 0 || nextSet.size === allValues.length) {
      updateQuery(key, null)
    } else {
      updateQuery(key, [...nextSet].join(','))
    }
  }

  const setViewAndQuery = (next: View) => {
    setView(next)
    if (next === 'board') updateQuery('view', null)
    else updateQuery('view', next)
  }

  const setArchivedAndQuery = (next: boolean) => {
    setShowArchived(next)
    if (next) updateQuery('archived', 'true')
    else updateQuery('archived', null)
  }

  const openTicketId = searchParams.get('ticket')
  const openTicket = tickets?.find((t: any) => t.id === openTicketId)
  const modalWorkspaceIdRef = useRef<string>('')

  useEffect(() => {
    if (openTicket && !modalWorkspaceIdRef.current) {
      modalWorkspaceIdRef.current = openTicket.workspaceId
    }
    if (!openTicketId) {
      modalWorkspaceIdRef.current = ''
    }
  }, [openTicket, openTicketId])

  const openTicketQuery = (ticketId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('ticket', ticketId)
    setSearchParams(next, { replace: true })
  }

  const closeTicketQuery = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('ticket')
    setSearchParams(next, { replace: true })
  }

  const toggleWorkspace = (id: string) => {
    const next = new Set(selectedWorkspaces)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSetAndQuery(setSelectedWorkspaces, 'workspace', workspaces ? workspaces.map((w: any) => w.id) : [], next)
  }

  const toggleStep = (step: string) => {
    const next = new Set(selectedSteps)
    if (next.has(step)) next.delete(step)
    else next.add(step)
    setSetAndQuery(setSelectedSteps, 'step', [...stepOrder], next)
  }

  const toggleStatus = (status: string) => {
    const next = new Set(selectedStatuses)
    if (next.has(status)) next.delete(status)
    else next.add(status)
    setSetAndQuery(setSelectedStatuses, 'status', [...metaStatuses], next)
  }

  const allNone = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    key: string,
    allValues: string[]
  ) => ({
    all: () => setSetAndQuery(setter, key, allValues, new Set(allValues)),
    none: () => setSetAndQuery(setter, key, allValues, new Set()),
  })

  const workspaceFilter = allNone(setSelectedWorkspaces, 'workspace', workspaces ? workspaces.map((w: any) => w.id) : [])
  const stepFilter = allNone(setSelectedSteps, 'step', [...stepOrder])
  const statusFilter = allNone(setSelectedStatuses, 'status', [...metaStatuses])

  const filteredTickets = useMemo(() => {
    if (!tickets) return []
    return tickets.filter((t: any) => {
      const displayStatus = deriveDisplayStatus(t.status)
      const workspaceMatch = selectedWorkspaceId === 'all' ? selectedWorkspaces.has(t.workspaceId) : true
      return (
        workspaceMatch &&
        selectedSteps.has(t.effectiveStep) &&
        selectedStatuses.has(displayStatus) &&
        (selectedProjects.size === 0 || selectedProjects.has(t.projectId))
      )
    })
  }, [tickets, selectedWorkspaceId, selectedWorkspaces, selectedSteps, selectedStatuses, selectedProjects])

  const workspaceMap = useMemo(() => {
    const map = new Map<string, string>()
    if (workspaces) {
      for (const w of workspaces as any[]) {
        map.set(w.id, w.name)
      }
    }
    return map
  }, [workspaces])

  const workspaceOptions = useMemo(() => (workspaces || []).map((w: any) => ({ value: w.id, label: w.name })), [workspaces])
  const projectOptions = useMemo(() => (modalProjects || []).map((p: any) => ({ value: p.id, label: p.name })), [modalProjects])
  const stepOptions = stepOrder.map((s) => ({ value: s, label: s }))
  const statusOptions = metaStatuses.map((s) => ({ value: s, label: formatStatus(s) }))

  if (workspaces && workspaces.length === 0) {
    return (
      <div className="max-w-7xl mx-auto min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center justify-center text-center py-20 px-4">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M4.5 21V10.5a2.25 2.25 0 012.25-2.25h11.25a2.25 2.25 0 012.25 2.25V21m-9-6h4.5m-13.5-3h19.5M6.75 8.25V6a2.25 2.25 0 012.25-2.25h6.75A2.25 2.25 0 0118 6v2.25" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">No workspaces yet</h2>
          <p className="text-lg text-gray-600 mb-8 max-w-md">Create a workspace to start organizing and tracking your tickets.</p>
          <Link
            to="/workspace"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg text-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create workspace
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">Tickets</h1>
        <button
          onClick={() => setShowModal(true)}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
          aria-label="Create ticket"
          title="Create ticket"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <div className="bg-white p-4 rounded shadow mb-4 flex flex-wrap items-center gap-4">
        {selectedWorkspaceId === 'all' && (
          <DropdownFilter
            label="Workspaces"
            options={workspaceOptions}
            selected={selectedWorkspaces}
            onToggle={toggleWorkspace}
            onAll={workspaceFilter.all}
            onNone={workspaceFilter.none}
          />
        )}
        <DropdownFilter
          label="Steps"
          options={stepOptions}
          selected={selectedSteps}
          onToggle={toggleStep}
          onAll={stepFilter.all}
          onNone={stepFilter.none}
        />
        <DropdownFilter
          label="Status"
          options={statusOptions}
          selected={selectedStatuses}
          onToggle={toggleStatus}
          onAll={statusFilter.all}
          onNone={statusFilter.none}
        />

        <Checkbox
          checked={showArchived}
          onChange={setArchivedAndQuery}
          label="Show archived"
        />

        <div className="ml-auto flex items-center bg-gray-100 rounded p-1">
          {views.map((v) => (
            <button
              key={v}
              onClick={() => setViewAndQuery(v)}
              className={`px-3 py-1.5 text-sm rounded capitalize ${view === v ? 'bg-white shadow text-indigo-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'board' && (
        <BoardView tickets={filteredTickets} steps={stepOrder.filter((s) => selectedSteps.has(s))} workspaceMap={workspaceMap} onOpenTicket={openTicketQuery} />
      )}
      {view === 'list' && (
        <ListView tickets={filteredTickets} workspaceMap={workspaceMap} onOpenTicket={openTicketQuery} />
      )}
      {view === 'cards' && (
        <CardsView tickets={filteredTickets} workspaceMap={workspaceMap} onOpenTicket={openTicketQuery} />
      )}

      {openTicketId && (
        <TicketModal
          workspaceId={openTicket?.workspaceId || modalWorkspaceIdRef.current}
          ticketId={openTicketId}
          onClose={closeTicketQuery}
        />
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Ticket</h2>
              <button className="text-gray-500 hover:text-gray-800" onClick={() => setShowModal(false)}>Close</button>
            </div>
            <div className="space-y-4">
              {selectedWorkspaceId === 'all' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Workspace</label>
                  <DropdownSelect
                    className="w-full"
                    options={workspaceOptions}
                    value={modalWorkspaceId}
                    onChange={(value) => setModalWorkspaceId(value)}
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                <DropdownSelect
                  className="w-full"
                  options={projectOptions}
                  value={modalProjectId}
                  onChange={(value) => setModalProjectId(value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  className="w-full border border-gray-300 px-3 py-2 rounded"
                  placeholder="Ticket title"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && modalTitle.trim() && modalWorkspaceId && modalProjectId) createTicket.mutate() }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  className="w-full border border-gray-300 px-3 py-2 rounded"
                  placeholder="Ticket description"
                  rows={4}
                  value={modalDescription}
                  onChange={(e) => setModalDescription(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between gap-2 pt-2">
                <IntegrationImportButtons
                  onImport={({ title: t, description: d }) => {
                    setModalTitle(t)
                    setModalDescription(d)
                  }}
                />
                <div className="flex items-center gap-2">
                  <button
                    className="px-4 py-2 rounded text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="bg-indigo-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
                    disabled={!modalWorkspaceId || !modalProjectId || !modalTitle.trim() || createTicket.isPending}
                    onClick={() => createTicket.mutate()}
                  >
                    {createTicket.isPending ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BoardView({ tickets, steps, workspaceMap, onOpenTicket }: { tickets: any[]; steps: string[]; workspaceMap: Map<string, string>; onOpenTicket: (id: string) => void }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {steps.map((step) => (
        <div key={step} className="min-w-[260px] w-1/5 bg-gray-100 rounded p-3 flex flex-col max-h-[70vh]">
          <div className="text-xs font-bold uppercase text-gray-500 mb-2 sticky top-0 bg-gray-100 py-1 capitalize">
            {step}
          </div>
          <div className="space-y-2 overflow-y-auto flex-1">
            {tickets
              .filter((t: any) => t.effectiveStep === step)
              .map((t: any) => <TicketCard key={t.id} t={t} workspaceMap={workspaceMap} onClick={() => onOpenTicket(t.id)} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function ListView({ tickets, workspaceMap, onOpenTicket }: { tickets: any[]; workspaceMap: Map<string, string>; onOpenTicket: (id: string) => void }) {
  return (
    <div className="bg-white rounded shadow overflow-hidden">
      <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-gray-50 text-xs font-bold uppercase text-gray-500">
        <div className="col-span-5">Title</div>
        <div className="col-span-2">Workspace</div>
        <div className="col-span-2">Step</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-1"></div>
      </div>
      <div className="divide-y">
        {tickets.map((t: any) => (
          <div
            key={t.id}
            onClick={() => onOpenTicket(t.id)}
            className={`grid grid-cols-12 gap-4 px-4 py-3 items-center cursor-pointer ${t.archivedAt ? 'bg-gray-100 opacity-75' : 'hover:bg-gray-50'}`}
          >
            <div className="col-span-5 font-medium truncate">{t.title}</div>
            <div className="col-span-2 text-sm text-gray-600 truncate">{workspaceMap.get(t.workspaceId) || t.workspaceName || 'Unknown'}</div>
            <div className="col-span-2 text-sm capitalize">{t.effectiveStep}</div>
            <div className="col-span-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${statusBadgeClasses(t.status)}`}>
                {formatStatus(t.status)}
              </span>
              {t.archivedAt && <span className="ml-2 text-[10px] text-gray-500 uppercase tracking-wide">Archived</span>}
            </div>
            <div className="col-span-1 text-right">
              <span className="text-indigo-600 text-sm hover:underline">Open</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CardsView({ tickets, workspaceMap, onOpenTicket }: { tickets: any[]; workspaceMap: Map<string, string>; onOpenTicket: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {tickets.map((t: any) => (
        <div
          key={t.id}
          onClick={() => onOpenTicket(t.id)}
          className={`p-4 rounded shadow block cursor-pointer ${t.archivedAt ? 'bg-gray-100 opacity-75' : 'bg-white hover:shadow-md'}`}
        >
          <div className="font-medium mb-2">{t.title}</div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 truncate">{workspaceMap.get(t.workspaceId) || t.workspaceName || 'Unknown'}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${statusBadgeClasses(t.status)}`}>
              {formatStatus(t.status)}
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-400 capitalize">{t.effectiveStep}</div>
          {t.archivedAt && <div className="mt-1 text-[10px] text-gray-500 uppercase tracking-wide">Archived</div>}
        </div>
      ))}
    </div>
  )
}

function TicketCard({ t, workspaceMap, onClick }: { t: any; workspaceMap: Map<string, string>; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`block p-3 rounded shadow-sm text-sm hover:shadow cursor-pointer ${t.archivedAt ? 'bg-gray-100 opacity-75' : 'bg-white'}`}
    >
      <div className="font-medium mb-1">{t.title}</div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500 truncate">{workspaceMap.get(t.workspaceId) || t.workspaceName || 'Unknown'}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${statusBadgeClasses(t.status)}`}>
          {formatStatus(t.status)}
        </span>
      </div>
      {t.archivedAt && (
        <div className="mt-1 text-[10px] text-gray-500 uppercase tracking-wide">Archived</div>
      )}
    </div>
  )
}


