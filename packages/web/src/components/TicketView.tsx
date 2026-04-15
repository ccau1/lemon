import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { WorkflowStep } from '@lemon/shared'

const steps: WorkflowStep[] = ['spec', 'plan', 'tasks', 'implement']

function stepIndex(step: WorkflowStep) {
  return steps.indexOf(step)
}

function StatusIcon({ status, step, effectiveStep }: { status: string; step: WorkflowStep; effectiveStep: WorkflowStep }) {
  const idx = stepIndex(step)
  const effIdx = stepIndex(effectiveStep)
  const isError = status === 'error' && step === effectiveStep
  const isCurrent = idx === effIdx && status !== 'done'
  const isDone = idx < effIdx || status === 'done'

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

const markdownWrapClasses =
  'text-sm bg-gray-50 p-3 rounded min-h-[100px] overflow-x-auto [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_code]:bg-gray-200 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-gray-200 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:mb-3 [&_a]:text-indigo-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:mb-3'

export interface TicketViewProps {
  ticket: any
  spec?: any
  plan?: any
  tasks?: any[]
  implementation?: any
  activeTab: WorkflowStep
  effectiveStep: WorkflowStep
  chatOpen: boolean
  setChatOpen: (open: boolean) => void
  chatInput: string
  setChatInput: (value: string) => void
  chatHistory: Array<{ role: string; content: string }>
  lastResponse: string
  onChat: () => void
  onAdvance: () => void
  onQueue: () => void
  onRun: () => void
  onSaveSpec: (content: string) => void
  onSavePlan: (content: string) => void
  onSetTab: (step: WorkflowStep) => void
}

export default function TicketView({
  ticket,
  spec,
  plan,
  tasks,
  implementation,
  activeTab,
  effectiveStep,
  chatOpen,
  setChatOpen,
  chatInput,
  setChatInput,
  chatHistory,
  lastResponse,
  onChat,
  onAdvance,
  onQueue,
  onRun,
  onSaveSpec,
  onSavePlan,
  onSetTab,
}: TicketViewProps) {
  const ChatPanel = (
    <div className="bg-white p-4 rounded shadow h-full flex flex-col">
      <h2 className="font-semibold mb-2">Chat</h2>
      <div className="border rounded p-3 flex-1 overflow-y-auto bg-gray-50 mb-3 space-y-2 min-h-0">
        {chatHistory.map((m, i) => (
          <div key={i} className={`text-sm p-2 rounded ${m.role === 'user' ? 'bg-indigo-100' : 'bg-white border'}`}>
            <div className="text-xs font-bold uppercase text-gray-500 mb-1">{m.role}</div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="border px-3 py-2 rounded flex-1"
          placeholder="Message AI..."
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onChat()}
        />
        <button className="bg-indigo-600 text-white px-4 py-2 rounded" onClick={onChat}>Send</button>
      </div>
    </div>
  )

  const TabContent = () => {
    switch (activeTab) {
      case 'spec':
        return (
          <div className="bg-white p-4 rounded shadow">
            <h2 className="font-semibold mb-2">Spec</h2>
            <div className={markdownWrapClasses}>
              {spec?.content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{spec.content}</ReactMarkdown> : '-'}
            </div>
            {lastResponse && (
              <button className="mt-2 text-indigo-600 text-sm" onClick={() => onSaveSpec(lastResponse)}>
                Save latest response as spec
              </button>
            )}
          </div>
        )
      case 'plan':
        return (
          <div className="bg-white p-4 rounded shadow">
            <h2 className="font-semibold mb-2">Plan</h2>
            <div className={markdownWrapClasses}>
              {plan?.content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan.content}</ReactMarkdown> : '-'}
            </div>
            {lastResponse && (
              <button className="mt-2 text-indigo-600 text-sm" onClick={() => onSavePlan(lastResponse)}>
                Save latest response as plan
              </button>
            )}
          </div>
        )
      case 'tasks':
        return (
          <div className="bg-white p-4 rounded shadow">
            <h2 className="font-semibold mb-2">Tasks</h2>
            <ul className="text-sm space-y-1">
              {tasks && tasks.length ? tasks.map((t: any) => (
                <li key={t.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={t.done} readOnly />
                  <span>{t.description}</span>
                </li>
              )) : <li>-</li>}
            </ul>
          </div>
        )
      case 'implement':
        return (
          <div className="bg-white p-4 rounded shadow">
            <h2 className="font-semibold mb-2">Implementation</h2>
            <div className={markdownWrapClasses}>
              {implementation?.content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{implementation.content}</ReactMarkdown> : '-'}
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">{ticket.title}</h1>
          {ticket.description && (
            <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{ticket.description}</div>
          )}
          <div className="text-sm text-gray-500 uppercase tracking-wide mt-1">{ticket.status}</div>
        </div>
        <div className="flex gap-2">
          <button className="bg-gray-200 px-3 py-2 rounded text-sm" onClick={onQueue}>Queue</button>
          <button className="bg-indigo-600 text-white px-3 py-2 rounded text-sm" onClick={onRun}>Run</button>
          <button className="bg-green-600 text-white px-3 py-2 rounded text-sm" onClick={onAdvance}>Advance</button>
        </div>
      </div>

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
            <StatusIcon status={ticket.status} step={step} effectiveStep={effectiveStep} />
            {step}
          </button>
        ))}
      </div>

      <div className="lg:hidden mb-3">
        <button
          className="w-full bg-indigo-600 text-white px-4 py-2 rounded"
          onClick={() => setChatOpen(true)}
        >
          Open Chat
        </button>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
          <div className="overflow-y-auto h-full">
            <TabContent />
          </div>
          <div className="hidden lg:block h-full">
            {ChatPanel}
          </div>
        </div>
      </div>

      {chatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 lg:hidden">
          <div className="bg-white rounded-lg w-full max-w-2xl h-[80vh] flex flex-col p-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold">Chat</h2>
              <button className="text-gray-500 hover:text-gray-800" onClick={() => setChatOpen(false)}>Close</button>
            </div>
            <div className="flex-1 min-h-0">
              {ChatPanel}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
