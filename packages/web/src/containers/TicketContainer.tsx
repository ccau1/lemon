import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.ts'
import { useEffect, useState } from 'react'
import type { WorkflowStep } from '@lemon/shared'
import TicketView from '../components/TicketView.tsx'

const steps: WorkflowStep[] = ['spec', 'plan', 'tasks', 'implement']

function getEffectiveStep(status: string, data: any): WorkflowStep {
  if (steps.includes(status as WorkflowStep)) {
    return status as WorkflowStep
  }
  if (status === 'done') return 'implement'
  if (data.implementation?.content) return 'implement'
  if (data.tasks?.length) return 'tasks'
  if (data.plan?.content) return 'plan'
  if (data.spec?.content) return 'spec'
  return 'spec'
}

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

  const effectiveStep = !isLoading && data ? getEffectiveStep(data.ticket.status, data) : 'spec'
  const [activeTab, setActiveTab] = useState<WorkflowStep | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; content: string }>>([])
  const [lastResponse, setLastResponse] = useState('')

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

  const advance = useMutation({
    mutationFn: () => api.advanceTicket(workspaceId, ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  const queue = useMutation({
    mutationFn: () => api.queueTicket(workspaceId, ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  const run = useMutation({
    mutationFn: () => api.runTicket(workspaceId, ticketId),
    onSuccess: () => {
      setTimeout(() => {
        refetch()
        queryClient.invalidateQueries({ queryKey: ['tickets'] })
      }, 1000)
    },
  })

  const chat = useMutation({
    mutationFn: (messages: any[]) =>
      api.chatTicket(workspaceId, ticketId, { step: activeTab ?? 'spec', messages }),
    onSuccess: (res) => {
      setLastResponse(res.content)
      setChatHistory((prev) => [...prev, { role: 'assistant', content: res.content }])
    },
  })

  const saveSpec = useMutation({
    mutationFn: (content: string) => api.saveSpec(workspaceId, ticketId, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] }),
  })

  const savePlan = useMutation({
    mutationFn: (content: string) => api.savePlan(workspaceId, ticketId, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticketDetails', workspaceId, ticketId] }),
  })

  const handleChat = () => {
    if (!chatInput.trim()) return
    const next = [...chatHistory, { role: 'user', content: chatInput }]
    setChatHistory(next)
    chat.mutate(next)
    setChatInput('')
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
      chatOpen={chatOpen}
      setChatOpen={setChatOpen}
      chatInput={chatInput}
      setChatInput={setChatInput}
      chatHistory={chatHistory}
      lastResponse={lastResponse}
      onChat={handleChat}
      onAdvance={() => advance.mutate()}
      onQueue={() => queue.mutate()}
      onRun={() => run.mutate()}
      onSaveSpec={(content) => saveSpec.mutate(content)}
      onSavePlan={(content) => savePlan.mutate(content)}
      onSetTab={handleSetTab}
    />
  )
}
