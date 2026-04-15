import { Routes, Route, NavLink, useMatch, Link, Navigate, useLocation } from 'react-router-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import WorkspacesPage from './pages/WorkspacesPage.tsx'
import WorkspacePage from './pages/WorkspacePage.tsx'
import ProjectPage from './pages/ProjectPage.tsx'
import TicketPage from './pages/TicketPage.tsx'
import TicketsBoardPage from './pages/TicketsBoardPage.tsx'
import SettingsPage from './pages/SettingsPage.tsx'
import ActionsPage from './pages/ActionsPage.tsx'
import DocsPage from './pages/DocsPage.tsx'
import { useWebSocketListener } from './hooks/useWebSocket.ts'
import { api } from './api.ts'
import { ThemeLoader } from './components/ThemeLoader.tsx'
import { useSelectedWorkspace } from './WorkspaceContext.tsx'
import { DropdownSelect } from './components/Dropdown.tsx'

function WebSocketListener() {
  const queryClient = useQueryClient()

  const onMessage = useCallback(
    (event: string, payload: any) => {
      if (
        event.startsWith('ticket:') ||
        event === 'ticket:queued' ||
        event === 'ticket:running' ||
        event === 'ticket:awaiting_review' ||
        event === 'ticket:advanced' ||
        event === 'ticket:error' ||
        event === 'ticket:batch_started'
      ) {
        queryClient.invalidateQueries({ queryKey: ['tickets'] })
        if (payload?.workspaceId) {
          queryClient.invalidateQueries({ queryKey: ['projects', payload.workspaceId] })
          if (payload?.ticketId) {
            queryClient.invalidateQueries({
              queryKey: ['ticketDetails', payload.workspaceId, payload.ticketId],
            })
          }
        }
      }
    },
    [queryClient]
  )

  useWebSocketListener(onMessage)
  return null
}

function WorkspaceSelect() {
  const { selectedWorkspaceId, setSelectedWorkspaceId } = useSelectedWorkspace()
  const { data: workspaces, isLoading } = useQuery({ queryKey: ['workspaces'], queryFn: api.getWorkspaces })

  const options = useMemo(() => {
    const base = [{ value: 'all', label: 'All Workspaces' }]
    if (workspaces) {
      for (const w of workspaces as any[]) {
        base.push({ value: w.id, label: w.name })
      }
    }
    return base
  }, [workspaces])

  return (
    <DropdownSelect
      className="w-44"
      options={options}
      value={selectedWorkspaceId}
      onChange={setSelectedWorkspaceId}
      placeholder={isLoading ? 'Loading...' : 'Select workspace'}
    />
  )
}

function WorkspaceNav() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const homeMatch = useMatch({ path: '/workspace', end: true })
  const workspaceMatch = useMatch({ path: '/workspace/:workspaceId', end: false })
  const isActive = !!homeMatch || !!workspaceMatch
  const currentWorkspaceId = workspaceMatch?.params.workspaceId

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.getWorkspaces,
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`text-sm hover:text-gray-900 flex items-center gap-1 ${isActive ? 'text-indigo-600 font-semibold' : 'text-gray-600'}`}
      >
        Workspaces
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-56 bg-white border border-gray-200 rounded shadow-lg py-1">
          <Link
            to="/workspace"
            onClick={() => setOpen(false)}
            className={`block px-4 py-2 text-sm hover:bg-gray-50 ${homeMatch ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
          >
            All Workspaces
          </Link>
          <div className="border-t border-gray-100 my-1" />
          {isLoading ? (
            <div className="px-4 py-2 text-sm text-gray-500">Loading...</div>
          ) : (
            (workspaces || []).map((w: any) => (
              <Link
                key={w.id}
                to={`/workspace/${w.id}`}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 text-sm hover:bg-gray-50 ${currentWorkspaceId === w.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
              >
                {w.name}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function App() {
  const { selectedWorkspaceId } = useSelectedWorkspace()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm hover:text-gray-900 ${isActive ? 'text-indigo-600 font-semibold' : 'text-gray-600'}`

  const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block text-sm py-2 hover:text-gray-900 ${isActive ? 'text-indigo-600 font-semibold' : 'text-gray-600'}`

  return (
    <>
      <ThemeLoader />
      <WebSocketListener />
      <div className="min-h-screen flex flex-col">
        <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between md:justify-start gap-6">
          <NavLink to="/" className="font-bold text-lg text-indigo-600">Lemon</NavLink>

          <div className="hidden md:flex items-center gap-6">
            <WorkspaceSelect />
            <NavLink
              to="/tickets"
              className={navLinkClass}
            >
              Tickets
            </NavLink>
            {selectedWorkspaceId === 'all' ? (
              <WorkspaceNav />
            ) : (
              <NavLink
                to={`/workspace/${selectedWorkspaceId}`}
                className={navLinkClass}
              >
                Workspace
              </NavLink>
            )}
            <NavLink
              to="/actions"
              className={navLinkClass}
            >
              Actions
            </NavLink>
            <NavLink
              to="/docs"
              className={navLinkClass}
            >
              Docs
            </NavLink>
            <NavLink
              to="/settings"
              className={navLinkClass}
            >
              Settings
            </NavLink>
          </div>

          <button
            type="button"
            className="md:hidden p-2 text-gray-600 hover:text-gray-900"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </nav>

        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-lg z-50 md:hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <span className="font-bold text-lg text-indigo-600">Lemon</span>
                <button
                  type="button"
                  className="p-2 text-gray-600 hover:text-gray-900"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                <WorkspaceSelect />
                <div className="flex flex-col gap-2">
                  <NavLink to="/tickets" className={mobileNavLinkClass}>Tickets</NavLink>
                  {selectedWorkspaceId === 'all' ? (
                    <WorkspaceNav />
                  ) : (
                    <NavLink to={`/workspace/${selectedWorkspaceId}`} className={mobileNavLinkClass}>Workspace</NavLink>
                  )}
                  <NavLink to="/actions" className={mobileNavLinkClass}>Actions</NavLink>
                  <NavLink to="/settings" className={mobileNavLinkClass}>Settings</NavLink>
                  <NavLink to="/docs" className={mobileNavLinkClass}>Docs</NavLink>
                </div>
              </div>
            </div>
          </>
        )}

        <main className="flex-1 p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/tickets" replace />} />
            <Route path="/workspace" element={<WorkspacesPage />} />
            <Route path="/workspace/:workspaceId" element={<WorkspacePage />} />
            <Route path="/workspace/:workspaceId/project/:projectId" element={<ProjectPage />} />
            <Route path="/workspace/:workspaceId/ticket/:ticketId" element={<TicketPage />} />
            <Route path="/tickets" element={<TicketsBoardPage />} />
            <Route path="/actions" element={<ActionsPage />} />
            <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
            <Route path="/settings/:tab" element={<SettingsPage />} />
            <Route path="/docs/*" element={<DocsPage />} />
          </Routes>
        </main>
      </div>
    </>
  )
}

export default App
