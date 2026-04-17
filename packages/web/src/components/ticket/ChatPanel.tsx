import { useRef, useEffect, useState } from 'react'

export function ChatPanel({ chatTurns }: { chatTurns: Array<{ user: string; assistant?: string; status: 'fetching' | 'responded' | 'failed'; error?: string }> }) {
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
    <div className="hidden lg:flex flex-col h-full bg-white rounded overflow-hidden">
      <div className="flex flex-col h-full p-4">
        <h2 className="font-semibold mb-2">Chat</h2>
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50 rounded p-3 space-y-3 min-h-0">
        {chatTurns.length === 0 && (
          <div className="text-sm text-gray-400">No messages yet</div>
        )}
        {chatTurns.map((turn, idx) => {
          const isCollapsed = collapsed.has(idx)
          const canToggle = turn.status === 'responded'
          const statusColor = turn.status === 'fetching' ? 'text-indigo-600' : turn.status === 'responded' ? 'text-green-600' : 'text-red-600'
          const isQuestion = turn.assistant?.startsWith('QUESTION:')
          const assistantContent = isQuestion ? turn.assistant!.slice('QUESTION:'.length).trim() : turn.assistant
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
                <div className={`text-sm p-2 rounded border ${isQuestion ? 'bg-indigo-50 border-indigo-200' : 'bg-white'}`}>
                  <div className={`text-xs font-bold uppercase mb-1 ${isQuestion ? 'text-indigo-600' : 'text-gray-500'}`}>{isQuestion ? 'AI Question' : 'assistant'}</div>
                  <div className="whitespace-pre-wrap">{assistantContent}</div>
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
  </div>
  )
}
