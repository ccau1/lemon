import type { WorkflowStep } from '@lemon/shared'
import { integrationEvents } from '@lemon/shared'
import { useRef, useEffect, useState, useCallback } from 'react'
import { formatStatus } from '../utils.ts'
import MarkdownSections from './MarkdownSections.tsx'
import PillToggle from './common/PillToggle.tsx'
import { StatusIcon, CloseIcon } from './ticket/StatusIcon.tsx'
import { TicketActionsMenu } from './ticket/TicketActionsMenu.tsx'
import { TasksPanel } from './ticket/TasksPanel.tsx'
import { ChatPanel } from './ticket/ChatPanel.tsx'
import { markdownWrapClasses, MarkdownSection } from './ticket/MarkdownSection.tsx'

const viewTabs: Array<WorkflowStep | 'workflow'> = ['spec', 'plan', 'tasks']

export interface TicketViewProps {
  ticket: any
  spec?: any
  plan?: any
  tasks?: any[]
  implementation?: any
  activeTab: WorkflowStep | 'workflow'
  effectiveStep: WorkflowStep
  errorMessage?: string
  isRunning?: boolean
  isChatPending?: boolean
  chatTurns: Array<{ user: string; assistant?: string; status: 'fetching' | 'responded' | 'failed'; error?: string }>
  onSetTab: (step: WorkflowStep | 'workflow') => void
  onDismissError?: () => void
  expandedTab: WorkflowStep | null
  setExpandedTab: (step: WorkflowStep | null) => void
  onApprove?: () => void
  onSendChat?: (message: string) => void
  onRegenerate?: (step: WorkflowStep) => void
  onCancelRun?: () => void
  onUpdateTitle?: (title: string) => void
  onArchive?: () => void
  onUnarchive?: () => void
  onDelete?: () => void
  stepAutoApprove?: Record<WorkflowStep, boolean>
  onToggleStepAutoApprove?: (step: WorkflowStep, value: boolean) => void
  actionLinkages?: Array<any>
  ticketTriggers?: Record<string, string[]>
  triggerActions?: Record<string, any>
  onToggleTicketTrigger?: (event: string, actionName: string) => void
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
  onSetTab,
  onDismissError,
  expandedTab,
  setExpandedTab,
  onApprove,
  onSendChat,
  onRegenerate,
  onCancelRun,
  onUpdateTitle,
  onArchive,
  onUnarchive,
  onDelete,
  stepAutoApprove,
  onToggleStepAutoApprove,
  actionLinkages,
  ticketTriggers,
  triggerActions,
  onToggleTicketTrigger,
}: TicketViewProps) {
  const isArchived = !!ticket.archivedAt
  const isLocked = ticket.status === 'implement' || ticket.status === 'done'
  const showApprovalActions = ticket.status === 'awaiting_review' && expandedTab === effectiveStep && !isArchived
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(ticket.title)
  const [chatOpen, setChatOpen] = useState(true)
  const [closing, setClosing] = useState(false)
  const [floatOpacity, setFloatOpacity] = useState(0)

  useEffect(() => {
    if (!chatOpen && !closing) {
      requestAnimationFrame(() => setFloatOpacity(1))
    } else {
      setFloatOpacity(0)
    }
  }, [chatOpen, closing])

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
    if (!expandedTab && activeTab !== 'workflow') {
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
                className={`text-2xl font-bold ${isArchived ? '' : 'cursor-text hover:text-indigo-600'}`}
                onClick={() => { if (!isArchived) setIsEditingTitle(true) }}
                title={isArchived ? '' : 'Click to edit'}
              >
                {ticket.title}
              </h1>
            )}
            <span className="text-xs text-gray-400">ticket</span>
            {ticket.externalSource && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase tracking-wide">
                {ticket.externalSource}
              </span>
            )}
          </div>
          {ticket.description && (
            <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{ticket.description}</div>
          )}
          <div className="text-sm text-gray-500 uppercase tracking-wide mt-1">{formatStatus(ticket.status)}</div>
          {isArchived && <div className="text-xs text-gray-400 mt-1">Archived</div>}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {(isArchived || !isLocked) && (
            <TicketActionsMenu
              isArchived={isArchived}
              onArchive={onArchive}
              onUnarchive={onUnarchive}
              onDelete={onDelete}
            />
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
        {viewTabs.map((step) => (
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
              isRunning={_isRunning}
              tasks={step === 'tasks' ? tasks : undefined}
            />
            {step}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 relative">
        <div className="flex h-full overflow-hidden">
          <div className={`h-full flex-1 min-w-0 ${chatOpen ? 'pr-3' : 'pr-0'} overflow-hidden`}>
            <div className="h-full overflow-y-auto min-w-0 scrollbar-hide">
            {activeTab === 'spec' && (
              <MarkdownSection
                title="Spec"
                content={spec?.content}
                step="spec"
                ticketStatus={ticket.status}
                effectiveStep={effectiveStep}
                isRunning={_isRunning}
                isChatPending={isChatPending}
                isArchived={isArchived}
                onApprove={onApprove}
                onSendChat={onSendChat}
                onRegenerate={onRegenerate}
                onCancelRun={onCancelRun}
                autoApprove={stepAutoApprove?.spec}
                onToggleAutoApprove={(v) => onToggleStepAutoApprove?.('spec', v)}
                onExpand={() => setExpandedTab('spec')}
                onCaptureScroll={setSavedScrollRatio}
                onMarkdownRef={setSpecRef}
                chatTurns={chatTurns}
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
                isArchived={isArchived}
                onApprove={onApprove}
                onSendChat={onSendChat}
                onRegenerate={onRegenerate}
                onCancelRun={onCancelRun}
                autoApprove={stepAutoApprove?.plan}
                onToggleAutoApprove={(v) => onToggleStepAutoApprove?.('plan', v)}
                onExpand={() => setExpandedTab('plan')}
                onCaptureScroll={setSavedScrollRatio}
                onMarkdownRef={setPlanRef}
                chatTurns={chatTurns}
              />
            )}
            {activeTab === 'tasks' && (
              <TasksPanel
                tasks={tasks}
                outdated={tasks?.some((t) => t.outdated)}
                autoApprove={stepAutoApprove?.tasks}
                onToggleAutoApprove={(v) => onToggleStepAutoApprove?.('tasks', v)}
                ticketStatus={ticket.status}
                effectiveStep={effectiveStep}
                isArchived={isArchived}
                onApprove={onApprove}
              />
            )}
            {activeTab === 'workflow' && (
              <div className="bg-white p-4 rounded space-y-6">
                <div>
                  <h2 className="font-semibold mb-2">Event Triggers</h2>
                  <p className="text-xs text-gray-500 mb-3">Override workspace/global action triggers for this ticket.</p>
                  <div className="space-y-3 max-h-[24rem] overflow-y-auto pr-1">
                    {integrationEvents
                      .filter((e) => e.startsWith('preRun') || e.startsWith('postRun') || e.startsWith('preApprove') || e.startsWith('postApprove'))
                      .map((event) => (
                        <div key={event} className="border rounded-lg p-3">
                          <div className="text-sm font-medium text-gray-800 mb-2">{event}</div>
                          <div className="flex flex-wrap gap-2">
                            {Object.keys(triggerActions || {}).length === 0 && (
                              <span className="text-xs text-gray-400">No actions defined. Create actions in Settings.</span>
                            )}
                            {Object.keys(triggerActions || {}).map((actionName) => {
                              const selected = (ticketTriggers?.[event] || []).includes(actionName)
                              return (
                                <button
                                  key={actionName}
                                  type="button"
                                  onClick={() => onToggleTicketTrigger?.(event, actionName)}
                                  className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                                    selected
                                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  {actionName}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                <div>
                  <h2 className="font-semibold mb-2">Linked Action Runs</h2>
                  {actionLinkages && actionLinkages.length > 0 ? (
                    <div className="space-y-2">
                      {actionLinkages.map((l: any) => (
                        <div key={l.id} className="flex items-center justify-between border rounded p-2 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-500">{l.event}</span>
                            <span className="text-gray-800">{l.actionRun?.actionName}</span>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            l.status === 'done' ? 'bg-green-100 text-green-800' :
                            l.status === 'error' ? 'bg-red-100 text-red-800' :
                            'bg-indigo-100 text-indigo-800'
                          }`}>
                            {l.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No linked action runs.</p>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>
          <div className={`hidden lg:flex flex-col items-center relative shrink-0 transition-all duration-300 ease-in-out ${chatOpen ? 'w-6 opacity-100' : 'w-0 opacity-0'}`}>
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-gray-200" />
            <div className="group relative h-full">
              <button
                type="button"
                onClick={() => { setClosing(true); setChatOpen(false); setTimeout(() => setClosing(false), 300) }}
                className="absolute z-10 top-[30%] left-1/2 -translate-y-1/2 -translate-x-1/2 p-1.5 rounded-full border border-gray-300 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50 shadow-sm"
                aria-label="Hide chat"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                Close chat history
              </div>
            </div>
          </div>
          <div className={`hidden lg:block shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${chatOpen ? 'w-1/3 opacity-100' : 'w-0 opacity-0'}`}>
            <ChatPanel chatTurns={chatTurns} />
          </div>
        </div>
        {!chatOpen && !closing && (
          <div className="hidden lg:block group absolute z-10 top-[30%] right-0 -translate-y-1/2 translate-x-1/2 transition-opacity duration-200" style={{ opacity: floatOpacity }}>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="p-1.5 rounded-full border border-gray-300 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50 shadow-sm"
              aria-label="Show chat"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
              Open chat history
            </div>
          </div>
        )}
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
                      return spec?.content || null
                    case 'plan':
                      return plan?.content || null
                    default:
                      return null
                  }
                })()
                const expandedQuestion = chatTurns
                  ?.slice()
                  .reverse()
                  .find((t) => t.assistant?.startsWith('QUESTION:'))
                  ?.assistant
                  ?.slice('QUESTION:'.length)
                  .trim()
                return (
                  <div className={markdownWrapClasses + ' min-h-0'}>
                    {expandedContent ? (
                      <MarkdownSections content={expandedContent} />
                    ) : expandedQuestion ? (
                      <div className="flex flex-col items-center justify-center h-full text-center p-8">
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6 max-w-lg w-full">
                          <h3 className="text-indigo-900 font-medium mb-2">The AI needs clarification</h3>
                          <p className="text-indigo-800 whitespace-pre-wrap">{expandedQuestion}</p>
                        </div>
                      </div>
                    ) : (
                      '-'
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
          {onSendChat && expandedTab !== 'tasks' && !(expandedTab === 'plan' && plan?.outdated) && !isArchived && (
            <div className="shrink-0 p-6 border-t bg-white">
              <div className="max-w-5xl mx-auto flex items-center gap-3">
                <div className="flex-1 relative">
                  <textarea
                    ref={expandedTextareaRef}
                    rows={1}
                    className={`w-full border bg-white text-gray-900 placeholder-gray-400 px-3 py-2 rounded text-sm disabled:opacity-60 resize-none overflow-hidden transition-colors ${
                      isChatPending ? 'border-indigo-400 pr-10 animate-pulse' : 'border-gray-400'
                    }`}
                    placeholder={(() => {
                      if (isChatPending) return 'Revising...'
                      if (isArchived) return 'Archived'
                      if (!(ticket.status === 'awaiting_review' || ticket.status === 'error')) return 'Processing...'
                      const expandedQuestion = chatTurns
                        ?.slice()
                        .reverse()
                        .find((t) => t.assistant?.startsWith('QUESTION:'))
                        ?.assistant
                        ?.slice('QUESTION:'.length)
                        .trim()
                      const hasExpandedContent = expandedTab === 'spec' ? spec?.content : expandedTab === 'plan' ? plan?.content : false
                      if (!hasExpandedContent && expandedQuestion) return "Answer the AI's question..."
                      return `Comment on how to revise this ${expandedTab}...`
                    })()}
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
                {expandedTab && onToggleStepAutoApprove && !showApprovalActions && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-gray-500">Auto-approve</span>
                    <PillToggle value={stepAutoApprove?.[expandedTab] ?? false} onChange={(v) => onToggleStepAutoApprove(expandedTab, v)} />
                  </div>
                )}
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
