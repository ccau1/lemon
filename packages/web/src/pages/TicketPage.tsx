import { useParams } from 'react-router-dom'
import TicketContainer from '../containers/TicketContainer.tsx'

export default function TicketPage() {
  const { workspaceId, ticketId } = useParams<{ workspaceId: string; ticketId: string }>()
  if (!workspaceId || !ticketId) return <p>Invalid ticket</p>
  return (
    <div className="h-full">
      <TicketContainer workspaceId={workspaceId} ticketId={ticketId} />
    </div>
  )
}
