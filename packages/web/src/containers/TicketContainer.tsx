import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.ts'
import { useEffect, useState, useMemo } from 'react'
import type { WorkflowStep } from '@lemon/shared'
import TicketView from '../components/TicketView.tsx'

const steps: WorkflowStep[] = ['spec', 'plan', 'tasks']
const allSteps: WorkflowStep[] = ['spec', 'plan', 'tasks', 'implement', 'done']

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
  const [activeTab, setActiveTab] = useState<WorkflowStep | null>(null)
  const [expandedTab, setExpandedTab] = useState<WorkflowStep | null>(null)
  const [actionError, setActionError] = useState<string>('')

  type ChatTurn = { user: string; assistant?: string; status: 'fetching' | 'responded' | 'failed'; error?: string }
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([])

  useEffect(() => {
    if (activeTab === null && !isLoading && data) {
      const param = searchParams.get('tab')
      if (param && steps.includes(param as WorkflowStep)) {
        setActiveTab(param as WorkflowStep)
      } else {
        setActiveTab(effectiveStep)
      }
    }
  }, [activeTab, isLoading, data, searchParams, effectiveStep])

  // Load persisted thread when tab changes
  useEffect(() => {
    if (!activeTab || !workspaceId || !ticketId) return
    api.getTicketThread(workspaceId, ticketId, activeTab)
      .then((res) => {
        const turns: ChatTurn[] = []
        for (let i = 0; i < res.thread.length; i++) {
          const m = res.thread[i]
          if (m.role === 'user') {
            const next = res.thread[i + 1]
            turns.push({
              user: m.content,
              assistant: next?.role === 'assistant' ? next.content : undefined,
              status: next?.role === 'assistant' ? 'responded' : 'fetching',
            })
            if (next?.role === 'assistant') i++
          }
        }
        setChatTurns(turns)
      })
      .catch(() => {
        setChatTurns([])
      })
  }, [workspaceId, ticketId, activeTab])

  const run = useMutation({
    mutationFn: () => api.runTicket(workspaceId, ticketId),
    onSuccess: () => {
      setActionError('')
      setTimeout(() => {
        refetch()
        queryClient.invalidateQueries({ queryKey: ['tickets'] })
      }, 1000)
    },
    onError: (err: any) => {
      setActionError(err?.message || 'Run failed')
      refetch()
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

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

  const approve = useMutation({
    mutationFn: () => api.approveTicket(workspaceId, ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
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
      api.chatTicket(workspaceId, ticketId, { step: activeTab ?? 'spec', messages: [{ role: 'user', content: message }], revise: true }),
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


  const handleSetTab = (step: WorkflowStep) => {
    setActiveTab(step)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', step)
      return next
    })
  }

  const stepAutoApprove = useMemo(() => {
    const result: Partial<Record<WorkflowStep, boolean>> = {}
    for (const step of allSteps) {
      const ticketOverride = data?.ticket?.autoApprove?.[step]
      if (ticketOverride !== undefined) {
        result[step] = ticketOverride
      } else {
        const workspaceOverride = rawConfig?.autoApprove?.[step]
        if (workspaceOverride !== undefined) {
          result[step] = workspaceOverride
        } else {
          result[step] = globalConfig?.autoApprove?.[step] ?? false
        }
      }
    }
    return result as Record<WorkflowStep, boolean>
  }, [data, rawConfig, globalConfig])

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
      activeTab={activeTab ?? effectiveStep}
      effectiveStep={effectiveStep}
      errorMessage={data.ticket?.errorMessage || actionError}
      isRunning={run.isPending}
      isChatPending={chat.isPending}
      chatTurns={chatTurns}
      onRun={() => run.mutate()}
      onSetTab={handleSetTab}
      onDismissError={() => setActionError('')}
      expandedTab={expandedTab}
      setExpandedTab={setExpandedTab}
      onApprove={() => approve.mutate()}
      onSendChat={handleSendChat}
      onRegenerate={(step) => regenerate.mutate({ step })}
      onUpdateTitle={(title) => updateTitle.mutate(title)}
      onArchive={() => archive.mutate()}
      onUnarchive={() => unarchive.mutate()}
      onDelete={() => deleteTicket.mutate()}
      stepAutoApprove={stepAutoApprove}
      onToggleStepAutoApprove={(step, value) => updateAutoApprove.mutate({ step, value })}
    />
  )
}
