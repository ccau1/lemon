import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type WorkspaceSelection = 'all' | string

interface WorkspaceCtx {
  selectedWorkspaceId: WorkspaceSelection
  setSelectedWorkspaceId: (id: WorkspaceSelection) => void
}

const WorkspaceContext = createContext<WorkspaceCtx | null>(null)

const LS_KEY = 'lemon_selected_workspace'

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<WorkspaceSelection>('all')

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) setSelectedWorkspaceId(saved)
  }, [])

  const setAndPersist = (id: WorkspaceSelection) => {
    setSelectedWorkspaceId(id)
    localStorage.setItem(LS_KEY, id)
  }

  return (
    <WorkspaceContext.Provider value={{ selectedWorkspaceId, setSelectedWorkspaceId: setAndPersist }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useSelectedWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useSelectedWorkspace must be used within WorkspaceProvider')
  return ctx
}
