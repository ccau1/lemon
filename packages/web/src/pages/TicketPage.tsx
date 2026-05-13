import { useParams, Link } from 'react-router-dom'
import TicketContainer from '../containers/TicketContainer.tsx'

export default function TicketPage() {
  const { workspaceId, ticketId } = useParams<{ workspaceId: string; ticketId: string }>()
  if (!workspaceId || !ticketId) return <p>Invalid ticket</p>
  return (
    <div className="h-full">
      <div className="mb-4">
        <Link
          to={`/workspace/${workspaceId}`}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-indigo-600"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to workspace
        </Link>
      </div>
      <TicketContainer workspaceId={workspaceId} ticketId={ticketId} />
    </div>
  )
}
