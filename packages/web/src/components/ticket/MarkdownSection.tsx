import type { WorkflowStep } from '@lemon/shared'
import { useRef, useEffect, useState, useCallback } from 'react'
import MarkdownSections from '../MarkdownSections.tsx'
import PillToggle from '../common/PillToggle.tsx'
import { ExpandIcon } from './StatusIcon.tsx'

export const markdownWrapClasses =
  'text-sm bg-gray-50 p-3 rounded min-h-[100px] [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_code]:bg-gray-200 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-gray-200 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:mb-3 [&_a]:text-indigo-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:mb-3'

export interface MarkdownSectionProps {
  title: string
  content?: string
  outdated?: boolean
  step: WorkflowStep
  ticketStatus: string
  effectiveStep: WorkflowStep
  isRunning?: boolean
  isChatPending?: boolean
  isArchived?: boolean
  onApprove?: () => void
  onSendChat?: (message: string) => void
  onRegenerate?: (step: WorkflowStep) => void
  onCancelRun?: () => void
  autoApprove?: boolean
  onToggleAutoApprove?: (value: boolean) => void
  onExpand: () => void
  onCaptureScroll: (ratio: number) => void
  onMarkdownRef?: (el: HTMLDivElement | null) => void
  chatTurns?: Array<{ user: string; assistant?: string; status: 'fetching' | 'responded' | 'failed'; error?: string }>
}

export function MarkdownSection({
  title,
  content,
  outdated,
  step,
  ticketStatus,
  effectiveStep,
  isRunning,
  isChatPending,
  isArchived,
  onApprove,
  onSendChat,
  onRegenerate,
  onCancelRun,
  autoApprove,
  onToggleAutoApprove,
  onExpand,
  onCaptureScroll,
  onMarkdownRef,
  chatTurns,
}: MarkdownSectionProps) {
  const [comment, setComment] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const markdownRef = useRef<HTMLDivElement>(null)
  const showApprove = ticketStatus === 'awaiting_review' && step === effectiveStep && !outdated && !isArchived
  const canComment = (ticketStatus === 'awaiting_review' || ticketStatus === 'error') && !isArchived
  const isBusy = isChatPending || isRunning || !canComment
  const lastQuestion = chatTurns
    ?.slice()
    .reverse()
    .find((t) => t.assistant?.startsWith('QUESTION:'))
    ?.assistant
    ?.slice('QUESTION:'.length)
    .trim()
  const hasContent = !!content

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
    <div className={`bg-white p-4 rounded ${outdated ? 'border-2 border-yellow-400' : ''} flex flex-col h-full`}>
      <div className="flex items-start justify-between mb-2 shrink-0 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-semibold">{title}</h2>
          {outdated && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-medium">Outdated</span>}
        </div>
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
          {onCancelRun && isRunning && (
            <button
              className="inline-flex items-center justify-center px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 hover:text-red-700 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={onCancelRun}
              aria-label="Cancel Run"
              title="Cancel Run"
            >
              Cancel Run
            </button>
          )}
          {onRegenerate && (
            <button
              className="inline-flex items-center justify-center p-1.5 rounded bg-white/80 hover:bg-white border text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => onRegenerate(step)}
              aria-label="Regenerate"
              title="Regenerate"
              disabled={isRunning}
            >
              <svg className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          <button
            className="inline-flex items-center justify-center p-1.5 rounded bg-white/80 hover:bg-white border text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleExpand}
            aria-label="Expand"
            title="Expand"
            disabled={!hasContent}
          >
            <ExpandIcon />
          </button>
        </div>
      </div>
      <div ref={setMarkdownRef} className={`${markdownWrapClasses} flex-1 overflow-y-auto min-h-0 scrollbar-hide`}>
        {hasContent ? (
          <MarkdownSections content={content} />
        ) : lastQuestion ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6 max-w-lg w-full">
              <h3 className="text-indigo-900 font-medium mb-2">The AI needs clarification</h3>
              <p className="text-indigo-800 whitespace-pre-wrap">{lastQuestion}</p>
            </div>
          </div>
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
            className={`w-full border bg-white text-gray-900 placeholder-gray-400 px-3 py-2 rounded text-sm disabled:opacity-60 resize-none overflow-hidden transition-colors ${
              isChatPending ? 'border-indigo-400 pr-10 animate-pulse' : 'border-gray-400'
            }`}
            placeholder={
              isChatPending
                ? 'Revising...'
                : isArchived
                ? 'Archived'
                : !canComment
                ? 'Processing...'
                : !hasContent && lastQuestion
                ? `Answer the AI's question...`
                : `Comment on how to revise this ${title.toLowerCase()}...`
            }
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
