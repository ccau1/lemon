import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.ts'
import { useEffect, useState, useMemo, useCallback } from 'react'
import type { WorkflowStep } from '@lemon/shared'
import TicketView from '../components/TicketView.tsx'

const allSteps: WorkflowStep[] = ['spec', 'plan', 'tasks', 'implement', 'done']

const viewTabs: Array<WorkflowStep | 'workflow'> = ['spec', 'plan', 'tasks']

export interface TicketContainerProps {
  workspaceId: string
  ticketId: string
}

export default function TicketContainer({ workspaceId, ticketId }: TicketContainerProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ticketDetails', workspaceId, ticketId],
    queryFn: async () => {
      const result = await api.getTicketDetails(workspaceId, ticketId)
      const lmState = await api.getTicketLmState(workspaceId, ticketId).catch(() => null)
      console.log('[TicketContainer] ticketDetails:', {
        planOutdated: result.plan?.outdated,
        tasksOutdated: result.tasks?.some((t: any) => t.outdated),
        taskCount: result.tasks?.length,
        _debugOutdatedSteps: (result as any)._debugOutdatedSteps,
        rawLmState: lmState,
      })
      return result
    },
    enabled: !!workspaceId && !!ticketId,
  })
  const { data: actionLinkages } = useQuery({
    queryKey: ['ticketActionLinkages', workspaceId, ticketId],
    queryFn: () => api.getTicketActionLinkages(workspaceId, ticketId),
    enabled: !!workspaceId && !!ticketId,
  })
  const { data: globalConfig } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
  })
  const { data: rawConfig } = useQuery({
    queryKey: ['configRaw', workspaceId],
    queryFn: () => api.getConfigRaw(workspaceId),
    enabled: !!workspaceId,
  })
  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.getWorkspaces,
  })
  const workspace = useMemo(() => {
    return (workspaces || []).find((w: any) => w.id === workspaceId)
  }, [workspaces, workspaceId])

  const effectiveAutoApprove = useMemo(() => {
    const global = (globalConfig?.autoApprove || {}) as Record<string, boolean>
    const workspace = (rawConfig?.autoApprove || {}) as Record<string, boolean>
    const ticket = (data?.ticket?.autoApprove || {}) as Record<string, boolean>
    const result: Record<string, boolean> = {}
    for (const step of allSteps) {
      if (step in ticket) result[step] = ticket[step]!
      else if (step in workspace) result[step] = workspace[step]!
      else result[step] = global[step] ?? false
    }
    return result as Record<WorkflowStep, boolean>
  }, [globalConfig, rawConfig, data?.ticket?.autoApprove])

  const effectiveStep = (!isLoading && data?.ticket?.effectiveStep) || 'spec'
  const columnStep = (!isLoading && data?.ticket?.columnStep) || 'spec'
  const paramTab = searchParams.get('tab')
  const activeTab: WorkflowStep | 'workflow' = useMemo(() => {
    if (paramTab && viewTabs.includes(paramTab as any)) {
      const paramIdx = viewTabs.indexOf(paramTab as any)
      const effIdx = viewTabs.indexOf(effectiveStep as any)
      if (paramIdx <= effIdx) return paramTab as WorkflowStep | 'workflow'
      // Allow viewing downstream tabs that have content (outdated or not)
      if (paramTab === 'plan' && data?.plan?.content) return 'plan'
      if (paramTab === 'tasks' && data?.tasks?.length) return 'tasks'
    }
    return effectiveStep
  }, [paramTab, effectiveStep, data?.plan?.content, data?.tasks])
  const [expandedTab, setExpandedTab] = useState<WorkflowStep | null>(null)
  const [actionError, setActionError] = useState<string>('')
  const [dismissedServerError, setDismissedServerError] = useState(false)
  const [blockedModal, setBlockedModal] = useState<{ open: boolean; reason: string }>({ open: false, reason: '' })

  useEffect(() => {
    setDismissedServerError(false)
  }, [data?.ticket?.errorMessage])

  type ChatTurn = { user: string; assistant?: string; status: 'fetching' | 'responded' | 'failed'; error?: string }
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([])

  const { data: threadData } = useQuery({
    queryKey: ['ticketThread', workspaceId, ticketId, activeTab],
    queryFn: () => api.getTicketThread(workspaceId, ticketId, activeTab),
    enabled: !!workspaceId && !!ticketId && activeTab !== 'workflow',
  })

  useEffect(() => {
    const thread = threadData?.thread || []
    const turns: ChatTurn[] = []
    for (let i = 0; i < thread.length; i++) {
      const m = thread[i]
      if (m.role === 'user') {
        const next = thread[i + 1]
        turns.push({
          user: m.content,
          assistant: next?.role === 'assistant' ? next.content : undefined,
          status: next?.role === 'assistant' ? 'responded' : 'fetching',
        })
        if (next?.role === 'assistant') i++
      }
    }
    setChatTurns(turns)
  }, [threadData])

  const regenerate = useMutation({
    mutationFn: ({ step }: { step: WorkflowStep }) => api.regenerateTicket(workspaceId, ticketId, step),
    onSuccess: () => {
      setActionError('')
      refetch()
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (err: any) => {
      setActionError(err?.message || 'Regenerate failed')
      refetch()
    },
  })

  const cancelRun = useMutation({
    mutationFn: () => api.cancelTicketRun(workspaceId, ticketId),
    onSuccess: () => {
      setActionError('')
      refetch()
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (err: any) => {
      setActionError(err?.message || 'Cancel failed')
      refetch()
    },
  })

  const stopImplement = useMutation({
    mutationFn: () => api.stopImplementation(workspaceId, ticketId),
    onSuccess: () => {
      setActionError('')
      refetch()
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (err: any) => {
      setActionError(err?.message || 'Stop failed')
      refetch()
    },
  })

  const startImplement = useMutation({
    mutationFn: () => api.startImplementation(workspaceId, ticketId),
    onSuccess: () => {
      setActionError('')
      refetch()
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (err: any) => {
      setActionError(err?.message || 'Start failed')
      refetch()
    },
  })

  const retryTask = useMutation({
    mutationFn: (taskId: string) => api.retryTask(workspaceId, ticketId, taskId),
    onSuccess: () => {
      setActionError('')
      refetch()
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (err: any) => {
      setActionError(err?.message || 'Retry failed')
      refetch()
    },
  })

  const startTaskEarly = useMutation({
    mutationFn: (taskId: string) => api.startTaskEarly(workspaceId, ticketId, taskId),
    onSuccess: () => {
      setActionError('')
      setBlockedModal({ open: false, reason: '' })
      refetch()
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (err: any) => {
      if (err?.status === 409) {
        setBlockedModal({ open: true, reason: err?.message || 'This task cannot be started early due to dependencies.' })
      } else {
        setActionError(err?.message || 'Start early failed')
      }
      refetch()
    },
  })

  const approve = useMutation({
    mutationFn: () => api.approveTicket(workspaceId, ticketId),
    onSuccess: async () => {
      setActionError('')
      await refetch()
      queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      const fresh = queryClient.getQueryData(['ticketDetails', workspaceId, ticketId]) as any
      const newStep = (fresh?.ticket?.effectiveStep as WorkflowStep) || effectiveStep
      if (activeTab !== 'workflow') {
        const activeIdx = viewTabs.indexOf(activeTab)
        const newIdx = viewTabs.indexOf(newStep as any)
        if (newIdx > activeIdx) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.set('tab', newStep)
            return next
          })
        }
      }
    },
    onError: (err: any) => {
      setActionError(err?.message || 'Approve failed')
      refetch()
    },
  })

  const updateAutoApprove = useMutation({
    mutationFn: ({ step, value }: { step: WorkflowStep; value: boolean }) => {
      const current = (data?.ticket?.autoApprove || {}) as Partial<Record<WorkflowStep, boolean>>
      return api.updateTicket(workspaceId, ticketId, { autoApprove: { ...current, [step]: value } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] })
    },
  })

  const updateTriggers = useMutation({
    mutationFn: ({ event, actionName }: { event: string; actionName: string }) => {
      const current = (data?.ticket?.triggers || {}) as Record<string, string[]>
      const currentActions = current[event] || []
      const nextActions = currentActions.includes(actionName)
        ? currentActions.filter((a) => a !== actionName)
        : [...currentActions, actionName]
      return api.updateTicket(workspaceId, ticketId, { triggers: { ...current, [event]: nextActions } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] })
    },
  })

  const updateTitle = useMutation({
    mutationFn: (title: string) => api.updateTicket(workspaceId, ticketId, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  const archive = useMutation({
    mutationFn: () => api.archiveTicket(workspaceId, ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['allTickets'] })
    },
  })

  const unarchive = useMutation({
    mutationFn: () => api.unarchiveTicket(workspaceId, ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['allTickets'] })
    },
  })

  const deleteTicket = useMutation({
    mutationFn: () => api.deleteTicket(workspaceId, ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['allTickets'] })
    },
  })


  const chat = useMutation({
    mutationFn: (message: string) =>
      api.chatTicket(workspaceId, ticketId, { step: expandedTab || activeTab, messages: [{ role: 'user', content: message }], revise: true }),
    onSuccess: (res) => {
      setChatTurns((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last) {
          last.assistant = res.content
          last.status = 'responded'
        }
        return next
      })
      refetch()
      queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['ticketThread', workspaceId, ticketId, activeTab] })
    },
    onError: (err: any) => {
      setChatTurns((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last) {
          last.status = 'failed'
          last.error = err?.message || 'Failed to revise'
        }
        return next
      })
    },
  })

  const handleSendChat = (message: string) => {
    const nextTurns: ChatTurn[] = [...chatTurns, { user: message, status: 'fetching' }]
    setChatTurns(nextTurns)
    chat.mutate(message)
  }


  const handleSetTab = useCallback((step: WorkflowStep | 'workflow') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', step)
      return next
    })
  }, [setSearchParams])

  if (isLoading || !data) {
    return <p>Loading...</p>
  }

  return (
    <>
      <TicketView
        ticket={data.ticket}
        spec={data.spec}
        plan={data.plan}
        tasks={data.tasks}
        implementation={data.implementation}
        activeTab={activeTab}
        effectiveStep={effectiveStep}
        columnStep={columnStep}
        errorMessage={(!dismissedServerError && data.ticket?.errorMessage) || actionError}
        isRunning={data?.ticket?.state === 'running' || data?.ticket?.state === 'queued'}
        isChatPending={chat.isPending}
        chatTurns={chatTurns}
        onSetTab={handleSetTab}
        onDismissError={() => {
          if (data.ticket?.errorMessage) setDismissedServerError(true)
          setActionError('')
        }}
        expandedTab={expandedTab}
        setExpandedTab={setExpandedTab}
        onApprove={() => approve.mutate()}
        onSendChat={handleSendChat}
        onRegenerate={(step) => regenerate.mutate({ step })}
        onCancelRun={() => cancelRun.mutate()}
        onUpdateTitle={(title) => updateTitle.mutate(title)}
        onArchive={() => archive.mutate()}
        onUnarchive={() => unarchive.mutate()}
        onDelete={() => deleteTicket.mutate()}
        stepAutoApprove={effectiveAutoApprove}
        onToggleStepAutoApprove={(step, value) => updateAutoApprove.mutate({ step, value })}
        onStopImplement={() => stopImplement.mutate()}
        onStartImplement={() => startImplement.mutate()}
        onRetryTask={(taskId) => retryTask.mutate(taskId)}
        onStartTaskEarly={(taskId) => startTaskEarly.mutate(taskId)}
        actionLinkages={actionLinkages?.linkages || []}
        ticketTriggers={(data?.ticket?.triggers || {}) as Record<string, string[]>}
        triggerActions={{ ...(globalConfig?.actions || {}), ...(rawConfig?.actions || {}) }}
        onToggleTicketTrigger={(event, actionName) => updateTriggers.mutate({ event, actionName })}
        workspacePath={workspace?.path}
        workspaceId={workspaceId}
        workspaceName={workspace?.name}
      />
      {blockedModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setBlockedModal({ open: false, reason: '' })}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Cannot Start Task Early</h3>
              <button
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setBlockedModal({ open: false, reason: '' })}
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-gray-700 mb-6">{blockedModal.reason}</p>
            <div className="flex justify-end">
              <button
                className="px-4 py-2 rounded text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
                onClick={() => setBlockedModal({ open: false, reason: '' })}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
