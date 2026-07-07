import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import './i18n.ts'
import './index.css'
import App from './App.tsx'
import { WorkspaceProvider } from './contexts/WorkspaceContext.tsx'
import { ConnectedProvider } from './contexts/ConnectedContext.tsx'

const Router = typeof window !== 'undefined' && window.electronAPI ? HashRouter : BrowserRouter

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConnectedProvider>
        <WorkspaceProvider>
          <Router>
            <App />
          </Router>
        </WorkspaceProvider>
      </ConnectedProvider>
    </QueryClientProvider>
  </StrictMode>,
)
