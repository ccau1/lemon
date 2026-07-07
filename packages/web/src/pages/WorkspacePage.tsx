import { useParams } from 'react-router-dom'
import WorkspaceView from '../components/WorkspaceView.tsx'

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  if (!workspaceId) return <p>Loading...</p>
  return <WorkspaceView workspaceId={workspaceId} layer="page" />
}
