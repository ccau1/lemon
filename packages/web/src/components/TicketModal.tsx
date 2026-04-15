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
      <div className="bg-white rounded-lg w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="font-semibold text-lg">Ticket</h2>
          <button className="text-gray-500 hover:text-gray-800" onClick={onClose}>Close</button>
        </div>
        <div className="flex-1 overflow-hidden p-6">
          <TicketContainer workspaceId={workspaceId} ticketId={ticketId} />
        </div>
      </div>
    </div>
  )
}
