import type { WorkflowStep } from '@lemon/shared'
import PillToggle from '../common/PillToggle.tsx'
import { TaskStatusIcon, TaskStatusBadge } from './StatusIcon.tsx'

export function TasksPanel({ tasks, outdated, autoApprove, onToggleAutoApprove, ticketStatus, effectiveStep, isArchived, onApprove }: { tasks?: any[]; outdated?: boolean; autoApprove?: boolean; onToggleAutoApprove?: (value: boolean) => void; ticketStatus?: string; effectiveStep?: WorkflowStep; isArchived?: boolean; onApprove?: () => void }) {
  const showApprove = ticketStatus === 'awaiting_review' && effectiveStep === 'tasks' && !outdated && !isArchived
  return (
    <div className={`bg-white p-4 rounded ${outdated ? 'border-2 border-yellow-400' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">Tasks</h2>
        <div className="flex items-center gap-2">
          {onToggleAutoApprove && !showApprove && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Auto-approve</span>
              <PillToggle value={autoApprove ?? false} onChange={onToggleAutoApprove} />
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
          {outdated && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-medium">Outdated</span>}
        </div>
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
