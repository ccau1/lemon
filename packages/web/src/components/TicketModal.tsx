import TicketContainer from '../containers/TicketContainer.tsx'

export interface TicketModalProps {
  workspaceId: string
  ticketId: string
  onClose: () => void
}

export default function TicketModal({ workspaceId, ticketId, onClose }: TicketModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden relative">
        <button
          className="absolute top-4 right-6 p-2 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 z-10"
          onClick={onClose}
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex-1 overflow-hidden pt-14 pr-16 pb-6 pl-6">
          <TicketContainer workspaceId={workspaceId} ticketId={ticketId} />
        </div>
      </div>
    </div>
  )
}
