import type { WorkflowStep } from '@lemon/shared'
import { useRef, useEffect, useState, useCallback } from 'react'
import { formatStatus } from '../utils.ts'
import MarkdownSections from './MarkdownSections.tsx'

const steps: WorkflowStep[] = ['spec', 'plan', 'tasks']

function stepIndex(step: WorkflowStep) {
  return steps.indexOf(step)
}

function StatusIcon({ status, step, effectiveStep, outdated }: { status: string; step: WorkflowStep; effectiveStep: WorkflowStep; outdated?: boolean }) {
  const idx = stepIndex(step)
  const effIdx = stepIndex(effectiveStep)
  const isError = status === 'error' && step === effectiveStep
  const isPendingReview = status === 'awaiting_review' && step === effectiveStep
  const isCurrent = idx === effIdx && status !== 'done'
  const isDone = idx < effIdx || status === 'done'

  if (outdated) {
    return (
      <svg className="w-4 h-4 text-orange-900" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </svg>
    )
  }
  if (isError) {
    return (
      <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
  if (isDone) {
    return (
      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    )
  }
  if (isPendingReview) {
    return (
      <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </svg>
    )
  }
  if (isCurrent) {
    return (
      <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth={2} />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function TaskStatusIcon({ status }: { status?: string }) {
  switch (status) {
    case 'processing':
      return (
        <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )
    case 'done':
      return (
        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )
    case 'error':
      return (
        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )
    case 'cancelled':
      return (
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      )
    case 'queued':
    default:
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth={2} />
        </svg>
      )
  }
}

function TaskStatusBadge({ status }: { status?: string }) {
  const classes = "text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide font-medium"
  switch (status) {
    case 'processing':
      return <span className={`${classes} bg-indigo-100 text-indigo-800`}>Processing</span>
    case 'done':
      return <span className={`${classes} bg-green-100 text-green-800`}>Done</span>
    case 'error':
      return <span className={`${classes} bg-red-100 text-red-800`}>Error</span>
    case 'cancelled':
      return <span className={`${classes} bg-gray-200 text-gray-700`}>Cancelled</span>
    case 'queued':
    default:
      return <span className={`${classes} bg-gray-100 text-gray-600`}>Queued</span>
  }
}

function TasksPanel({ tasks, outdated }: { tasks?: any[]; outdated?: boolean }) {
  return (
    <div className={`bg-white p-4 rounded shadow ${outdated ? 'border-2 border-yellow-400' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">Tasks</h2>
        {outdated && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-medium">Outdated</span>}
      </div>
      <ul className="text-sm space-y-4">
        {tasks && tasks.length ? tasks.map((t: any, idx: number) => (
          <li key={t.id} className="group py-1">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-6 shrink-0">{idx + 1}.</span>
              <TaskStatusIcon status={t.status} />
              <span className={`flex-1 ${t.status === 'cancelled' ? 'line-through text-gray-500' : ''}`}>{t.description}</span>
              <TaskStatusBadge status={t.status} />
            </div>
            {t.result && (
              <div className="mt-2 ml-8 text-xs bg-gray-50 p-2 rounded border text-gray-700 whitespace-pre-wrap">
                {t.result}
              </div>
            )}
            {t.errorMessage && (
              <div className="mt-2 ml-8 text-xs bg-red-50 text-red-700 p-2 rounded border border-red-100">
                {t.errorMessage}
              </div>
            )}
          </li>
        )) : <li>-</li>}
      </ul>
      {outdated && (
        <div className="mt-3 text-sm text-yellow-800 bg-yellow-50 p-2 rounded">
          These tasks are outdated because an upstream artifact was edited. They will be regenerated when you continue the workflow.
        </div>
      )}
    </div>
  )
}

const markdownWrapClasses =
  'text-sm bg-gray-50 p-3 rounded min-h-[100px] [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_code]:bg-gray-200 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-gray-200 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:mb-3 [&_a]:text-indigo-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:mb-3'

function ChatPanel({ chatTurns }: { chatTurns: Array<{ user: string; assistant?: string; status: 'fetching' | 'responded' | 'failed'; error?: string }> }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const prevLengthRef = useRef(0)

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [chatTurns])

  useEffect(() => {
    if (chatTurns.length !== prevLengthRef.current) {
      setCollapsed((prev) => {
        const next = new Set(prev)
        for (let i = prevLengthRef.current; i < chatTurns.length; i++) {
          next.add(i)
        }
        return next
      })
      prevLengthRef.current = chatTurns.length
    }
  }, [chatTurns])

  return (
    <div className="hidden lg:flex flex-col h-full bg-white p-4 rounded shadow overflow-hidden">
      <h2 className="font-semibold mb-2">Chat</h2>
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50 border rounded p-3 space-y-3 min-h-0">
        {chatTurns.length === 0 && (
          <div className="text-sm text-gray-400">No messages yet</div>
        )}
        {chatTurns.map((turn, idx) => {
          const isCollapsed = collapsed.has(idx)
          const canToggle = turn.status === 'responded'
          const statusColor = turn.status === 'fetching' ? 'text-indigo-600' : turn.status === 'responded' ? 'text-green-600' : 'text-red-600'
          return (
            <div key={idx} className="space-y-1">
              <button
                onClick={() => {
                  if (!canToggle) return
                  setCollapsed((prev) => {
                    const next = new Set(prev)
                    if (next.has(idx)) next.delete(idx)
                    else next.add(idx)
                    return next
                  })
                }}
                className={`w-full text-left text-sm p-2 rounded transition-colors ${canToggle ? 'bg-indigo-100 hover:bg-indigo-200 cursor-pointer' : 'bg-indigo-100'}`}
                disabled={!canToggle}
                title={canToggle ? (isCollapsed ? 'Expand response' : 'Collapse response') : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase text-gray-500">user</span>
                  <span className={`text-xs font-medium uppercase tracking-wide ${statusColor}`}>{turn.status}</span>
                  {canToggle && (
                    <span className="text-xs text-gray-500 ml-auto">{isCollapsed ? '▸' : '▾'}</span>
                  )}
                </div>
                <div className="whitespace-pre-wrap">{turn.user}</div>
              </button>
              {turn.status === 'failed' && turn.error && (
                <div className="text-sm p-2 rounded bg-red-50 border border-red-200 text-red-700">
                  <div className="text-xs font-bold uppercase text-red-600 mb-1">Error</div>
                  <div className="whitespace-pre-wrap">{turn.error}</div>
                </div>
              )}
              {!isCollapsed && turn.status === 'responded' && turn.assistant && (
                <div className="text-sm p-2 rounded bg-white border">
                  <div className="text-xs font-bold uppercase text-gray-500 mb-1">assistant</div>
                  <div className="whitespace-pre-wrap">{turn.assistant}</div>
                </div>
              )}
              {turn.status === 'fetching' && (
                <div className="text-sm p-2 rounded bg-white border text-gray-500 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface MarkdownSectionProps {
  title: string
  content?: string
  outdated?: boolean
  step: WorkflowStep
  ticketStatus: string
  effectiveStep: WorkflowStep
  isRunning?: boolean
  isChatPending?: boolean
  onApprove?: () => void
  onSendChat?: (message: string) => void
  onExpand: () => void
  onCaptureScroll: (ratio: number) => void
  onMarkdownRef?: (el: HTMLDivElement | null) => void
}

function MarkdownSection({
  title,
  content,
  outdated,
  step,
  ticketStatus,
  effectiveStep,
  isRunning,
  isChatPending,
  onApprove,
  onSendChat,
  onExpand,
  onCaptureScroll,
  onMarkdownRef,
}: MarkdownSectionProps) {
  const [comment, setComment] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const markdownRef = useRef<HTMLDivElement>(null)
  const showApprove = ticketStatus === 'awaiting_review' && step === effectiveStep && !outdated
  const canComment = ticketStatus === 'awaiting_review' || ticketStatus === 'error'
  const isBusy = isChatPending || isRunning || !canComment

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [comment])

  const handleExpand = useCallback(() => {
    const el = markdownRef.current
    if (el && el.scrollHeight > 0) {
      onCaptureScroll(el.scrollTop / el.scrollHeight)
    } else {
      onCaptureScroll(0)
    }
    onExpand()
  }, [onCaptureScroll, onExpand])

  const setMarkdownRef = useCallback((el: HTMLDivElement | null) => {
    markdownRef.current = el
    onMarkdownRef?.(el)
  }, [onMarkdownRef])

  return (
    <div className={`bg-white p-4 rounded shadow ${outdated ? 'border-2 border-yellow-400' : ''} flex flex-col h-full`}>
      <div className="flex items-start justify-between mb-2 shrink-0 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-semibold">{title}</h2>
          {outdated && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-medium">Outdated</span>}
        </div>
        <div className="flex items-center gap-2">
          {showApprove && (
            <button
              className="px-3 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700"
              onClick={onApprove}
            >
              Approve
            </button>
          )}
          <button
            className="inline-flex items-center justify-center p-1.5 rounded bg-white/80 hover:bg-white border shadow-sm text-gray-600 hover:text-gray-900"
            onClick={handleExpand}
            aria-label="Expand"
            title="Expand"
          >
            <ExpandIcon />
          </button>
        </div>
      </div>
      <div ref={setMarkdownRef} className={`${markdownWrapClasses} flex-1 overflow-y-auto min-h-0`}>
        {content ? (
          <MarkdownSections content={content} />
        ) : (
          '-'
        )}
      </div>

      {outdated && (
        <div className="mt-3 text-sm text-yellow-800 bg-yellow-50 p-2 rounded shrink-0">
          This {title.toLowerCase()} is outdated because an upstream artifact was edited. It will be regenerated when you continue the workflow.
        </div>
      )}
      {onSendChat && !outdated && (
        <div className="mt-4 shrink-0 relative">
          <textarea
            ref={textareaRef}
            rows={1}
            className={`w-full border bg-gray-100 text-gray-900 placeholder-gray-500 px-3 py-2 rounded text-sm disabled:opacity-60 resize-none overflow-hidden transition-colors ${
              isChatPending ? 'border-indigo-400 pr-10 animate-pulse' : 'border-gray-300'
            }`}
            placeholder={isChatPending ? 'Revising...' : !canComment ? 'Processing...' : `Comment on how to revise this ${title.toLowerCase()}...`}
            value={comment}
            disabled={isBusy}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && comment.trim() && !isBusy) {
                e.preventDefault()
                onSendChat(comment.trim())
                setComment('')
              }
            }}
          />
          {isChatPending && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export interface TicketViewProps {
  ticket: any
  spec?: any
  plan?: any
  tasks?: any[]
  implementation?: any
  activeTab: WorkflowStep
  effectiveStep: WorkflowStep
  errorMessage?: string
  isRunning?: boolean
  isChatPending?: boolean
  chatTurns: Array<{ user: string; assistant?: string; status: 'fetching' | 'responded' | 'failed'; error?: string }>
  onRun: () => void
  onSetTab: (step: WorkflowStep) => void
  onDismissError?: () => void
  expandedTab: WorkflowStep | null
  setExpandedTab: (step: WorkflowStep | null) => void
  onApprove?: () => void
  onSendChat?: (message: string) => void
  onUpdateTitle?: (title: string) => void
}

export default function TicketView({
  ticket,
  spec,
  plan,
  tasks,
  implementation: _implementation,
  activeTab,
  effectiveStep,
  errorMessage,
  isRunning: _isRunning,
  isChatPending,
  chatTurns,
  onRun: _onRun,
  onSetTab,
  onDismissError,
  expandedTab,
  setExpandedTab,
  onApprove,
  onSendChat,
  onUpdateTitle,
}: TicketViewProps) {
  const showApprovalActions = ticket.status === 'awaiting_review' && expandedTab === effectiveStep
  const showRunButton = !_isRunning && ticket.status !== 'done' && ticket.status !== 'awaiting_review'
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(ticket.title)

  useEffect(() => {
    setEditedTitle(ticket.title)
  }, [ticket.title])

  const expandedPanelRef = useRef<HTMLDivElement>(null)
  const markdownEls = useRef<Partial<Record<WorkflowStep, HTMLDivElement | null>>>({})
  const [savedScrollRatio, setSavedScrollRatio] = useState(0)
  const [expandedComment, setExpandedComment] = useState('')
  const expandedTextareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = expandedTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [expandedComment])

  useEffect(() => {
    if (expandedTab && expandedPanelRef.current) {
      const el = expandedPanelRef.current
      requestAnimationFrame(() => {
        el.scrollTop = savedScrollRatio * el.scrollHeight
      })
    }
  }, [expandedTab, savedScrollRatio])

  useEffect(() => {
    if (!expandedTab) {
      requestAnimationFrame(() => {
        const md = markdownEls.current[activeTab]
        if (md && md.scrollHeight > 0) {
          md.scrollTop = savedScrollRatio * md.scrollHeight
        }
      })
    }
  }, [expandedTab, activeTab, savedScrollRatio])

  const handleCloseExpanded = useCallback(() => {
    const el = expandedPanelRef.current
    if (el && el.scrollHeight > 0) {
      setSavedScrollRatio(el.scrollTop / el.scrollHeight)
    } else {
      setSavedScrollRatio(0)
    }
    setExpandedTab(null)
  }, [setExpandedTab])

  const setSpecRef = useCallback((el: HTMLDivElement | null) => { markdownEls.current.spec = el }, [])
  const setPlanRef = useCallback((el: HTMLDivElement | null) => { markdownEls.current.plan = el }, [])

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            {isEditingTitle ? (
              <input
                className="text-2xl font-bold border-b-2 border-indigo-600 bg-transparent outline-none min-w-[200px]"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={() => {
                  setIsEditingTitle(false)
                  if (editedTitle.trim() && editedTitle.trim() !== ticket.title) {
                    onUpdateTitle?.(editedTitle.trim())
                  } else {
                    setEditedTitle(ticket.title)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditingTitle(false)
                    if (editedTitle.trim() && editedTitle.trim() !== ticket.title) {
                      onUpdateTitle?.(editedTitle.trim())
                    } else {
                      setEditedTitle(ticket.title)
                    }
                  } else if (e.key === 'Escape') {
                    setIsEditingTitle(false)
                    setEditedTitle(ticket.title)
                  }
                }}
                autoFocus
              />
            ) : (
              <h1
                className="text-2xl font-bold cursor-text hover:text-indigo-600"
                onClick={() => setIsEditingTitle(true)}
                title="Click to edit"
              >
                {ticket.title}
              </h1>
            )}
            <span className="text-xs text-gray-400">ticket</span>
          </div>
          {ticket.description && (
            <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{ticket.description}</div>
          )}
          <div className="text-sm text-gray-500 uppercase tracking-wide mt-1">{formatStatus(ticket.status)}</div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {showRunButton && (
            <button
              className="bg-indigo-600 text-white px-3 py-2 rounded text-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              onClick={_onRun}
              disabled={_isRunning}
            >
              {_isRunning && (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {_isRunning ? 'Running...' : 'Run'}
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2 max-h-16 overflow-y-auto flex items-start gap-2">
          <pre className="whitespace-pre-wrap font-sans flex-1">{errorMessage}</pre>
          {onDismissError && (
            <button
              className="text-red-600 hover:text-red-800 font-medium leading-none"
              onClick={onDismissError}
              aria-label="Dismiss error"
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className="flex border-b border-gray-200 mb-4">
        {steps.map((step) => (
          <button
            key={step}
            onClick={() => onSetTab(step)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium capitalize ${
              activeTab === step
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <StatusIcon
              status={ticket.status}
              step={step}
              effectiveStep={effectiveStep}
              outdated={step === 'plan' ? plan?.outdated : step === 'tasks' ? tasks?.some((t) => t.outdated) : false}
            />
            {step}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
          <div className="lg:col-span-2 overflow-y-auto h-full">
            {activeTab === 'spec' && (
              <MarkdownSection
                title="Spec"
                content={spec?.content}
                step="spec"
                ticketStatus={ticket.status}
                effectiveStep={effectiveStep}
                isRunning={_isRunning}
                isChatPending={isChatPending}
                onApprove={onApprove}
                onSendChat={onSendChat}
                onExpand={() => setExpandedTab('spec')}
                onCaptureScroll={setSavedScrollRatio}
                onMarkdownRef={setSpecRef}
              />
            )}
            {activeTab === 'plan' && (
              <MarkdownSection
                title="Plan"
                content={plan?.content}
                outdated={plan?.outdated}
                step="plan"
                ticketStatus={ticket.status}
                effectiveStep={effectiveStep}
                isRunning={_isRunning}
                isChatPending={isChatPending}
                onApprove={onApprove}
                onSendChat={onSendChat}
                onExpand={() => setExpandedTab('plan')}
                onCaptureScroll={setSavedScrollRatio}
                onMarkdownRef={setPlanRef}
              />
            )}
            {activeTab === 'tasks' && (
              <TasksPanel tasks={tasks} outdated={tasks?.some((t) => t.outdated)} />
            )}
          </div>
          <ChatPanel chatTurns={chatTurns} />
        </div>
      </div>

      {expandedTab && (
        <div className="fixed inset-0 z-[60] bg-white flex flex-col">
          <button
            className="absolute top-3 right-3 p-2 rounded hover:bg-gray-100 text-gray-600 z-10"
            onClick={handleCloseExpanded}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
          <div className="flex-1 overflow-y-auto p-6 pt-12" ref={expandedPanelRef}>
            <div className="max-w-5xl mx-auto">
              {(expandedTab === 'plan' && plan?.outdated) || (expandedTab === 'tasks' && tasks?.some((t) => t.outdated)) ? (
                <div className="mb-4 text-sm text-yellow-800 bg-yellow-50 p-2 rounded">
                  This {expandedTab} is outdated because an upstream artifact was edited. It will be regenerated when you continue the workflow.
                </div>
              ) : null}
              {(() => {
                const expandedContent = (() => {
                  switch (expandedTab) {
                    case 'spec':
                      return spec?.content || '-'
                    case 'plan':
                      return plan?.content || '-'
                    default:
                      return '-'
                  }
                })()
                return (
                  <div className={markdownWrapClasses + ' min-h-0'}>
                    {expandedContent !== '-' ? (
                      <MarkdownSections content={expandedContent} />
                    ) : (
                      '-'
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
          {onSendChat && expandedTab !== 'tasks' && !(expandedTab === 'plan' && plan?.outdated) && (
            <div className="shrink-0 p-6 border-t bg-white">
              <div className="max-w-5xl mx-auto flex items-center gap-3">
                <div className="flex-1 relative">
                  <textarea
                    ref={expandedTextareaRef}
                    rows={1}
                    className={`w-full border bg-gray-100 text-gray-900 placeholder-gray-500 px-3 py-2 rounded text-sm disabled:opacity-60 resize-none overflow-hidden transition-colors ${
                      isChatPending ? 'border-indigo-400 pr-10 animate-pulse' : 'border-gray-300'
                    }`}
                    placeholder={
                      isChatPending
                        ? 'Revising...'
                        : !(ticket.status === 'awaiting_review' || ticket.status === 'error')
                        ? 'Processing...'
                        : `Comment on how to revise this ${expandedTab}...`
                    }
                    value={expandedComment}
                    disabled={isChatPending || _isRunning || !(ticket.status === 'awaiting_review' || ticket.status === 'error')}
                    onChange={(e) => setExpandedComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        !e.shiftKey &&
                        expandedComment.trim() &&
                        !isChatPending &&
                        !_isRunning &&
                        (ticket.status === 'awaiting_review' || ticket.status === 'error')
                      ) {
                        e.preventDefault()
                        onSendChat(expandedComment.trim())
                        setExpandedComment('')
                      }
                    }}
                  />
                  {isChatPending && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                    </div>
                  )}
                </div>
                {showApprovalActions && (
                  <button
                    className="px-4 py-2 rounded-full text-sm font-medium bg-green-600 text-white hover:bg-green-700 shadow shrink-0"
                    onClick={() => {
                      onApprove?.()
                      handleCloseExpanded()
                    }}
                  >
                    Approve
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
