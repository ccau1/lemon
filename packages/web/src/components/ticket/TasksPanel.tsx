import { useState } from 'react'
import type { WorkflowStep } from '@lemon/shared'
import PillToggle from '../common/PillToggle.tsx'
import { TaskStatusIcon, TaskStatusBadge } from './StatusIcon.tsx'
import { Tooltip } from '../Tooltip.tsx'

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

export function TasksPanel({ tasks, outdated, autoApprove, onToggleAutoApprove, ticketState, effectiveStep, isArchived, onApprove, onStopImplement, onStartImplement, onRetryTask, onStartTaskEarly, isRunning }: { tasks?: any[]; outdated?: boolean; autoApprove?: boolean; onToggleAutoApprove?: (value: boolean) => void; ticketState?: string; effectiveStep?: WorkflowStep; isArchived?: boolean; onApprove?: () => void; onStopImplement?: () => void; onStartImplement?: () => void; onRetryTask?: (taskId: string) => void; onStartTaskEarly?: (taskId: string) => void; isRunning?: boolean }) {
  const hasActiveTasks = tasks && tasks.some((t) => t.status === 'processing' || t.status === 'queued')
  const hasProcessingTasks = tasks && tasks.some((t) => t.status === 'processing')
  const hasErrorTasks = tasks && tasks.some((t) => t.status === 'error')
  const isCurrentStep = effectiveStep === 'tasks'
  const showApprove = ticketState === 'awaiting_review' && isCurrentStep && !outdated && !isArchived && !hasErrorTasks
  const showStop = isCurrentStep && isRunning
  const hasIncompleteTasks = tasks && tasks.some((t) => t.status !== 'done')
  const showStart = isCurrentStep && !isRunning && !hasProcessingTasks && !showApprove && hasIncompleteTasks
  const showContinue = !isRunning && isCurrentStep && !showApprove && ticketState === 'error' && hasActiveTasks
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className={`bg-white p-4 rounded ${outdated ? 'border-2 border-yellow-400' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">Tasks</h2>
        <div className="flex items-center gap-2">
          {onToggleAutoApprove && !showApprove && isCurrentStep && !outdated && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Auto-approve</span>
              <PillToggle value={autoApprove ?? false} onChange={onToggleAutoApprove} />
              {showContinue && (
                <button
                  className="ml-1 px-2 py-1 rounded text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700"
                  onClick={onStartImplement}
                >
                  Continue Implement
                </button>
              )}
            </div>
          )}
          {showApprove && (
            <button
              className="px-3 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700"
              onClick={onApprove}
            >
              Approve
            </button>
          )}
          {showStop && (
            <button
              className="px-3 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700"
              onClick={onStopImplement}
            >
              Stop all implementations
            </button>
          )}
          {showStart && (
            <button
              className="px-3 py-1 rounded text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={onStartImplement}
            >
              Start Implementation
            </button>
          )}
          {outdated && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-medium">Outdated</span>}
        </div>
      </div>
      <ul className="text-sm space-y-4">
        {tasks && tasks.length ? tasks.map((t: any, idx: number) => {
          const hasResponse = !!t.result || !!t.errorMessage || !!t.thoughts
          const isExpanded = expandedIds.has(t.id)
          return (
            <li key={t.id} className="group py-1">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 w-6 shrink-0">{idx + 1}.</span>
                <TaskStatusIcon status={t.status} />
                <span className={`flex-1 ${t.status === 'cancelled' ? 'line-through text-gray-500' : ''}`}>{t.description}</span>
                {hasResponse && (
                  <button
                    onClick={() => toggleExpand(t.id)}
                    className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
                    aria-label={isExpanded ? 'Collapse response' : 'Expand response'}
                  >
                    {isExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                  </button>
                )}
                {t.status === 'error' && onRetryTask && isCurrentStep && !outdated && (
                  <button
                    className="px-2 py-0.5 rounded text-xs font-medium bg-orange-600 text-white hover:bg-orange-700"
                    onClick={() => onRetryTask(t.id)}
                  >
                    Retry
                  </button>
                )}
                {t.status === 'queued' && onStartTaskEarly && isCurrentStep && !outdated && (
                  <Tooltip label="Start early — run in parallel">
                    <button
                      className="p-1 rounded text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                      onClick={() => onStartTaskEarly(t.id)}
                      aria-label="Start early"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </Tooltip>
                )}
                <TaskStatusBadge status={t.status} />
              </div>
              {isExpanded && t.result && (
                <div className="mt-2 ml-8 text-xs bg-gray-50 p-2 rounded border text-gray-700 whitespace-pre-wrap">
                  {t.result}
                </div>
              )}
              {isExpanded && t.errorMessage && (
                <div className="mt-2 ml-8 text-xs bg-red-50 text-red-700 p-2 rounded border border-red-100">
                  {t.errorMessage}
                </div>
              )}
              {t.status === 'processing' && t.thoughts && (
                <div className="mt-2 ml-8 text-xs bg-indigo-50 p-2 rounded border border-indigo-100 text-indigo-900 whitespace-pre-wrap">
                  <div className="flex items-center gap-1.5 mb-1 text-indigo-600 font-medium">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                    </span>
                    Thinking...
                  </div>
                  {t.thoughts}
                </div>
              )}
            </li>
          )
        }) : <li>-</li>}
      </ul>
      {outdated && (
        <div className="mt-3 text-sm text-yellow-800 bg-yellow-50 p-2 rounded">
          These tasks are outdated because an upstream artifact was edited. They will be regenerated when you continue the workflow.
        </div>
      )}
    </div>
  )
}
