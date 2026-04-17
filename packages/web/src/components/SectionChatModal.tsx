export interface SectionChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface SectionChatModalProps {
  target: { title: string; subtitle: string } | null
  history: SectionChatMessage[]
  onClose: () => void
  onSend: (message: string) => void
  isLoading?: boolean
}

export default function SectionChatModal({ target, history, onClose, onSend, isLoading }: SectionChatModalProps) {
  if (!target) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl h-[60vh] flex flex-col p-4">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h3 className="font-semibold">{target.title}</h3>
            <p className="text-sm text-gray-500 truncate max-w-md">{target.subtitle}</p>
          </div>
          <button className="text-gray-500 hover:text-gray-800" onClick={onClose}>Close</button>
        </div>
        <div className="flex-1 overflow-y-auto bg-gray-50 border rounded p-3 space-y-2 mb-3">
          {history.map((m, i) => (
            <div key={i} className={`text-sm p-2 rounded ${m.role === 'user' ? 'bg-indigo-100' : 'bg-white border'}`}>
              <div className="text-xs font-bold uppercase text-gray-500 mb-1">{m.role}</div>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
          {isLoading && (
            <div className="text-sm text-gray-500">Thinking...</div>
          )}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const input = (e.currentTarget.elements.namedItem('msg') as HTMLInputElement)
            if (input.value.trim()) {
              onSend(input.value.trim())
              input.value = ''
            }
          }}
        >
          <input name="msg" className="border px-3 py-2 rounded flex-1" placeholder="Comment..." autoFocus />
          <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded" disabled={isLoading}>Send</button>
        </form>
      </div>
    </div>
  )
}
