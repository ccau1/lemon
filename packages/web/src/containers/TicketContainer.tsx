import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.ts'
import { useEffect, useState, useMemo, useCallback } from 'react'
import type { WorkflowStep } from '@lemon/shared'
import TicketView from '../components/TicketView.tsx'

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
    queryFn: () => api.getTicketDetails(workspaceId, ticketId),
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

  const effectiveStep = (!isLoading && data?.ticket?.effectiveStep) || 'spec'
  const paramTab = searchParams.get('tab')
  const activeTab: WorkflowStep | 'workflow' = useMemo(() => {
    if (paramTab && viewTabs.includes(paramTab as any)) return paramTab as WorkflowStep | 'workflow'
    return effectiveStep
  }, [paramTab, effectiveStep])
  const [expandedTab, setExpandedTab] = useState<WorkflowStep | null>(null)
  const [actionError, setActionError] = useState<string>('')
  const [dismissedServerError, setDismissedServerError] = useState(false)

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
      api.chatTicket(workspaceId, ticketId, { step: activeTab, messages: [{ role: 'user', content: message }], revise: true }),
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
    <TicketView
      ticket={data.ticket}
      spec={data.spec}
      plan={data.plan}
      tasks={data.tasks}
      implementation={data.implementation}
      activeTab={activeTab}
      effectiveStep={effectiveStep}
      errorMessage={(!dismissedServerError && data.ticket?.errorMessage) || actionError}
      isRunning={data?.ticket?.status === 'running' || data?.ticket?.status === 'queued'}
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
      stepAutoApprove={(data.ticket?.autoApprove || {}) as Record<WorkflowStep, boolean>}
      onToggleStepAutoApprove={(step, value) => updateAutoApprove.mutate({ step, value })}
      actionLinkages={actionLinkages?.linkages || []}
      ticketTriggers={(data?.ticket?.triggers || {}) as Record<string, string[]>}
      triggerActions={{ ...(globalConfig?.actions || {}), ...(rawConfig?.actions || {}) }}
      onToggleTicketTrigger={(event, actionName) => updateTriggers.mutate({ event, actionName })}
    />
  )
}
