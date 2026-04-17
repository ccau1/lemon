import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api.ts'
import { useState, useEffect, useMemo, useRef } from 'react'
import { DropdownSelect, DropdownFilter } from '../components/Dropdown.tsx'
import { formatStatus } from '../utils.ts'

const LS_KEY = 'ticket_form'

type TicketFormStore = Record<string, Record<string, { title?: string; description?: string; open?: boolean; projectId?: string }>>

function readStore(): TicketFormStore {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}') as TicketFormStore
  } catch {
    return {}
  }
}

function writeStore(store: TicketFormStore) {
  localStorage.setItem(LS_KEY, JSON.stringify(store))
}

function getFormState(workspaceId: string, projectId: string): { title: string; description: string; open: boolean; projectId?: string } {
  const store = readStore()
  const raw = store[workspaceId]?.[projectId]
  return { title: raw?.title || '', description: raw?.description || '', open: raw?.open || false, projectId: raw?.projectId }
}

function setFormState(workspaceId: string, projectId: string, patch: { title?: string; description?: string; open?: boolean; projectId?: string }) {
  const store = readStore()
  if (!store[workspaceId]) store[workspaceId] = {}
  const existing = store[workspaceId][projectId] || {}
  store[workspaceId][projectId] = { ...existing, ...patch }
  writeStore(store)
}

function clearFormState(workspaceId: string, projectId: string) {
  const store = readStore()
  if (store[workspaceId]) {
    delete store[workspaceId][projectId]
    writeStore(store)
  }
}

const steps = ['spec', 'plan', 'tasks', 'implement', 'done'] as const
const globKeys = ['default', ...steps] as const

const sortOptions = [
  { value: 'createdAt_desc', label: 'Newest' },
  { value: 'createdAt_asc', label: 'Oldest' },
  { value: 'title_asc', label: 'Title A-Z' },
  { value: 'title_desc', label: 'Title Z-A' },
  { value: 'status_asc', label: 'Status A-Z' },
  { value: 'status_desc', label: 'Status Z-A' },
] as const

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()
  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.getWorkspaces,
  })
  const { data: projects } = useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: () => api.getProjects(workspaceId!),
    enabled: !!workspaceId,
  })
  const { data: tickets } = useQuery({
    queryKey: ['tickets', workspaceId],
    queryFn: () => api.getTickets(workspaceId!),
    enabled: !!workspaceId,
  })
  const { data: globalConfig } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
  })
  const { data: rawConfig } = useQuery({
    queryKey: ['configRaw', workspaceId],
    queryFn: () => api.getConfigRaw(workspaceId!),
    enabled: !!workspaceId,
  })
  const { data: models } = useQuery({
    queryKey: ['models'],
    queryFn: api.getModels,
  })

  const workspace = useMemo(() => {
    return (workspaces || []).find((w: any) => w.id === workspaceId)
  }, [workspaces, workspaceId])

  const [name, setName] = useState('')
  const createProject = useMutation({
    mutationFn: api.createProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] }),
  })

  const firstProjectId = projects?.[0]?.id || ''
  const singleProject = projects?.length === 1 ? projects[0] : null
  const projectKey = singleProject?.id ?? ''

  const generalKey = '_general'
  const initialGeneral = getFormState(workspaceId || '', generalKey)
  const [ticketTitle, setTicketTitle] = useState(initialGeneral.title)
  const [ticketDescription, setTicketDescription] = useState(initialGeneral.description)
  const [ticketProjectId, setTicketProjectId] = useState(initialGeneral.projectId || firstProjectId)
  const [showTicketForm, setShowTicketForm] = useState(initialGeneral.open)

  const initialProject = getFormState(workspaceId || '', projectKey)
  const [projectTicketTitle, setProjectTicketTitle] = useState(initialProject.title)
  const [projectTicketDescription, setProjectTicketDescription] = useState(initialProject.description)
  const [showProjectTicketForm, setShowProjectTicketForm] = useState(initialProject.open)

  const [showConfigModal, setShowConfigModal] = useState(false)
  const [localAutoApprove, setLocalAutoApprove] = useState<Record<string, boolean>>({})
  const [localConcurrency, setLocalConcurrency] = useState<string>('')
  const [localStepGlobs, setLocalStepGlobs] = useState<Record<string, string>>({})
  const [localDefaultModels, setLocalDefaultModels] = useState<Record<string, string>>({})
  const [localPrompts, setLocalPrompts] = useState<Record<string, string>>({})

  const projectHydrated = useRef(false)
  const skipNextProjectPersist = useRef(false)

  useEffect(() => {
    if (firstProjectId && !ticketProjectId) {
      setTicketProjectId(firstProjectId)
    }
  }, [firstProjectId])

  useEffect(() => {
    if (!workspaceId) return
    if (!projectHydrated.current) return
    if (skipNextProjectPersist.current) {
      skipNextProjectPersist.current = false
      return
    }
    setFormState(workspaceId, projectKey, { title: projectTicketTitle, description: projectTicketDescription, open: showProjectTicketForm })
  }, [workspaceId, projectKey, projectTicketTitle, showProjectTicketForm])

  useEffect(() => {
    if (!workspaceId) return
    const saved = getFormState(workspaceId, projectKey)
    setProjectTicketTitle(saved.title)
    setProjectTicketDescription(saved.description)
    setShowProjectTicketForm(saved.open)
    skipNextProjectPersist.current = true
    projectHydrated.current = true
  }, [workspaceId, projectKey])

  useEffect(() => {
    if (!workspaceId) return
    const saved = getFormState(workspaceId, generalKey)
    setTicketTitle(saved.title)
    setTicketDescription(saved.description)
    setShowTicketForm(saved.open)
    setTicketProjectId(saved.projectId || firstProjectId)
  }, [workspaceId, firstProjectId])

  useEffect(() => {
    if (!workspaceId) return
    setFormState(workspaceId, generalKey, { title: ticketTitle, description: ticketDescription, open: showTicketForm, projectId: ticketProjectId })
  }, [workspaceId, ticketTitle, showTicketForm, ticketProjectId])

  useEffect(() => {
    if (!rawConfig) return
    setLocalAutoApprove(rawConfig.autoApprove || {})
    setLocalConcurrency(rawConfig.parallelConcurrency !== undefined ? String(rawConfig.parallelConcurrency) : '')
    setLocalDefaultModels(rawConfig.defaultModels || {})
    setLocalPrompts((rawConfig.prompts as Record<string, string>) || {})

    const next: Record<string, string> = {}
    const rawGlobs = rawConfig.contextGlobs
    if (Array.isArray(rawGlobs)) {
      const joined = rawGlobs.join('\n')
      globKeys.forEach((k) => (next[k] = joined))
    } else if (rawGlobs && typeof rawGlobs === 'object') {
      globKeys.forEach((k) => {
        const arr = (rawGlobs as Record<string, string[]>)[k]
        next[k] = Array.isArray(arr) ? arr.join('\n') : ''
      })
    } else {
      globKeys.forEach((k) => (next[k] = ''))
    }
    setLocalStepGlobs(next)
  }, [rawConfig, showConfigModal])

  const createTicket = useMutation({
    mutationFn: (body: { projectId: string; title: string; description: string }) =>
      api.createTicket(workspaceId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', workspaceId] })
    },
  })

  const [editingName, setEditingName] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)
  const renameProject = useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name: string }) =>
      api.renameProject(workspaceId!, projectId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] })
      setIsEditingName(false)
    },
  })

  const getGlobalGlobsPlaceholder = (key: string) => {
    if (!globalConfig) return ''
    const g = globalConfig.contextGlobs
    if (Array.isArray(g)) return g.join('\n')
    return (g as Record<string, string[]>)?.[key]?.join('\n') || ''
  }

  const getGlobalPromptPlaceholder = (step: string) => {
    if (!globalConfig) return ''
    return (globalConfig.prompts as Record<string, string>)?.[step] || ''
  }

  const saveConfig = useMutation({
    mutationFn: async () => {
      if (!workspaceId) return
      const promises: Promise<any>[] = []
      steps.forEach((step) => {
        const val = localAutoApprove[step]
        if (val !== undefined && val !== rawConfig?.autoApprove?.[step]) {
          promises.push(api.setConfig({ key: `autoApprove.${step}`, value: val, workspaceId }))
        }
      })

      if (localConcurrency.trim()) {
        const num = Number(localConcurrency.trim())
        if (!isNaN(num) && num !== rawConfig?.parallelConcurrency) {
          promises.push(api.setConfig({ key: 'parallelConcurrency', value: num, workspaceId }))
        }
      }

      const record: Record<string, string[]> = {}
      globKeys.forEach((k) => {
        const arr = localStepGlobs[k]?.split('\n').map((s) => s.trim()).filter((s) => s.length > 0) || []
        if (arr.length > 0) record[k] = arr
      })
      if (Object.keys(record).length > 0) {
        promises.push(api.setConfig({ key: 'contextGlobs', value: record, workspaceId }))
      }

      const nextDefaultModels: Record<string, string> = {}
      steps.forEach((step) => {
        const val = localDefaultModels[step]?.trim()
        if (val) nextDefaultModels[step] = val
      })
      const hasDefaultModelChanges = steps.some((step) => {
        const rawVal = rawConfig?.defaultModels?.[step]
        const newVal = nextDefaultModels[step]
        return rawVal !== newVal && (rawVal !== undefined || newVal !== undefined)
      })
      if (hasDefaultModelChanges || Object.keys(nextDefaultModels).length !== Object.keys(rawConfig?.defaultModels || {}).length) {
        promises.push(api.setConfig({ key: 'defaultModels', value: nextDefaultModels, workspaceId }))
      }

      const nextPrompts: Record<string, string> = {}
      steps.filter((s) => s !== 'done').forEach((step) => {
        const val = localPrompts[step]?.trim()
        if (val) nextPrompts[step] = val
      })
      const hasPromptChanges = steps.filter((s) => s !== 'done').some((step) => {
        const rawVal = rawConfig?.prompts?.[step]
        const newVal = nextPrompts[step]
        return rawVal !== newVal && (rawVal !== undefined || newVal !== undefined)
      })
      if (hasPromptChanges || Object.keys(nextPrompts).length !== Object.keys(rawConfig?.prompts || {}).length) {
        promises.push(api.setConfig({ key: 'prompts', value: nextPrompts, workspaceId }))
      }

      await Promise.all(promises)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configRaw', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['config'] })
      setShowConfigModal(false)
    },
  })

  const handleCreateTicket = () => {
    if (ticketProjectId && ticketTitle.trim()) {
      createTicket.mutate({ projectId: ticketProjectId, title: ticketTitle, description: ticketDescription })
      setTicketTitle('')
      setTicketDescription('')
      setShowTicketForm(false)
      if (workspaceId) clearFormState(workspaceId, generalKey)
    }
  }

  const handleCreateProjectTicket = () => {
    if (singleProject && projectTicketTitle.trim()) {
      createTicket.mutate({ projectId: singleProject.id, title: projectTicketTitle, description: projectTicketDescription })
      setProjectTicketTitle('')
      setProjectTicketDescription('')
      setShowProjectTicketForm(false)
      if (workspaceId && singleProject) clearFormState(workspaceId, singleProject.id)
    }
  }

  const availableStatuses = useMemo(() => {
    const set = new Set<string>()
    for (const t of tickets || []) set.add(t.status)
    return Array.from(set).sort()
  }, [tickets])

  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (availableStatuses.length === 0) return
    setSelectedStatuses((prev) => {
      if (prev.size > 0) return prev
      const next = new Set(availableStatuses.filter((s) => s !== 'done'))
      return next
    })
  }, [availableStatuses])

  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]['value']>('createdAt_desc')
  const [page, setPage] = useState(1)
  const perPage = 10

  const processedTickets = useMemo(() => {
    let list = (tickets || []).filter((t: any) => selectedStatuses.has(t.status))

    list = [...list].sort((a: any, b: any) => {
      switch (sortBy) {
        case 'createdAt_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'createdAt_asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        case 'title_asc':
          return a.title.localeCompare(b.title)
        case 'title_desc':
          return b.title.localeCompare(a.title)
        case 'status_asc':
          return a.status.localeCompare(b.status)
        case 'status_desc':
          return b.status.localeCompare(a.status)
        default:
          return 0
      }
    })

    return list
  }, [tickets, selectedStatuses, sortBy])

  const totalPages = Math.max(1, Math.ceil(processedTickets.length / perPage))
  const paginatedTickets = processedTickets.slice((page - 1) * perPage, page * perPage)

  useEffect(() => {
    setPage(1)
  }, [selectedStatuses, sortBy])

  if (!workspace) return <p>Loading...</p>

  return (
    <>
      <style>{`
        .clip-tube {
          clip-path: path('M 0 0 C 0 6, 5 11, 8 13 C 11 11, 16 6, 16 0 Z');
        }
      `}</style>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-bold">{workspace.name}</h1>
            <span className="text-xs text-gray-400">workspace</span>
          </div>
          <button
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:border-indigo-600 hover:text-indigo-600 transition-colors"
            onClick={() => setShowConfigModal(true)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            Config
          </button>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Tickets</h2>
              <button
                className={`w-6 h-6 shrink-0 text-indigo-600 font-medium rounded flex items-center justify-center z-0 ${showTicketForm ? 'bg-gray-50 relative' : 'hover:bg-gray-100'}`}
                onClick={() => setShowTicketForm((v) => !v)}
                aria-label="Create ticket"
              >
                +
                {showTicketForm && (
                  <span className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 w-4 h-[14px] bg-gray-50 -z-10 clip-tube" />
                )}
              </button>
            </div>
            {singleProject && (
              <Link
                to={`/workspace/${workspaceId}/project/${singleProject.id}`}
                className="text-indigo-600 text-sm hover:underline"
              >
                View Board →
              </Link>
            )}
          </div>

          {showTicketForm && (
            <div className="bg-gray-50 p-3 rounded mb-3 relative z-10">
              <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <DropdownSelect
                    className="w-full sm:w-auto sm:max-w-[200px]"
                    options={(projects || []).map((p: any) => ({ value: p.id, label: p.name }))}
                    value={ticketProjectId}
                    onChange={(value) => setTicketProjectId(value)}
                  />
                  <input
                    className="border border-gray-300 px-3 py-2 rounded flex-1"
                    placeholder="Ticket title"
                    value={ticketTitle}
                    onChange={(e) => setTicketTitle(e.target.value)}
                  />
                  <button
                    className="bg-indigo-600 text-white px-4 py-2 rounded text-sm"
                    disabled={!ticketTitle.trim()}
                    onClick={handleCreateTicket}
                  >
                    Create
                  </button>
                </div>
                <textarea
                  className="border border-gray-300 px-3 py-2 rounded w-full"
                  placeholder="Ticket description"
                  rows={3}
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <DropdownFilter
              label="Status"
              options={availableStatuses.map((s) => ({ value: s, label: formatStatus(s) }))}
              selected={selectedStatuses}
              onToggle={(value) => {
                const next = new Set(selectedStatuses)
                if (next.has(value)) next.delete(value)
                else next.add(value)
                setSelectedStatuses(next)
              }}
              onAll={() => setSelectedStatuses(new Set(availableStatuses))}
              onNone={() => setSelectedStatuses(new Set())}
            />
            <DropdownSelect
              className="w-auto"
              options={sortOptions.map((o) => ({ value: o.value, label: o.label }))}
              value={sortBy}
              onChange={(value) => setSortBy(value as any)}
            />
            <span className="text-sm text-gray-500 ml-auto">
              {processedTickets.length} ticket{processedTickets.length !== 1 ? 's' : ''}
            </span>
          </div>

          <ul className="space-y-2 mb-4">
            {paginatedTickets.map((t: any) => (
              <li key={t.id}>
                <Link
                  to={`/workspace/${workspaceId}/ticket/${t.id}`}
                  className="border rounded p-3 flex justify-between items-center hover:bg-gray-50 block"
                >
                  <div>
                    <div className="text-sm font-medium">{t.title}</div>
                    <div className="text-xs text-gray-500 uppercase">{formatStatus(t.status)}</div>
                  </div>
                  <span className="text-indigo-600 text-sm">Open →</span>
                </Link>
              </li>
            ))}
            {paginatedTickets.length === 0 && (
              <li className="text-sm text-gray-500 py-4 text-center">No tickets match the current filters.</li>
            )}
          </ul>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button
                className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>

        <h2 className="text-base font-semibold text-gray-700">Projects</h2>
        <div className="bg-white p-4 rounded shadow">
          {singleProject ? (
            <>
              {isEditingName ? (
                <div className="flex gap-2 mb-3">
                  <input
                    className="border px-3 py-2 rounded flex-1"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        renameProject.mutate({ projectId: singleProject.id, name: editingName })
                      }
                    }}
                    autoFocus
                  />
                  <button
                    className="bg-indigo-600 text-white px-3 py-2 rounded text-sm"
                    onClick={() => renameProject.mutate({ projectId: singleProject.id, name: editingName })}
                  >
                    Save
                  </button>
                  <button
                    className="bg-gray-200 px-3 py-2 rounded text-sm"
                    onClick={() => setIsEditingName(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{singleProject.name}</h3>
                  <button
                    className="text-xs text-gray-500 hover:text-indigo-600"
                    onClick={() => {
                      setEditingName(singleProject.name)
                      setIsEditingName(true)
                    }}
                  >
                    Rename
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-gray-700">Recent Project Tickets</h3>
                  <button
                    className={`w-6 h-6 shrink-0 text-indigo-600 font-medium rounded flex items-center justify-center text-sm z-0 ${showProjectTicketForm ? 'bg-gray-50 relative' : 'hover:bg-gray-100'}`}
                    onClick={() => setShowProjectTicketForm((v) => !v)}
                    aria-label="Create ticket"
                  >
                    +
                    {showProjectTicketForm && (
                      <span className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 w-4 h-[14px] bg-gray-50 -z-10 clip-tube" />
                    )}
                  </button>
                </div>
                <Link
                  to={`/workspace/${workspaceId}/project/${singleProject.id}`}
                  className="text-indigo-600 text-sm hover:underline"
                >
                  View Board →
                </Link>
              </div>

              {showProjectTicketForm && (
                <div className="bg-gray-50 p-3 rounded mb-3 relative z-10">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        className="border border-gray-300 px-3 py-2 rounded flex-1"
                        placeholder="Ticket title"
                        value={projectTicketTitle}
                        onChange={(e) => setProjectTicketTitle(e.target.value)}
                      />
                      <button
                        className="bg-indigo-600 text-white px-4 py-2 rounded text-sm"
                        disabled={!projectTicketTitle.trim()}
                        onClick={handleCreateProjectTicket}
                      >
                        Create
                      </button>
                    </div>
                    <textarea
                      className="border border-gray-300 px-3 py-2 rounded w-full"
                      placeholder="Ticket description"
                      rows={3}
                      value={projectTicketDescription}
                      onChange={(e) => setProjectTicketDescription(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <ul className="space-y-2 mb-4">
                {(tickets || []).filter((t: any) => t.projectId === singleProject.id).slice(0, 5).map((t: any) => (
                  <li key={t.id}>
                    <Link
                      to={`/workspace/${workspaceId}/ticket/${t.id}`}
                      className="border rounded p-3 flex justify-between items-center hover:bg-gray-50 block"
                    >
                      <div>
                        <div className="text-sm font-medium">{t.title}</div>
                        <div className="text-xs text-gray-500 uppercase">{formatStatus(t.status)}</div>
                      </div>
                      <span className="text-indigo-600 text-sm">Open →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                <input
                  className="border px-3 py-2 rounded flex-1"
                  placeholder="Project name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <button
                  className="bg-indigo-600 text-white px-4 py-2 rounded"
                  onClick={() => createProject.mutate({ workspaceId: workspaceId!, name })}
                >
                  Add
                </button>
              </div>
              <ul className="space-y-2">
                {(projects || []).map((p: any) => (
                  <li key={p.id}>
                    <Link
                      to={`/workspace/${workspaceId}/project/${p.id}`}
                      className="border rounded p-3 flex justify-between items-center hover:bg-gray-50 block"
                    >
                      <span>{p.name}</span>
                      <span className="text-indigo-600 text-sm">View →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {showConfigModal && globalConfig && rawConfig && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConfigModal(false)
          }}
        >
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Edit Config — {workspace.name}</h2>
              <button className="text-gray-500 hover:text-gray-800" onClick={() => setShowConfigModal(false)}>
                Close
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">Leave fields empty to inherit global values.</p>

            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold mb-2">Default Models</h3>
                <div className="flex items-center gap-2 mb-3">
                  <DropdownSelect
                    className="w-auto"
                    placeholder="Set all steps to..."
                    options={(models || []).map((m: any) => ({ value: m.id, label: m.name }))}
                    value=""
                    onChange={(modelId) => {
                      if (modelId) {
                        const next: Record<string, string> = {}
                        for (const s of steps) next[s] = modelId
                        setLocalDefaultModels((prev) => ({ ...prev, ...next }))
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  {steps.map((step) => {
                    const hasLocal = !!localDefaultModels[step]
                    const globalModelId = globalConfig.defaultModels?.[step]
                    const globalName = globalModelId ? (models || []).find((m: any) => m.id === globalModelId)?.name || globalModelId : undefined
                    return (
                      <div key={step} className="flex items-center gap-3">
                        <span className="w-20 capitalize text-sm">{step}</span>
                        <DropdownSelect
                          className="flex-1"
                          placeholder="— Inherit global —"
                          options={(models || []).map((m: any) => ({ value: m.id, label: m.name }))}
                          value={localDefaultModels[step] || ''}
                          onChange={(modelId) => setLocalDefaultModels((prev) => ({ ...prev, [step]: modelId }))}
                        />
                        {!hasLocal && globalName && (
                          <span className="text-xs text-gray-400">(global: {globalName})</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Auto-Approve</h3>
                <div className="space-y-2">
                  {steps.map((step) => {
                    const overridden = rawConfig.autoApprove && step in rawConfig.autoApprove
                    const val = overridden ? localAutoApprove[step] : globalConfig.autoApprove?.[step]
                    return (
                      <label key={step} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="w-5 h-5"
                          checked={!!val}
                          onChange={(e) => {
                            setLocalAutoApprove((prev) => ({ ...prev, [step]: e.target.checked }))
                          }}
                        />
                        <span className="capitalize">{step}</span>
                        {!overridden && (
                          <span className="text-xs text-gray-400">(global: {globalConfig.autoApprove?.[step] ? 'on' : 'off'})</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Parallel Concurrency</h3>
                <input
                  type="number"
                  className="border border-gray-300 px-3 py-2 rounded w-32"
                  value={localConcurrency}
                  placeholder={String(globalConfig.parallelConcurrency ?? 3)}
                  onChange={(e) => setLocalConcurrency(e.target.value)}
                />
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Context Globs</h3>
                <p className="text-xs text-gray-500 mb-2">One glob per line. Leave empty to inherit global defaults.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {globKeys.map((key) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">{key === 'default' ? 'Default' : key}</label>
                      <textarea
                        className="border border-gray-300 px-3 py-2 rounded w-full h-20 font-mono text-sm"
                        value={localStepGlobs[key] || ''}
                        placeholder={getGlobalGlobsPlaceholder(key)}
                        onChange={(e) => setLocalStepGlobs((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Step Prompts</h3>
                <p className="text-xs text-gray-500 mb-2">Leave empty to inherit global prompts.</p>
                <div className="space-y-3">
                  {steps.filter((s) => s !== 'done').map((step) => (
                    <div key={step}>
                      <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">{step}</label>
                      <textarea
                        className="border border-gray-300 px-3 py-2 rounded w-full h-24 font-mono text-sm"
                        value={localPrompts[step] || ''}
                        placeholder={getGlobalPromptPlaceholder(step) || '(use default)'}
                        onChange={(e) => setLocalPrompts((prev) => ({ ...prev, [step]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button className="px-4 py-2 rounded text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowConfigModal(false)}>
                Cancel
              </button>
              <button
                className="bg-indigo-600 text-white px-4 py-2 rounded text-sm"
                onClick={() => saveConfig.mutate()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
