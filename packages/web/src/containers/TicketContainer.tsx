import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.ts'
import { useEffect, useState } from 'react'
import type { WorkflowStep } from '@lemon/shared'
import TicketView from '../components/TicketView.tsx'

const steps: WorkflowStep[] = ['spec', 'plan', 'tasks']

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

  const approve = useMutation({
    mutationFn: () => api.approveTicket(workspaceId, ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  const updateTitle = useMutation({
    mutationFn: (title: string) => api.updateTicket(workspaceId, ticketId, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
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
      onUpdateTitle={(title) => updateTitle.mutate(title)}
    />
  )
}
